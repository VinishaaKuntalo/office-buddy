import type { UserData } from '../data/repository';
import type { AttendanceEvent } from '../types/domain';

export const testPolicy = {
  id: 'policy-1',
  user_id: 'user-1',
  organization_id: null,
  name: 'Default',
  required_days_per_week: 3,
  preferred_weekdays: [2, 3, 4],
  eligible_weekdays: [1, 2, 3, 4, 5],
  reduce_for_approved_absences: true,
  reduce_for_holidays: true,
  month_end_rule: 'month_end_monday_to_previous_month' as const,
  effective_from: '2020-01-01',
  effective_to: null,
};

export function testEvent(date: string, id = date): AttendanceEvent {
  return {
    id,
    user_id: 'user-1',
    event_date: date,
    status: 'in_office',
    source: 'manual',
    external_event_id: null,
    source_metadata: null,
    corrects_event_id: null,
    notes: '',
    created_at: `${date}T12:00:00Z`,
    updated_at: `${date}T12:00:00Z`,
  };
}

export function testUserData(attendance: AttendanceEvent[] = []): UserData {
  return {
    profile: {
      id: 'user-1',
      display_name: 'Taylor',
      timezone: 'America/Toronto',
      locale: 'en-CA',
      onboarding_completed: true,
    },
    policy: testPolicy,
    policies: [testPolicy],
    attendance,
    absences: [],
    holidays: [],
    notifications: [],
    notificationPreferences: {
      user_id: 'user-1',
      in_app_enabled: true,
      office_reminder_enabled: false,
      reminder_time: '17:00',
      reminder_timezone: 'America/Toronto',
    },
    officeLocation: { id: 'office-1', name: 'Downtown' },
  };
}
