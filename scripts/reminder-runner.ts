import { createClient } from '@supabase/supabase-js';
import * as webpush from 'web-push';
import { addDateDays,todayInTimezone } from '../src/lib/dates';
import { planReminders } from '../src/reminders/planner';
import type { ApprovedAbsence,AttendanceEvent,AttendancePolicy,Holiday } from '../src/types/domain';

export async function runReminders(env: Record<string,string|undefined>) {
  const supabaseUrl=env.SUPABASE_URL;
  const serviceRoleKey=env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey=env.RESEND_API_KEY;
  const vapidPublicKey=env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey=env.VAPID_PRIVATE_KEY;
  const from=env.REMINDER_FROM_EMAIL||'Office Buddy <onboarding@resend.dev>';
  const appUrl=env.APP_URL||'';
  const sendTest=env.SEND_TEST_EMAIL==='true';
  const pushConfigured=Boolean(vapidPublicKey&&vapidPrivateKey);

  if(!supabaseUrl||!serviceRoleKey||(!resendKey&&!pushConfigured)) {
    console.log('Reminders are not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and RESEND_API_KEY or VAPID keys). Skipping.');
    throw new Error('Reminder configuration is incomplete.');
  }
  if(pushConfigured) {
    webpush.setVapidDetails(appUrl.startsWith('https://')? appUrl:'mailto:office-buddy@example.com',vapidPublicKey!,vapidPrivateKey!);
  }

  const db=createClient(supabaseUrl,serviceRoleKey,{ auth: { persistSession: false,autoRefreshToken: false } });

  function check<T>(result: { data: T; error: unknown }): NonNullable<T> {
    if(result.error) throw result.error;
    if(result.data==null) throw new Error('No data returned.');
    return result.data;
  }

  const escapeHtml=(value: string) => value.replace(/[&<>"]/g,(char) => `&#${char.charCodeAt(0)};`);

  async function sendEmail(to: string,subject: string,text: string) {
    const footer=appUrl? `\n\nOpen Office Buddy: ${appUrl}`:'';
    const response=await fetch('https://api.resend.com/emails',{
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`,'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: `${text}${footer}\n\nTurn these off in Office Buddy → Settings → Reminders.`,
        html: `<p>${escapeHtml(text)}</p>${appUrl? `<p><a href="${escapeHtml(appUrl)}">Open Office Buddy</a></p>`:''}`
          +'<p style="color:#64748b;font-size:12px">Turn these off in Office Buddy → Settings → Reminders.</p>',
      }),
    });
    if(!response.ok) throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }

  interface Preference {
    user_id: string;
    reminder_time: string;
    checkin_time: string|null;
    reminder_timezone: string;
    email_enabled: boolean|null;
  }

  interface PushSubscriptionRow { id: string; endpoint: string; p256dh: string; auth: string }

  async function sendPush(subscription: PushSubscriptionRow,title: string,body: string,tag: string) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint,keys: { p256dh: subscription.p256dh,auth: subscription.auth } },
        JSON.stringify({ title,body,tag,url: appUrl||undefined }),
        { TTL: 6*60*60 },
      );
      return true;
    } catch(cause) {
      const status=(cause as { statusCode?: number }).statusCode;
      // The device unsubscribed or the subscription expired; forget it.
      if(status===404||status===410) {
        const { error }=await db.from('push_subscriptions').delete().eq('id',subscription.id);
        if(error) throw error;
        return false;
      }
      throw cause;
    }
  }

  async function processUser(preference: Preference) {
    const userId=preference.user_id;
    const reminderTime=preference.reminder_time;
    const checkinTime=preference.checkin_time??'16:00';
    const profile=check(await db.from('profiles').select('timezone,onboarding_completed').eq('id',userId).single());
    if(!profile.onboarding_completed) return 0;
    const timezone=preference.reminder_timezone||profile.timezone;
    const today=todayInTimezone(timezone);
    const start=addDateDays(today,-45);
    const end=addDateDays(today,45);

    const [assignments,attendance,absences,holidays,authUser,subscriptionRows]=await Promise.all([
      db.from('user_policy_assignments').select('policy_id,effective_from,effective_to').eq('user_id',userId),
      db.from('attendance_events').select('*').eq('user_id',userId).gte('event_date',start).lte('event_date',end),
      db.from('approved_absences').select('*').eq('user_id',userId).lte('start_date',end).gte('end_date',start),
      db.from('holidays').select('*').or(`user_id.eq.${userId},organization_id.not.is.null`)
        .gte('holiday_date',start).lte('holiday_date',end),
      db.auth.admin.getUserById(userId),
      pushConfigured
        ? db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',userId)
        :Promise.resolve({ data: [],error: null }),
    ]);
    if(authUser.error) throw authUser.error;
    const email=preference.email_enabled!==false&&resendKey? authUser.data.user?.email:undefined;
    const subscriptions=(check(subscriptionRows)??[]) as PushSubscriptionRow[];
    // Nothing to deliver to: leave reminders unclaimed so they can still go out once a channel is enabled.
    if(!email&&subscriptions.length===0) return 0;

    const assignmentRows=check(assignments)??[];
    const policyRows=(check(await db.from('attendance_policies').select('*')
      .in('id',assignmentRows.map((row) => row.policy_id)))??[]) as AttendancePolicy[];
    const policies=assignmentRows
      .map((row) => policyRows.find((policy) => policy.id===row.policy_id))
      .filter((policy): policy is AttendancePolicy => Boolean(policy));
    const active=assignmentRows.find((row) => row.effective_from<=today&&(!row.effective_to||row.effective_to>=today));
    const policy=policies.find((entry) => entry.id===active?.policy_id);
    if(!policy) return 0;

    async function deliver(title: string,message: string,tag: string) {
      let delivered=0;
      const errors: unknown[]=[];
      if(email) {
        try {
          await sendEmail(email,title,message);
          delivered+=1;
        } catch(cause) {
          errors.push(cause);
        }
      }
      for(const subscription of subscriptions) {
        try {
          if(await sendPush(subscription,title,message,tag)) delivered+=1;
        } catch(cause) {
          errors.push(cause);
        }
      }
      if(delivered===0&&errors.length>0) throw errors[0];
      if(errors.length>0) {
        console.error(`Reminder partially delivered; ${errors.length} channel(s) failed.`);
      }
      return delivered;
    }

    if(sendTest) {
      return deliver('Office Buddy reminders are set up',
        `Reminders are working. You'll get a weekly plan at 08:00 on the first day of each reporting week, a same-day reminder at ${reminderTime.slice(0,5)} on every eligible weekday while that week's target is incomplete (not just preferred days), and a check-in at ${checkinTime.slice(0,5)} on eligible weekdays you haven't logged yet while the week is incomplete (${timezone}). Exact delivery times depend on the scheduled job.`,
        'test');
    }
    const reminders=planReminders({
      now: new Date(),timezone,reminderTime,checkinTime,policy,policies,
      attendance: (check(attendance)??[]) as AttendanceEvent[],
      absences: (check(absences)??[]) as ApprovedAbsence[],
      holidays: (check(holidays)??[]) as Holiday[],
    });

    let sent=0;
    for(const reminder of reminders) {
      // Claim the deduplication key first so overlapping or retried runs never notify twice.
      const claimed=check(await db.from('notification_log').upsert({
        user_id: userId,
        notification_type: 'office_reminder',
        deduplication_key: reminder.deduplicationKey,
        title: reminder.title,
        message: reminder.message,
      },{ onConflict: 'user_id,deduplication_key',ignoreDuplicates: true }).select('id'))??[];
      if(claimed.length===0) continue;
      try {
        sent+=await deliver(reminder.title,reminder.message,reminder.deduplicationKey);
      } catch(cause) {
        const { error }=await db.from('notification_log').delete().eq('id',claimed[0].id);
        if(error) throw error;
        throw cause;
      }
    }
    return sent;
  }

  const preferences=(check(await db.from('notification_preferences')
    .select('user_id,reminder_time,checkin_time,reminder_timezone,email_enabled')
    .eq('office_reminder_enabled',true))??[]) as Preference[];
  let sent=0;
  let failures=0;
  for(const preference of preferences) {
    try {
      sent+=await processUser(preference);
    } catch(cause) {
      failures+=1;
      console.error(`Reminder failed for one user: ${cause instanceof Error? cause.message:JSON.stringify(cause)}`);
    }
  }
  console.log(`Checked ${preferences.length} users with reminders on; delivered ${sent} notifications (email + push); ${failures} failures.`);
  if(failures>0) throw new Error(`${failures} user reminder delivery failure(s).`);
  return { checked: preferences.length,delivered: sent,failures };
}
