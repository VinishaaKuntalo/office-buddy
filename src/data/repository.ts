import { format } from 'date-fns';
import { getMonthEnd, todayInTimezone } from '../lib/dates';
import { requireSupabase } from '../lib/supabase';
import type {
  ApprovedAbsence,
  AttendanceEvent,
  AttendancePolicy,
  Holiday,
  NotificationItem,
  NotificationPreferences,
  Profile,
} from '../types/domain';
import type { RulesResult } from '../rules/engine';

export interface UserData {
  profile: Profile;
  policy: AttendancePolicy;
  policies: AttendancePolicy[];
  attendance: AttendanceEvent[];
  absences: ApprovedAbsence[];
  holidays: Holiday[];
  notifications: NotificationItem[];
  notificationPreferences: NotificationPreferences;
  officeLocation: { id: string; name: string } | null;
}

export async function fetchUserData(userId: string): Promise<UserData> {
  const client = requireSupabase();
  const { data: profile, error: profileError } = await client.from('profiles').select('*').eq('id', userId).single();
  if (profileError) throw profileError;
  if (!profile) throw new Error('Your profile could not be found.');
  const today = todayInTimezone(profile.timezone);
  const currentMonth = new Date(`${today}T00:00:00`);
  const monthStart = format(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1), 'yyyy-MM-dd');
  const monthEnd = getMonthEnd(format(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1), 'yyyy-MM-dd'));

  const [
    assignmentsResult,
    attendanceResult,
    absenceResult,
    holidayResult,
    notificationResult,
    preferencesResult,
    locationResult,
  ] = await Promise.all([
    client.from('user_policy_assignments')
      .select('policy_id,effective_from,effective_to')
      .eq('user_id', userId)
      .order('effective_from', { ascending: false }),
    client.from('attendance_events').select('*').eq('user_id', userId)
      .gte('event_date', monthStart).lte('event_date', monthEnd).order('event_date', { ascending: false }),
    client.from('approved_absences').select('*').eq('user_id', userId)
      .lte('start_date', monthEnd).gte('end_date', monthStart).order('start_date'),
    client.from('holidays').select('*').or(`user_id.eq.${userId},organization_id.not.is.null`)
      .gte('holiday_date', monthStart).lte('holiday_date', monthEnd).order('holiday_date'),
    client.from('notification_log').select('*').eq('user_id', userId)
      .lte('due_at', new Date().toISOString()).order('due_at', { ascending: false }).limit(50),
    client.from('notification_preferences').select('*').eq('user_id', userId).single(),
    client.from('office_locations').select('id,name').eq('user_id', userId).limit(1).maybeSingle(),
  ]);

  const errors = [
    profileError,
    assignmentsResult.error,
    attendanceResult.error,
    absenceResult.error,
    holidayResult.error,
    notificationResult.error,
    preferencesResult.error,
    locationResult.error,
  ].filter(Boolean);
  if (errors.length) throw errors[0];
  const assignments = assignmentsResult.data ?? [];
  const policyIds = [...new Set(assignments.map((assignment) => assignment.policy_id))];
  if (policyIds.length === 0) throw new Error('Your attendance policy is missing. Please contact support or complete onboarding again.');
  const { data: policyRows, error: policyError } = await client.from('attendance_policies')
    .select('*').in('id', policyIds);
  if (policyError) throw policyError;
  const policiesById = new Map((policyRows ?? []).map((entry) => [entry.id, entry as AttendancePolicy]));
  const activeAssignment = assignments.find((assignment) =>
    assignment.effective_from <= today && (!assignment.effective_to || assignment.effective_to >= today),
  );
  const policy = activeAssignment ? policiesById.get(activeAssignment.policy_id) : undefined;
  if (!policy) throw new Error('Your attendance policy is missing. Please contact support or complete onboarding again.');
  const policies = assignments.map((assignment) => policiesById.get(assignment.policy_id))
    .filter((entry): entry is AttendancePolicy => Boolean(entry));

  return {
    profile: profile as Profile,
    policy,
    policies,
    attendance: (attendanceResult.data ?? []) as AttendanceEvent[],
    absences: (absenceResult.data ?? []) as ApprovedAbsence[],
    holidays: (holidayResult.data ?? []) as Holiday[],
    notifications: (notificationResult.data ?? []) as NotificationItem[],
    notificationPreferences: preferencesResult.data as NotificationPreferences,
    officeLocation: locationResult.data,
  };
}

export async function fetchAttendanceRange(userId: string, start: string, end: string) {
  const { data, error } = await requireSupabase().from('attendance_events').select('*')
    .eq('user_id', userId).gte('event_date', start).lte('event_date', end)
    .order('event_date', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AttendanceEvent[];
}

export async function fetchCalendarData(userId: string, start: string, end: string) {
  const client = requireSupabase();
  const [attendance, absences, holidays] = await Promise.all([
    client.from('attendance_events').select('*').eq('user_id', userId)
      .gte('event_date', start).lte('event_date', end).order('event_date'),
    client.from('approved_absences').select('*').eq('user_id', userId)
      .lte('start_date', end).gte('end_date', start).order('start_date'),
    client.from('holidays').select('*').or(`user_id.eq.${userId},organization_id.not.is.null`)
      .gte('holiday_date', start).lte('holiday_date', end).order('holiday_date'),
  ]);
  const error = attendance.error ?? absences.error ?? holidays.error;
  if (error) throw error;
  return {
    attendance: (attendance.data ?? []) as AttendanceEvent[],
    absences: (absences.data ?? []) as ApprovedAbsence[],
    holidays: (holidays.data ?? []) as Holiday[],
  };
}

export async function fetchAttendancePage(input: {
  userId: string;
  fromDate?: string;
  toDate?: string;
  status?: string;
  source?: string;
  page: number;
  pageSize: number;
}) {
  let query = requireSupabase().from('attendance_events').select('*', { count: 'exact' }).eq('user_id', input.userId);
  if (input.fromDate) query = query.gte('event_date', input.fromDate);
  if (input.toDate) query = query.lte('event_date', input.toDate);
  if (input.status) query = query.eq('status', input.status as AttendanceEvent['status']);
  if (input.source) query = query.eq('source', input.source as AttendanceEvent['source']);
  const start = input.page * input.pageSize;
  const { data, error, count } = await query
    .order('event_date', { ascending: false })
    .range(start, start + input.pageSize - 1);
  if (error) throw error;
  return { rows: (data ?? []) as AttendanceEvent[], total: count ?? 0 };
}

export async function saveAttendance(input: {
  id?: string;
  userId: string;
  date: string;
  status: AttendanceEvent['status'];
  notes: string;
}) {
  const client = requireSupabase();
  const payload = {
    user_id: input.userId,
    event_date: input.date,
    status: input.status,
    notes: input.notes,
    source: 'manual' as const,
  };
  const result = input.id
    ? await client.from('attendance_events').update(payload).eq('id', input.id).select().single()
    : await client.from('attendance_events').insert(payload).select().single();
  if (result.error) throw result.error;
  return result.data;
}

export async function deleteAttendance(id: string) {
  const { error } = await requireSupabase().from('attendance_events').delete().eq('id', id);
  if (error) throw error;
}

export async function saveProfile(userId: string, input: Partial<Profile>) {
  const { error } = await requireSupabase().from('profiles')
    .update(input).eq('id', userId);
  if (error) throw error;
}

export async function savePolicy(input: Partial<AttendancePolicy>, effectiveFrom: string) {
  const { error } = await requireSupabase().rpc('set_my_attendance_policy', {
    p_required_days: input.required_days_per_week ?? 3,
    p_preferred_weekdays: input.preferred_weekdays ?? [2, 3, 4],
    p_eligible_weekdays: input.eligible_weekdays ?? [1, 2, 3, 4, 5],
    p_month_end_rule: input.month_end_rule ?? 'month_end_monday_to_previous_month',
    p_effective_from: effectiveFrom,
    p_name: input.name ?? 'Personal policy',
    p_reduce_for_approved_absences: input.reduce_for_approved_absences,
    p_reduce_for_holidays: input.reduce_for_holidays,
  });
  if (error) throw error;
}

export async function saveOfficeLocation(userId: string, name: string, id?: string, timezone = 'America/Toronto') {
  const client = requireSupabase();
  const { data: existing, error: lookupError } = id
    ? { data: { id }, error: null }
    : await client.from('office_locations').select('id').eq('user_id', userId).maybeSingle();
  if (lookupError) throw lookupError;
  const result = existing?.id
    ? await client.from('office_locations').update({ name, timezone }).eq('id', existing.id)
    : await client.from('office_locations').insert({ user_id: userId, name, timezone });
  if (result.error) throw result.error;
}

export async function saveAbsence(input: {
  id?: string;
  userId: string;
  startDate: string;
  endDate: string;
  reason: string;
}) {
  const payload = {
    user_id: input.userId,
    start_date: input.startDate,
    end_date: input.endDate,
    reason: input.reason,
    source: 'manual',
  } as const;
  const result = input.id
    ? await requireSupabase().from('approved_absences').update(payload).eq('id', input.id)
    : await requireSupabase().from('approved_absences').insert(payload);
  const { error } = result;
  if (error) throw error;
}

export async function deleteAbsence(id: string) {
  const { error } = await requireSupabase().from('approved_absences').delete().eq('id', id);
  if (error) throw error;
}

export async function saveHoliday(input: { id?: string; userId: string; date: string; name: string }) {
  const payload = {
    user_id: input.userId,
    holiday_date: input.date,
    name: input.name,
    source: 'manual',
  } as const;
  const result = input.id
    ? await requireSupabase().from('holidays').update(payload).eq('id', input.id)
    : await requireSupabase().from('holidays').insert(payload);
  const { error } = result;
  if (error) throw error;
}

export async function deleteHoliday(id: string) {
  const { error } = await requireSupabase().from('holidays').delete().eq('id', id);
  if (error) throw error;
}

export async function saveNotificationPreferences(userId: string, input: Partial<NotificationPreferences>) {
  const { error } = await requireSupabase().from('notification_preferences')
    .update(input).eq('user_id', userId);
  if (error) throw error;
}

export async function markNotificationRead(id: string) {
  const { error } = await requireSupabase().from('notification_log')
    .update({ read_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function syncStatusNotifications(userId: string, result: RulesResult, enabled: boolean) {
  if (!enabled) return false;
  const weekKey = result.reportingWeek.start;
  const notices: Array<{
    notification_type: string;
    deduplication_key: string;
    title: string;
    message: string;
  }> = [];
  if (result.weeklyStatus === 'At risk' || result.weeklyStatus === 'Action required') {
    notices.push({
      notification_type: 'at_risk',
      deduplication_key: `at-risk:${weekKey}`,
      title: 'Your week is at risk',
      message: result.explanationMessages.find((message) => message.includes('No eligible office days'))
        ?? `${result.remainingOfficeDays} office ${result.remainingOfficeDays === 1 ? 'day is' : 'days are'} still needed, with ${result.eligibleRemainingDates.length} eligible dates remaining.`,
    });
  } else if (result.remainingOfficeDays === 1) {
    notices.push({
      notification_type: 'one_more_day_needed',
      deduplication_key: `one-more:${weekKey}`,
      title: 'One more office day needed',
      message: result.recommendedNextOfficeDate
        ? `Your recommended remaining day is ${result.recommendedNextOfficeDate}.`
        : 'You still need one office day this week.',
    });
  }
  if (result.canChill) {
    notices.push({
      notification_type: 'weekly_target_complete',
      deduplication_key: `weekly-complete:${weekKey}`,
      title: 'Weekly target complete',
      message: 'You completed your weekly office target. You can chill for the rest of the week.',
    });
  }
  if (result.monthly.status === 'Complete') {
    notices.push({
      notification_type: 'monthly_target_complete',
      deduplication_key: `monthly-complete:${result.reportingMonth}`,
      title: 'Monthly target complete',
      message: `You have completed your expected office attendance for ${result.reportingMonth}.`,
    });
  }
  const adjustmentMessage = result.weekly.explanationMessages.find((message) => message.includes('counted toward your target'));
  if (adjustmentMessage) {
    notices.push({
      notification_type: 'approved_absence_adjustment',
      deduplication_key: `weekly-adjustment:${weekKey}`,
      title: 'Absence or holiday counted this week',
      message: adjustmentMessage,
    });
  }
  const activeKeys = new Set(notices.map((notice) => notice.deduplication_key));
  const resolvedKeys = [`at-risk:${weekKey}`, `one-more:${weekKey}`].filter((key) => !activeKeys.has(key));
  const resolved = await requireSupabase().from('notification_log')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).in('deduplication_key', resolvedKeys).is('read_at', null);
  if (resolved.error) throw resolved.error;
  if (notices.length === 0) return false;
  const { error } = await requireSupabase().from('notification_log').upsert(
    notices.map((notice) => ({ ...notice, user_id: userId })),
    { onConflict: 'user_id,deduplication_key', ignoreDuplicates: true },
  );
  if (error) throw error;
  return true;
}

export async function saveOnboarding(input: {
  userId: string;
  displayName: string;
  timezone: string;
  officeName: string;
  requiredDays: number;
  preferredDays: number[];
  eligibleWeekdays: number[];
  monthEndRule: AttendancePolicy['month_end_rule'];
  reminderEnabled: boolean;
}) {
  const client = requireSupabase();
  await saveProfile(input.userId, {
    display_name: input.displayName,
    timezone: input.timezone,
    onboarding_completed: false,
  });
  const results = await Promise.all([
    client.rpc('set_my_attendance_policy', {
      p_required_days: input.requiredDays,
      p_preferred_weekdays: input.preferredDays,
      p_eligible_weekdays: input.eligibleWeekdays,
      p_month_end_rule: input.monthEndRule,
      p_effective_from: todayInTimezone(input.timezone),
      p_name: 'Personal policy',
    }),
    client.from('notification_preferences').update({
      office_reminder_enabled: input.reminderEnabled,
      reminder_timezone: input.timezone,
    }).eq('user_id', input.userId),
    saveOfficeLocation(input.userId, input.officeName, undefined, input.timezone),
  ]);
  const error = results.find((result) => result && 'error' in result && result.error);
  if (error && 'error' in error) throw error.error;
  await saveProfile(input.userId, { onboarding_completed: true });
}

export async function insertImportedAttendance(records: Array<{
  event_date: string;
  status: AttendanceEvent['status'];
  notes: string;
  external_event_id: string;
}>, fileName: string, rejectedCount: number) {
  const client = requireSupabase();
  const { data, error } = await client.rpc('import_attendance_csv', {
    p_records: records,
    p_file_name: fileName,
    p_rejected_count: rejectedCount,
  });
  if (error) throw error;
  return data;
}

export async function deleteAccount() {
  const client = requireSupabase();
  const { error } = await client.rpc('delete_my_account');
  if (error) throw error;
  const { error: signOutError } = await client.auth.signOut({ scope: 'local' });
  if (signOutError) throw signOutError;
}
