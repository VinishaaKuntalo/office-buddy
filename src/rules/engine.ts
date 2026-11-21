import { addDateDays, datesBetween, getMonthEnd, getWeekStart, monthKey, weekday } from '../lib/dates';
import type {
  ApprovedAbsence,
  AttendanceEvent,
  AttendancePolicy,
  Holiday,
  ProgressStatus,
} from '../types/domain';

export interface RulesInput {
  timezone: string;
  dateRange: { start: string; end: string };
  policy: AttendancePolicy;
  policies?: AttendancePolicy[];
  attendanceEvents: AttendanceEvent[];
  approvedAbsences: ApprovedAbsence[];
  holidays: Holiday[];
  currentDate: string;
}

export interface PeriodProgress {
  start: string;
  end: string;
  normalRequirement: number;
  adjustedRequirement: number;
  completedOfficeDays: number;
  remainingOfficeDays: number;
  eligibleRemainingDates: string[];
  status: ProgressStatus;
  explanationMessages: string[];
}

export interface DateRange {
  start: string;
  end: string;
}

export interface AttendanceReportingAssignment {
  attendanceDate: string;
  calendarWeek: DateRange;
  reportingWeek: DateRange;
  calendarMonth: string;
  reportingMonth: string;
}

export interface RulesResult {
  normalRequirement: number;
  adjustedRequirement: number;
  completedOfficeDays: number;
  remainingOfficeDays: number;
  weeklyStatus: ProgressStatus;
  monthlyStatus: ProgressStatus;
  eligibleRemainingDates: string[];
  recommendedNextOfficeDate: string | null;
  calendarWeek: DateRange;
  reportingWeek: DateRange;
  calendarMonth: string;
  reportingMonth: string;
  attendanceAssignments: AttendanceReportingAssignment[];
  weekly: PeriodProgress;
  monthly: PeriodProgress;
  explanationMessages: string[];
  canChill: boolean;
  reasons: string[];
}

const officeStatuses = new Set(['in_office']);

function policyForDate(date: string, input: RulesInput): AttendancePolicy {
  const active = (input.policies ?? [input.policy])
    .filter((policy) => policy.effective_from <= date && (!policy.effective_to || policy.effective_to >= date))
    .sort((left, right) => right.effective_from.localeCompare(left.effective_from));
  return active[0] ?? input.policy;
}

export function getReportingMonth(date: string, rule: AttendancePolicy['month_end_rule']): string {
  if (rule === 'calendar_month') return monthKey(date);

  const weekEndMonth = monthKey(addDateDays(getWeekStart(date), 6));
  const isFinalMonday = weekday(date) === 1 && date === getMonthEnd(date);
  return isFinalMonday ? monthKey(date) : weekEndMonth;
}

export function getCalendarWeek(date: string): DateRange {
  const start = getWeekStart(date);
  return { start, end: addDateDays(start, 6) };
}

export function getReportingWeek(date: string, rule: AttendancePolicy['month_end_rule']): DateRange {
  const calendarWeek = getCalendarWeek(date);
  if (rule === 'calendar_month') return calendarWeek;

  const isFinalMonday = (value: string) => weekday(value) === 1 && value === getMonthEnd(value);
  if (isFinalMonday(calendarWeek.start)) {
    if (date === calendarWeek.start) {
      return { start: addDateDays(calendarWeek.start, -7), end: calendarWeek.start };
    }
    return { start: addDateDays(calendarWeek.start, 1), end: calendarWeek.end };
  }

  const nextDay = addDateDays(calendarWeek.end, 1);
  if (isFinalMonday(nextDay)) {
    return { start: calendarWeek.start, end: nextDay };
  }
  return calendarWeek;
}

function uniqueOfficeDates(events: AttendanceEvent[], start: string, end: string): Set<string> {
  return new Set(
    events
      .filter((event) =>
        event.event_date >= start
        && event.event_date <= end
        && officeStatuses.has(event.status),
      )
      .map((event) => event.event_date),
  );
}

function absenceDates(absences: ApprovedAbsence[], start: string, end: string): Set<string> {
  const result = new Set<string>();
  for (const absence of absences) {
    const clippedStart = absence.start_date < start ? start : absence.start_date;
    const clippedEnd = absence.end_date > end ? end : absence.end_date;
    if (clippedStart <= clippedEnd) {
      for (const date of datesBetween(clippedStart, clippedEnd)) result.add(date);
    }
  }
  return result;
}

function progress(input: {
  start: string;
  end: string;
  currentDate: string;
  normalRequirement: number;
  eligibleDates: string[];
  officeDates: Set<string>;
  absenceDates: Set<string>;
  holidayDates: Set<string>;
  policyForDate: (date: string) => AttendancePolicy;
}): PeriodProgress {
  const eligible = input.eligibleDates.filter((date) => date >= input.start && date <= input.end);
  const completedOfficeDays = eligible.filter((date) =>
    input.officeDates.has(date)
    && !input.absenceDates.has(date)
    && !input.holidayDates.has(date),
  ).length;
  const reducingDates = eligible.filter((date) => {
    const datePolicy = input.policyForDate(date);
    return (
      (datePolicy.reduce_for_approved_absences && input.absenceDates.has(date))
      || (datePolicy.reduce_for_holidays && input.holidayDates.has(date))
    );
  });
  const adjustedRequirement = Math.max(0, input.normalRequirement - reducingDates.length);
  const remainingOfficeDays = Math.max(0, adjustedRequirement - completedOfficeDays);
  const eligibleRemainingDates = eligible.filter((date) =>
    date >= input.currentDate
    && !input.officeDates.has(date)
    && !input.absenceDates.has(date)
    && !input.holidayDates.has(date),
  );
  const status = getProgressStatus({
    completed: completedOfficeDays,
    required: adjustedRequirement,
    remainingEligibleDates: eligibleRemainingDates.length,
    currentDate: input.currentDate,
    end: input.end,
  });
  const explanationMessages: string[] = [];
  if (reducingDates.length > 0) {
    explanationMessages.push(
      `Your normal target is ${input.normalRequirement} ${input.normalRequirement === 1 ? 'day' : 'days'}. `
      + `${reducingDates.length} eligible approved ${reducingDates.length === 1 ? 'absence or holiday date reduced' : 'absence or holiday dates reduced'} `
      + `this period's target to ${adjustedRequirement}.`,
    );
  }
  if (completedOfficeDays > adjustedRequirement) {
    const extraDays = completedOfficeDays - adjustedRequirement;
    explanationMessages.push(`You attended ${extraDays} ${extraDays === 1 ? 'day' : 'days'} above the adjusted target.`);
  }
  return {
    start: input.start,
    end: input.end,
    normalRequirement: input.normalRequirement,
    adjustedRequirement,
    completedOfficeDays,
    remainingOfficeDays,
    eligibleRemainingDates,
    status,
    explanationMessages,
  };
}

function getProgressStatus(input: {
  completed: number;
  required: number;
  remainingEligibleDates: number;
  currentDate: string;
  end: string;
}): ProgressStatus {
  if (input.required === 0 || input.completed >= input.required) return 'Complete';
  if (input.remainingEligibleDates === 0 || input.currentDate > input.end) return 'Action required';
  if (input.remainingEligibleDates < input.required - input.completed) return 'At risk';
  if (input.completed === 0) return 'Not started';
  return 'On track';
}

function weeklyRequirement(input: RulesInput): number {
  return policyForDate(input.currentDate, input).required_days_per_week;
}

function monthlyRequirement(dates: string[], input: RulesInput): number {
  const dailyTargets = dates.map((date) => {
    const datePolicy = policyForDate(date, input);
    const eligibleDaysInWeek = datesBetween(getWeekStart(date), addDateDays(getWeekStart(date), 6))
      .filter((weekDate) => datePolicy.eligible_weekdays.includes(weekday(weekDate))).length;
    return eligibleDaysInWeek === 0 ? 0 : datePolicy.required_days_per_week / eligibleDaysInWeek;
  });
  return Math.ceil(dailyTargets.reduce((total, target) => total + target, 0) - 1e-9);
}

export function evaluateAttendance(input: RulesInput): RulesResult {
  const currentPolicy = policyForDate(input.currentDate, input);
  const calendarWeek = getCalendarWeek(input.currentDate);
  const reportingWeek = getReportingWeek(input.currentDate, currentPolicy.month_end_rule);
  const reportingWeekStart = reportingWeek.start;
  const reportingWeekEnd = reportingWeek.end;
  const reportingMonth = getReportingMonth(input.currentDate, currentPolicy.month_end_rule);
  const calendarMonthStart = `${reportingMonth}-01`;
  const calendarMonthEnd = getMonthEnd(calendarMonthStart);
  const monthlyRangeStart = addDateDays(calendarMonthStart, -6);
  const monthlyRangeEnd = addDateDays(calendarMonthEnd, 6);
  const weekDates = datesBetween(reportingWeekStart, reportingWeekEnd);
  const monthlyReportingDates = datesBetween(monthlyRangeStart, monthlyRangeEnd).filter((date) =>
    getReportingMonth(date, policyForDate(date, input).month_end_rule) === reportingMonth,
  );

  const events = input.attendanceEvents.filter((event) =>
    event.event_date >= input.dateRange.start
    && event.event_date <= input.dateRange.end
    && event.event_date <= input.currentDate,
  );
  const attendanceAssignments = events.map((event) => {
    const eventPolicy = policyForDate(event.event_date, input);
    return {
      attendanceDate: event.event_date,
      calendarWeek: getCalendarWeek(event.event_date),
      reportingWeek: getReportingWeek(event.event_date, eventPolicy.month_end_rule),
      calendarMonth: monthKey(event.event_date),
      reportingMonth: getReportingMonth(event.event_date, eventPolicy.month_end_rule),
    };
  });
  const weekEligibleDates = weekDates.filter((date) =>
    policyForDate(date, input).eligible_weekdays.includes(weekday(date)),
  );
  const monthlyEligibleDates = monthlyReportingDates.filter((date) =>
    policyForDate(date, input).eligible_weekdays.includes(weekday(date)),
  );
  const weekAbsences = absenceDates(input.approvedAbsences, reportingWeekStart, reportingWeekEnd);
  const monthAbsences = absenceDates(input.approvedAbsences, monthlyRangeStart, monthlyRangeEnd);
  const allHolidayDates = new Set(input.holidays.map((holiday) => holiday.holiday_date));
  const weekOfficeDates = uniqueOfficeDates(events, reportingWeekStart, reportingWeekEnd);
  const monthOfficeDates = new Set(
    events
      .filter((event) =>
        officeStatuses.has(event.status)
        && getReportingMonth(event.event_date, policyForDate(event.event_date, input).month_end_rule) === reportingMonth,
      )
      .map((event) => event.event_date),
  );

  const weekly = progress({
    start: reportingWeekStart,
    end: reportingWeekEnd,
    currentDate: input.currentDate,
    normalRequirement: weeklyRequirement(input),
    eligibleDates: weekEligibleDates,
    officeDates: weekOfficeDates,
    absenceDates: weekAbsences,
    holidayDates: allHolidayDates,
    policyForDate: (date) => policyForDate(date, input),
  });
  const monthly = progress({
    start: monthlyReportingDates[0] ?? calendarMonthStart,
    end: monthlyReportingDates.at(-1) ?? calendarMonthEnd,
    currentDate: input.currentDate,
    normalRequirement: monthlyRequirement(monthlyEligibleDates, input),
    eligibleDates: monthlyEligibleDates,
    officeDates: monthOfficeDates,
    absenceDates: monthAbsences,
    holidayDates: allHolidayDates,
    policyForDate: (date) => policyForDate(date, input),
  });

  const eligibleRemainingDates = weekly.eligibleRemainingDates;
  const recommendedNextOfficeDate = eligibleRemainingDates.find((date) =>
    policyForDate(date, input).preferred_weekdays.includes(weekday(date)),
  ) ?? eligibleRemainingDates[0] ?? null;
  const weeklyStatus: ProgressStatus = weekly.remainingOfficeDays === 0
    ? 'You can chill'
    : weekly.status;
  const explanations = [...weekly.explanationMessages, ...monthly.explanationMessages];
  if (events.some((event) => getReportingMonth(event.event_date, policyForDate(event.event_date, input).month_end_rule) !== monthKey(event.event_date))) {
    explanations.push('A week-spanning date is assigned to its reporting month; a final Monday remains in the ending month without changing its actual attendance date.');
  }
  if (eligibleRemainingDates.length === 0 && weekly.remainingOfficeDays > 0) {
    explanations.push('No eligible office days remain this week. Review the recorded attendance or policy.');
  }

  return {
    normalRequirement: weekly.normalRequirement,
    adjustedRequirement: weekly.adjustedRequirement,
    completedOfficeDays: weekly.completedOfficeDays,
    remainingOfficeDays: weekly.remainingOfficeDays,
    weeklyStatus,
    monthlyStatus: monthly.status,
    eligibleRemainingDates,
    recommendedNextOfficeDate,
    reportingWeek: { start: reportingWeekStart, end: reportingWeekEnd },
    calendarWeek,
    calendarMonth: monthKey(input.currentDate),
    reportingMonth,
    attendanceAssignments,
    weekly,
    monthly,
    explanationMessages: explanations,
    canChill: weekly.remainingOfficeDays === 0,
    reasons: [
      `${weekly.completedOfficeDays} of ${weekly.adjustedRequirement} adjusted weekly office days are complete.`,
      `${weekly.remainingOfficeDays} office ${weekly.remainingOfficeDays === 1 ? 'day is' : 'days are'} still needed this week.`,
      `${eligibleRemainingDates.length} eligible office ${eligibleRemainingDates.length === 1 ? 'date remains' : 'dates remain'} this week.`,
    ],
  };
}
