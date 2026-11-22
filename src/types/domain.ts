export type AttendanceStatus =
  | 'in_office'
  | 'approved_absence'
  | 'holiday'
  | 'remote'
  | 'not_in_office';

export type AttendanceSource =
  | 'manual'
  | 'csv_import'
  | 'badge'
  | 'hr_feed'
  | 'outlook'
  | 'holiday_feed'
  | 'admin_correction'
  | 'system';

export type MonthEndRule =
  | 'calendar_month'
  | 'month_end_monday_to_previous_month';

export type ProgressStatus =
  | 'Not started'
  | 'Action required'
  | 'At risk'
  | 'On track'
  | 'Complete'
  | 'You can chill';

export interface AttendanceEvent {
  id: string;
  user_id: string;
  event_date: string;
  status: AttendanceStatus;
  source: AttendanceSource;
  external_event_id: string | null;
  source_metadata: Record<string, unknown> | null;
  corrects_event_id: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface ApprovedAbsence {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  source: AttendanceSource;
  external_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Holiday {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  holiday_date: string;
  name: string;
  source: AttendanceSource;
  external_event_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendancePolicy {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  name: string;
  required_days_per_week: number;
  preferred_weekdays: number[];
  eligible_weekdays: number[];
  reduce_for_approved_absences: boolean;
  reduce_for_holidays: boolean;
  month_end_rule: MonthEndRule;
  effective_from: string;
  effective_to: string | null;
}

export interface Profile {
  id: string;
  display_name: string;
  timezone: string;
  locale: string;
  onboarding_completed: boolean;
}

export interface NotificationPreferences {
  user_id: string;
  in_app_enabled: boolean;
  office_reminder_enabled: boolean;
  email_enabled: boolean;
  reminder_time: string;
  checkin_time: string;
  reminder_timezone: string;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  notification_type: string;
  deduplication_key: string;
  title: string;
  message: string;
  due_at: string;
  read_at: string | null;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: Table<Profile & { created_at: string; updated_at: string }>;
      organizations: Table<{ id: string; name: string; created_by: string | null; created_at: string; updated_at: string }>;
      organization_members: Table<{ id: string; organization_id: string; user_id: string; role: 'member' | 'admin' | 'owner'; created_at: string; updated_at: string }>;
      office_locations: Table<{ id: string; user_id: string | null; organization_id: string | null; name: string; timezone: string; created_at: string; updated_at: string }>;
      attendance_policies: Table<AttendancePolicy & { created_at: string; updated_at: string }>;
      user_policy_assignments: Table<{ id: string; user_id: string; policy_id: string; effective_from: string; effective_to: string | null; created_at: string; updated_at: string }>;
      attendance_events: Table<AttendanceEvent>;
      approved_absences: Table<ApprovedAbsence>;
      holidays: Table<Holiday>;
      notification_preferences: Table<NotificationPreferences & { created_at: string; updated_at: string }>;
      notification_log: Table<NotificationItem & { updated_at: string }>;
      import_batches: Table<{ id: string; user_id: string; file_name: string; status: 'completed' | 'cancelled'; inserted_count: number; skipped_count: number; rejected_count: number; created_at: string; updated_at: string }>;
      audit_log: Table<{ id: string; user_id: string; entity_type: string; entity_id: string; action: 'insert' | 'update' | 'delete'; details: Record<string, unknown>; created_at: string }>;
      push_subscriptions: Table<{ id: string; user_id: string; endpoint: string; p256dh: string; auth: string; user_agent: string; created_at: string }>;
    };
    Views: Record<string, never>;
    Functions: {
      set_my_attendance_policy: {
        Args: {
          p_required_days: number;
          p_preferred_weekdays: number[];
          p_eligible_weekdays: number[];
          p_month_end_rule: MonthEndRule;
          p_effective_from: string;
          p_name?: string;
        };
        Returns: string;
      };
      delete_my_account: { Args: Record<string, never>; Returns: undefined };
      import_attendance_csv: {
        Args: {
          p_records: Array<{
            event_date: string;
            status: AttendanceStatus;
            notes: string;
            external_event_id: string;
          }>;
          p_file_name: string;
          p_rejected_count: number;
        };
        Returns: { inserted: number; skipped: number; rejected: number };
      };
    };
    Enums: {
      attendance_status: AttendanceStatus;
      attendance_source: AttendanceSource;
      month_end_rule: MonthEndRule;
      organization_role: 'member' | 'admin' | 'owner';
    };
    CompositeTypes: Record<string, never>;
  };
}

type Table<Row> = {
  Row: { [Key in keyof Row]: Row[Key] };
  Insert: { [Key in keyof Row]?: Row[Key] };
  Update: { [Key in keyof Row]?: Row[Key] };
  Relationships: [];
};
