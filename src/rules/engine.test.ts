import { describe, expect, it } from 'vitest';
import { evaluateAttendance, getCalendarWeek, getReportingMonth, getReportingWeek } from './engine';
import { datesBetween, getWeekStart, todayInTimezone } from '../lib/dates';
import type { AttendanceEvent, AttendancePolicy } from '../types/domain';

const policy: AttendancePolicy = {
  id: 'policy-1',
  user_id: 'user-1',
  organization_id: null,
  name: 'Default',
  required_days_per_week: 3,
  preferred_weekdays: [2, 3, 4],
  eligible_weekdays: [1, 2, 3, 4, 5],
  reduce_for_approved_absences: true,
  reduce_for_holidays: true,
  month_end_rule: 'month_end_monday_to_previous_month',
  effective_from: '2020-01-01',
  effective_to: null,
};

function event(date: string, id = date, status: AttendanceEvent['status'] = 'in_office'): AttendanceEvent {
  return {
    id, user_id: 'user-1', event_date: date, status, source: 'manual', external_event_id: null,
    source_metadata: null, corrects_event_id: null, notes: '',
    created_at: `${date}T12:00:00Z`, updated_at: `${date}T12:00:00Z`,
  };
}

function evaluate(
  currentDate: string,
  attendanceEvents: AttendanceEvent[] = [],
  extra: Partial<Parameters<typeof evaluateAttendance>[0]> = {},
) {
  return evaluateAttendance({
    timezone: 'America/Toronto',
    dateRange: { start: '2020-01-01', end: '2030-12-31' },
    policy,
    attendanceEvents,
    approvedAbsences: [],
    holidays: [],
    currentDate,
    ...extra,
  });
}

const absence = (start: string, end = start) => ({
  id: `absence-${start}`, user_id: 'user-1', start_date: start, end_date: end,
  reason: '', source: 'manual' as const, external_event_id: null, created_at: '', updated_at: '',
});
const holiday = (date: string) => ({
  id: `holiday-${date}`, user_id: 'user-1', organization_id: null, holiday_date: date,
  name: 'Holiday', source: 'manual' as const, external_event_id: null, created_at: '', updated_at: '',
});

describe('attendance rules engine', () => {
  it('counts three standard office days and marks the week complete', () => {
    const result = evaluate('2026-11-26', [event('2026-11-24'), event('2026-11-25'), event('2026-11-26')]);
    expect(result.completedOfficeDays).toBe(3);
    expect(result.remainingOfficeDays).toBe(0);
    expect(result.canChill).toBe(true);
    expect(result.weeklyStatus).toBe('You can chill');
  });

  it('counts Monday and Friday when eligible, even if they are not preferred', () => {
    const result = evaluate('2026-11-27', [event('2026-11-23'), event('2026-11-24'), event('2026-11-27')]);
    expect(result.completedOfficeDays).toBe(3);
  });

  it('recommends a preferred day before a non-preferred eligible day', () => {
    const result = evaluate('2026-11-23');
    expect(result.recommendedNextOfficeDate).toBe('2026-11-24');
  });

  it('does not count duplicate attendance dates twice', () => {
    const result = evaluate('2026-11-25', [event('2026-11-24'), event('2026-11-24', 'duplicate')]);
    expect(result.completedOfficeDays).toBe(1);
  });

  it('reduces the target once for an overlapping absence and holiday', () => {
    const result = evaluate('2026-11-27', [event('2026-11-24'), event('2026-11-25')], {
      approvedAbsences: [absence('2026-11-26')],
      holidays: [holiday('2026-11-26')],
    });
    expect(result.adjustedRequirement).toBe(2);
    expect(result.remainingOfficeDays).toBe(0);
    expect(result.weekly.explanationMessages[0]).toContain('counted toward your target of 3 days');
    expect(result.creditedDays).toBe(1);
  });

  it('reduces for a holiday on an eligible weekday', () => {
    const result = evaluate('2026-11-27', [], { holidays: [holiday('2026-11-26')] });
    expect(result.adjustedRequirement).toBe(2);
  });

  it('does not count an office event on an approved absence or holiday date', () => {
    const result = evaluate('2026-11-27', [event('2026-11-24'), event('2026-11-25'), event('2026-11-26')], {
      approvedAbsences: [absence('2026-11-26')],
      holidays: [holiday('2026-11-26')],
    });
    expect(result.completedOfficeDays).toBe(2);
    expect(result.remainingOfficeDays).toBe(0);
  });

  it('does not credit absences or holidays when those toggles are off', () => {
    const result = evaluate('2026-11-27', [event('2026-11-24'), event('2026-11-25')], {
      policy: { ...policy, reduce_for_approved_absences: false, reduce_for_holidays: false },
      approvedAbsences: [absence('2026-11-26')],
      holidays: [holiday('2026-11-23')],
    });
    expect(result.adjustedRequirement).toBe(3);
    expect(result.remainingOfficeDays).toBe(1);
    expect(result.canChill).toBe(false);
  });

  it('never reduces the target below zero', () => {
    const result = evaluate('2026-11-27', [], { approvedAbsences: [absence('2026-11-23', '2026-11-27')] });
    expect(result.adjustedRequirement).toBe(0);
  });

  it('does not reduce the target for an ineligible weekend absence', () => {
    const result = evaluate('2026-11-27', [], { approvedAbsences: [absence('2026-11-28')] });
    expect(result.adjustedRequirement).toBe(3);
  });

  it('accounts for the partial week by considering how many eligible dates remain', () => {
    const result = evaluate('2026-11-25', [event('2026-11-24')]);
    expect(result.weeklyStatus).toBe('On track');
    expect(result.eligibleRemainingDates).toEqual(['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-30']);
  });

  it('marks a week at risk when too few eligible dates remain', () => {
    const result = evaluate('2026-11-30', [event('2026-11-23')]);
    expect(result.weeklyStatus).toBe('At risk');
    expect(result.recommendedNextOfficeDate).toBe('2026-11-30');
  });

  it('reports action required when no eligible days remain', () => {
    const result = evaluate('2026-12-06', [event('2026-12-01')]);
    expect(result.weeklyStatus).toBe('Action required');
    expect(result.explanationMessages.some((message) => message.includes('No eligible office days remain'))).toBe(true);
  });

  it('does not treat remote work as office attendance', () => {
    const result = evaluate('2026-11-25', [event('2026-11-24', 'remote', 'remote')]);
    expect(result.completedOfficeDays).toBe(0);
  });

  it('allows attendance above target and reports it', () => {
    const result = evaluate('2026-11-27', [
      event('2026-11-23'), event('2026-11-24'), event('2026-11-25'), event('2026-11-26'), event('2026-11-27'),
    ]);
    expect(result.completedOfficeDays).toBe(5);
    expect(result.weekly.explanationMessages.join(' ')).toContain('above your target');
  });

  it.each([
    ['2026-11-30', '2026-11'],
    ['2026-08-31', '2026-08'],
    ['2026-08-24', '2026-08'],
    ['2026-01-31', '2026-02'],
  ])('assigns reporting month for %s to %s', (date, month) => {
    expect(getReportingMonth(date, policy.month_end_rule)).toBe(month);
  });

  it('assigns November 30 Monday to the ending-month reporting week', () => {
    expect(getCalendarWeek('2026-11-30')).toEqual({ start: '2026-11-30', end: '2026-12-06' });
    expect(getReportingWeek('2026-11-30', policy.month_end_rule)).toEqual({
      start: '2026-11-23',
      end: '2026-11-30',
    });
    const result = evaluate('2026-11-30', [event('2026-11-30')]);
    expect(result.calendarMonth).toBe('2026-11');
    expect(result.reportingMonth).toBe('2026-11');
    expect(result.completedOfficeDays).toBe(1);
    expect(result.attendanceAssignments[0]).toMatchObject({
      attendanceDate: '2026-11-30',
      calendarWeek: { start: '2026-11-30', end: '2026-12-06' },
      reportingWeek: { start: '2026-11-23', end: '2026-11-30' },
      calendarMonth: '2026-11',
      reportingMonth: '2026-11',
    });
  });

  it('starts the following reporting cycle on Tuesday so November 30 is not counted twice', () => {
    expect(getReportingWeek('2026-12-01', policy.month_end_rule)).toEqual({
      start: '2026-12-01',
      end: '2026-12-06',
    });
    const result = evaluate('2026-12-01', [event('2026-11-30'), event('2026-12-01')]);
    expect(result.completedOfficeDays).toBe(1);
    expect(result.reportingMonth).toBe('2026-12');
  });

  it('extends the preceding reporting week to include the final Monday', () => {
    expect(getReportingWeek('2026-11-29', policy.month_end_rule)).toEqual({
      start: '2026-11-23',
      end: '2026-11-30',
    });
  });

  it('applies the same reporting-week boundary to August 31 and spans the year boundary', () => {
    expect(getReportingWeek('2026-08-31', policy.month_end_rule)).toEqual({
      start: '2026-08-24',
      end: '2026-08-31',
    });
    expect(getCalendarWeek('2026-12-31')).toEqual({
      start: '2026-12-28',
      end: '2027-01-03',
    });
    expect(getReportingWeek('2026-12-31', policy.month_end_rule)).toEqual({
      start: '2026-12-28',
      end: '2027-01-03',
    });
  });

  it('uses the configured calendar-month rule when selected', () => {
    expect(getReportingMonth('2026-11-30', 'calendar_month')).toBe('2026-11');
  });

  it('keeps weeks spanning two months and years starting on Monday', () => {
    expect(getWeekStart('2026-12-31')).toBe('2026-12-28');
    expect(getWeekStart('2027-01-01')).toBe('2026-12-28');
    expect(getWeekStart('2026-12-01')).toBe('2026-11-30');
  });

  it('handles leap days', () => {
    expect(datesBetween('2024-02-28', '2024-03-01')).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  });

  it('uses the requested timezone to resolve today across a date boundary', () => {
    const instant = new Date('2026-01-01T02:00:00Z');
    expect(todayInTimezone('America/Toronto', instant)).toBe('2025-12-31');
    expect(todayInTimezone('UTC', instant)).toBe('2026-01-01');
  });

  it('uses the policy effective on each date for eligibility and reporting', () => {
    const updatedPolicy: AttendancePolicy = {
      ...policy,
      id: 'policy-2',
      required_days_per_week: 1,
      eligible_weekdays: [1, 2, 3, 4, 5, 6],
      effective_from: '2026-11-25',
      effective_to: null,
    };
    const previousPolicy = { ...policy, effective_to: '2026-11-24' };
    const result = evaluate('2026-11-27', [event('2026-11-23')], {
      policies: [previousPolicy, updatedPolicy],
    });
    expect(result.normalRequirement).toBe(1);
    expect(result.completedOfficeDays).toBe(1);
    expect(result.canChill).toBe(true);
  });
});
