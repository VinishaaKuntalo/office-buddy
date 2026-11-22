import { describe, expect, it } from 'vitest';
import { planReminders, type ReminderContext } from './planner';
import type { AttendanceEvent, AttendancePolicy } from '../types/domain';

const policy: AttendancePolicy = {
  id: 'policy-1', user_id: 'user-1', organization_id: null, name: 'Default',
  required_days_per_week: 3, preferred_weekdays: [2, 3, 4], eligible_weekdays: [1, 2, 3, 4, 5],
  reduce_for_approved_absences: true, reduce_for_holidays: true,
  month_end_rule: 'month_end_monday_to_previous_month', effective_from: '2020-01-01', effective_to: null,
};

const inOffice = (date: string): AttendanceEvent => ({
  id: date, user_id: 'user-1', event_date: date, status: 'in_office', source: 'manual', external_event_id: null,
  source_metadata: null, corrects_event_id: null, notes: '', created_at: '', updated_at: '',
});

// November 2026 is UTC-5 in Toronto.
const plan = (localIso: string, attendance: AttendanceEvent[] = []) => planReminders({
  now: new Date(`${localIso}-05:00`), timezone: 'America/Toronto', reminderTime: '17:00:00', checkinTime: '16:00:00',
  policy, policies: [policy], attendance, absences: [], holidays: [],
} satisfies ReminderContext);

describe('planReminders', () => {
  it('sends the weekly plan on Monday morning with preferred days', () => {
    const reminders = plan('2026-11-23T08:30:00');
    expect(reminders.map((reminder) => reminder.deduplicationKey)).toEqual(['email:weekly-plan:2026-11-23']);
    expect(reminders[0].message).toContain('Tuesday, November 24, Wednesday, November 25, Thursday, November 26');
  });

  it('waits until the configured times', () => {
    expect(plan('2026-11-23T07:30:00')).toEqual([]);
    expect(plan('2026-11-23T17:30:00').map((reminder) => reminder.deduplicationKey))
      .toEqual(['email:weekly-plan:2026-11-23', 'email:checkin:2026-11-23', 'email:day-before:2026-11-24']);
  });

  it('keeps reminding for the rest of the week after skipped preferred days', () => {
    // Skipped Tue 24 and Wed 25: Thu 26 and Fri 27 are now both needed.
    expect(plan('2026-11-25T17:30:00').map((reminder) => reminder.deduplicationKey)).toContain('email:day-before:2026-11-26');
    expect(plan('2026-11-26T17:30:00').map((reminder) => reminder.deduplicationKey)).toContain('email:day-before:2026-11-27');
  });

  it('asks for an after-office check-in only on unlogged eligible days of an incomplete week', () => {
    const keys = (localIso: string, attendance: AttendanceEvent[] = []) =>
      plan(localIso, attendance).map((reminder) => reminder.deduplicationKey);
    expect(keys('2026-11-24T15:30:00')).not.toContain('email:checkin:2026-11-24');
    expect(keys('2026-11-24T16:05:00')).toContain('email:checkin:2026-11-24');
    expect(keys('2026-11-24T16:05:00', [inOffice('2026-11-24')])).not.toContain('email:checkin:2026-11-24');
    expect(keys('2026-11-22T16:05:00')).not.toContain('email:checkin:2026-11-22');
    const done = ['2026-11-23', '2026-11-24', '2026-11-25'].map(inOffice);
    expect(keys('2026-11-26T16:05:00', done)).not.toContain('email:checkin:2026-11-26');
  });

  it('only sends a day-before reminder for suggested days', () => {
    expect(plan('2026-11-22T18:00:00')).toEqual([]);
  });

  it('skips reminders once the week is complete', () => {
    const done = ['2026-11-23', '2026-11-24', '2026-11-25'].map(inOffice);
    expect(plan('2026-11-25T18:00:00', done)).toEqual([]);
  });

  it('starts the next weekly plan on Tuesday after a month-end Monday', () => {
    expect(plan('2026-11-30T08:30:00').some((reminder) => reminder.deduplicationKey.startsWith('email:weekly-plan'))).toBe(false);
    expect(plan('2026-12-01T08:30:00')[0].deduplicationKey).toBe('email:weekly-plan:2026-12-01');
  });
});
