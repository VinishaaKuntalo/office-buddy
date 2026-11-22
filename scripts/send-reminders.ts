import { createClient } from '@supabase/supabase-js';
import { addDateDays, todayInTimezone } from '../src/lib/dates';
import { planReminders } from '../src/reminders/planner';
import type { ApprovedAbsence, AttendanceEvent, AttendancePolicy, Holiday } from '../src/types/domain';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const resendKey = process.env.RESEND_API_KEY;
const from = process.env.REMINDER_FROM_EMAIL || 'Office Buddy <onboarding@resend.dev>';
const appUrl = process.env.APP_URL || '';
const sendTest = process.env.SEND_TEST_EMAIL === 'true';

if (!supabaseUrl || !serviceRoleKey || !resendKey) {
  console.log('Reminders are not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY). Skipping.');
  process.exit(0);
}

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

function check<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  if (result.data == null) throw new Error('No data returned.');
  return result.data;
}

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);

async function sendEmail(to: string, subject: string, text: string) {
  const footer = appUrl ? `\n\nOpen Office Buddy: ${appUrl}` : '';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: `${text}${footer}\n\nTurn these off in Office Buddy → Settings → Reminders.`,
      html: `<p>${escapeHtml(text)}</p>${appUrl ? `<p><a href="${escapeHtml(appUrl)}">Open Office Buddy</a></p>` : ''}`
        + '<p style="color:#64748b;font-size:12px">Turn these off in Office Buddy → Settings → Reminders.</p>',
    }),
  });
  if (!response.ok) throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
}

async function processUser(userId: string, reminderTime: string, checkinTime: string, reminderTimezone: string) {
  const profile = check(await db.from('profiles').select('timezone,onboarding_completed').eq('id', userId).single());
  if (!profile.onboarding_completed) return 0;
  const timezone = reminderTimezone || profile.timezone;
  const today = todayInTimezone(timezone);
  const start = addDateDays(today, -45);
  const end = addDateDays(today, 45);

  const [assignments, attendance, absences, holidays, authUser] = await Promise.all([
    db.from('user_policy_assignments').select('policy_id,effective_from,effective_to').eq('user_id', userId),
    db.from('attendance_events').select('*').eq('user_id', userId).gte('event_date', start).lte('event_date', end),
    db.from('approved_absences').select('*').eq('user_id', userId).lte('start_date', end).gte('end_date', start),
    db.from('holidays').select('*').or(`user_id.eq.${userId},organization_id.not.is.null`)
      .gte('holiday_date', start).lte('holiday_date', end),
    db.auth.admin.getUserById(userId),
  ]);
  if (authUser.error) throw authUser.error;
  const email = authUser.data.user?.email;
  if (!email) return 0;
  const assignmentRows = check(assignments) ?? [];
  const policyRows = (check(await db.from('attendance_policies').select('*')
    .in('id', assignmentRows.map((row) => row.policy_id))) ?? []) as AttendancePolicy[];
  const policies = assignmentRows
    .map((row) => policyRows.find((policy) => policy.id === row.policy_id))
    .filter((policy): policy is AttendancePolicy => Boolean(policy));
  const active = assignmentRows.find((row) => row.effective_from <= today && (!row.effective_to || row.effective_to >= today));
  const policy = policies.find((entry) => entry.id === active?.policy_id);
  if (!policy) return 0;

  if (sendTest) {
    await sendEmail(email, 'Office Buddy reminders are set up',
      `Reminders are working. You'll get a weekly plan at 08:00 on the first day of each reporting week, a reminder at ${reminderTime.slice(0, 5)} the evening before each suggested office day, and a check-in at ${checkinTime.slice(0, 5)} on weekdays you haven't logged yet (${timezone}).`);
    return 1;
  }
  const reminders = planReminders({
    now: new Date(), timezone, reminderTime, checkinTime, policy, policies,
    attendance: (check(attendance) ?? []) as AttendanceEvent[],
    absences: (check(absences) ?? []) as ApprovedAbsence[],
    holidays: (check(holidays) ?? []) as Holiday[],
  });

  let sent = 0;
  for (const reminder of reminders) {
    // Claim the deduplication key first so overlapping or retried runs never email twice.
    const claimed = check(await db.from('notification_log').upsert({
      user_id: userId,
      notification_type: 'office_reminder',
      deduplication_key: reminder.deduplicationKey,
      title: reminder.title,
      message: reminder.message,
    }, { onConflict: 'user_id,deduplication_key', ignoreDuplicates: true }).select('id')) ?? [];
    if (claimed.length === 0) continue;
    try {
      await sendEmail(email, reminder.title, reminder.message);
      sent += 1;
    } catch (cause) {
      await db.from('notification_log').delete().eq('id', claimed[0].id);
      throw cause;
    }
  }
  return sent;
}

const preferences = check(await db.from('notification_preferences')
  .select('user_id,reminder_time,checkin_time,reminder_timezone').eq('office_reminder_enabled', true)) ?? [];
let sent = 0;
let failures = 0;
for (const preference of preferences) {
  try {
    sent += await processUser(preference.user_id, preference.reminder_time, preference.checkin_time ?? '16:00', preference.reminder_timezone);
  } catch (cause) {
    failures += 1;
    console.error(`Reminder failed for one user: ${cause instanceof Error ? cause.message : JSON.stringify(cause)}`);
  }
}
console.log(`Checked ${preferences.length} users with reminders on; sent ${sent} emails; ${failures} failures.`);
if (failures > 0) process.exit(1);
