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
const plan = (localIso: string, attendance: AttendanceEvent[] = [], overrides: Partial<ReminderContext> = {}) => planReminders({
  now: new Date(`${localIso}-05:00`), timezone: 'America/Toronto', reminderTime: '10:00:00', checkinTime: '16:00:00',
  policy, policies: [policy], attendance, absences: [], holidays: [], ...overrides,
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
      .toEqual(['email:weekly-plan:2026-11-23', 'email:checkin:2026-11-23', 'email:daily:2026-11-23']);
    expect(plan('2026-11-24T09:59:00')).toEqual([]);
    expect(plan('2026-11-24T10:00:00').map((reminder) => reminder.deduplicationKey))
      .toEqual(['email:daily:2026-11-24']);
    expect(plan('2026-11-24T10:00:00', [], { reminderTime: '11:00' })).toEqual([]);
  });

  it('keeps reminding for the rest of the week after skipped preferred days', () => {
    // Skipped Tue 24 and Wed 25: Thu 26 and Fri 27 are now both needed.
    expect(plan('2026-11-26T10:00:00').map((reminder) => reminder.deduplicationKey)).toContain('email:daily:2026-11-26');
    expect(plan('2026-11-27T10:00:00').map((reminder) => reminder.deduplicationKey)).toContain('email:daily:2026-11-27');
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

  it('reminds on every eligible weekday, including non-preferred Monday and Friday', () => {
    for (const today of ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']) {
      const daily = plan(`${today}T10:00:00`).find((reminder) => reminder.deduplicationKey === `email:daily:${today}`);
      expect(daily?.title).toBe('Could today be an office day?');
      expect(daily?.message).toContain('is an eligible office day');
    }
  });

  it('does not send daily nudges before the configured time or for weekends and office days already logged', () => {
    const nudges = (reminders: ReturnType<typeof plan>) =>
      reminders.filter((reminder) => reminder.deduplicationKey.startsWith('email:daily:'));
    expect(nudges(plan('2026-11-23T09:59:00'))).toEqual([]);
    expect(nudges(plan('2026-11-29T18:00:00'))).toEqual([]);
    expect(nudges(plan('2026-11-28T18:00:00'))).toEqual([]);
    expect(nudges(plan('2026-11-23T10:00:00', [inOffice('2026-11-23')]))).toEqual([]);
    expect(nudges(plan('2026-11-23T10:00:00', [], {
      absences: [{
        id: 'absence-1', user_id: 'user-1', start_date: '2026-11-23', end_date: '2026-11-23',
        reason: 'Leave', source: 'manual', external_event_id: null, created_at: '', updated_at: '',
      }],
    }))).toEqual([]);
    expect(nudges(plan('2026-11-23T10:00:00', [], {
      holidays: [{
        id: 'holiday-1', user_id: 'user-1', organization_id: null, holiday_date: '2026-11-23',
        name: 'Holiday', source: 'manual', external_event_id: null, created_at: '', updated_at: '',
      }],
    }))).toEqual([]);
  });

  it('continues daily reminders for a flexible Monday, Tuesday, Friday attendance pattern', () => {
    const attendance = ['2026-11-23', '2026-11-24'].map(inOffice);
    expect(plan('2026-11-27T10:00:00', attendance).map((reminder) => reminder.deduplicationKey))
      .toContain('email:daily:2026-11-27');
    expect(plan('2026-11-27T18:00:00', [...attendance, inOffice('2026-11-27')])).toEqual([]);
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
