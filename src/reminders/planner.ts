import { format } from 'date-fns';
import { addDateDays, parseDateKey, todayInTimezone, weekday } from '../lib/dates';
import { evaluateAttendance, type RulesResult } from '../rules/engine';
import type { ApprovedAbsence, AttendanceEvent, AttendancePolicy, Holiday } from '../types/domain';

export const WEEKLY_PLAN_TIME = '08:00';

export interface ReminderContext {
  now: Date;
  timezone: string;
  reminderTime: string;
  checkinTime: string;
  policy: AttendancePolicy;
  policies: AttendancePolicy[];
  attendance: AttendanceEvent[];
  absences: ApprovedAbsence[];
  holidays: Holiday[];
}

export interface PlannedReminder {
  deduplicationKey: string;
  title: string;
  message: string;
}

export function localTimeInTimezone(timezone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '00';
  return `${part('hour')}:${part('minute')}`;
}

function evaluateOn(date: string, context: ReminderContext): RulesResult {
  return evaluateAttendance({
    timezone: context.timezone,
    dateRange: { start: addDateDays(date, -45), end: addDateDays(date, 45) },
    policy: context.policy,
    policies: context.policies,
    attendanceEvents: context.attendance,
    approvedAbsences: context.absences,
    holidays: context.holidays,
    currentDate: date,
  });
}

/** Picks the remaining office days for the week, preferring the user's preferred weekdays. */
export function recommendedOfficeDates(result: RulesResult, policy: AttendancePolicy): string[] {
  const preferred = result.eligibleRemainingDates.filter((date) => policy.preferred_weekdays.includes(weekday(date)));
  const others = result.eligibleRemainingDates.filter((date) => !policy.preferred_weekdays.includes(weekday(date)));
  return [...preferred, ...others].slice(0, result.remainingOfficeDays).sort();
}

const longDate = (date: string) => format(parseDateKey(date), 'EEEE, MMMM d');
const days = (count: number) => `${count} office ${count === 1 ? 'day' : 'days'}`;

export function planReminders(context: ReminderContext): PlannedReminder[] {
  const today = todayInTimezone(context.timezone, context.now);
  const time = localTimeInTimezone(context.timezone, context.now);
  const reminders: PlannedReminder[] = [];

  // The weekly plan goes out on the first day of each reporting week, which is a Tuesday after a month-end Monday.
  const todayResult = evaluateOn(today, context);
  if (today === todayResult.reportingWeek.start && time >= WEEKLY_PLAN_TIME && todayResult.remainingOfficeDays > 0) {
    const planned = recommendedOfficeDates(todayResult, context.policy);
    const adjustment = todayResult.weekly.explanationMessages.find((message) => message.includes('counted toward your target'));
    reminders.push({
      deduplicationKey: `email:weekly-plan:${todayResult.reportingWeek.start}`,
      title: `This week: ${days(todayResult.remainingOfficeDays)} needed`,
      message: [
        `You need ${days(todayResult.remainingOfficeDays)} this week (${todayResult.completedOfficeDays + todayResult.creditedDays}/${todayResult.normalRequirement} done).`,
        planned.length > 0 ? `Suggested: ${planned.map(longDate).join(', ')}.` : 'No eligible office days remain this week.',
        adjustment,
      ].filter(Boolean).join(' '),
    });
  }

  // After-office check-in: any eligible weekday with nothing logged yet while the week still needs office days.
  const loggedToday = context.attendance.some((event) => event.event_date === today);
  if (time >= context.checkinTime.slice(0, 5) && !loggedToday
    && todayResult.remainingOfficeDays > 0 && todayResult.eligibleRemainingDates.includes(today)) {
    reminders.push({
      deduplicationKey: `email:checkin:${today}`,
      title: 'Did you go to the office today?',
      message: `If you went in today (${longDate(today)}), tick it off in Office Buddy so your week stays accurate. `
        + `${todayResult.completedOfficeDays + todayResult.creditedDays}/${todayResult.normalRequirement} done so far this week.`,
    });
  }

  if (time >= context.reminderTime.slice(0, 5)
    && todayResult.remainingOfficeDays > 0 && todayResult.eligibleRemainingDates.includes(today)) {
    reminders.push({
      deduplicationKey: `email:daily:${today}`,
      title: 'Could today be an office day?',
      message: `${longDate(today)} is an eligible office day, regardless of your preferred days. `
        + `${todayResult.completedOfficeDays + todayResult.creditedDays}/${todayResult.normalRequirement} done, ${days(todayResult.remainingOfficeDays)} still needed this week.`,
    });
  }
  return reminders;
}
