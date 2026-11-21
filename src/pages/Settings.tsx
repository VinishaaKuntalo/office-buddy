import { useState, type FormEvent } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { deleteAccount as deleteAccountRequest, saveNotificationPreferences, saveOfficeLocation, saveProfile, savePolicy } from '../data/repository';
import type { UserData } from '../data/repository';
import { isValidTimezone, todayInTimezone } from '../lib/dates';
import { friendlyError } from '../lib/supabase';
import { Alert, Button, Card, Field, PageTitle } from '../components/UI';

interface OutletData { data: UserData; refresh: () => Promise<void> }

export function Settings() {
  const { user, signOut } = useAuth();
  const { data, refresh } = useOutletContext<OutletData>();
  const [name, setName] = useState(data.profile.display_name);
  const [timezone, setTimezone] = useState(data.profile.timezone);
  const [officeName, setOfficeName] = useState(data.officeLocation?.name ?? '');
  const [inAppEnabled, setInAppEnabled] = useState(data.notificationPreferences.in_app_enabled);
  const [reminderEnabled, setReminderEnabled] = useState(data.notificationPreferences.office_reminder_enabled);
  const [reminderTime, setReminderTime] = useState(data.notificationPreferences.reminder_time.slice(0, 5));
  const [requiredDays, setRequiredDays] = useState(data.policy.required_days_per_week);
  const [preferredDays, setPreferredDays] = useState(data.policy.preferred_weekdays);
  const [eligibleDays, setEligibleDays] = useState(data.policy.eligible_weekdays);
  const [monthEndRule, setMonthEndRule] = useState(data.policy.month_end_rule);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(value: number, list: number[], setList: (next: number[]) => void) {
    setList(list.includes(value) ? list.filter((day) => day !== value) : [...list, value].sort());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    if (eligibleDays.length === 0 || preferredDays.some((day) => !eligibleDays.includes(day))) {
      setError('Choose at least one eligible weekday. Preferred days must also be eligible.');
      return;
    }
    if (!isValidTimezone(timezone)) {
      setError('Enter a valid IANA timezone, such as America/Toronto.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await saveProfile(user.id, { display_name: name, timezone });
      await Promise.all([
        saveOfficeLocation(user.id, officeName, data.officeLocation?.id, timezone),
        saveNotificationPreferences(user.id, {
          in_app_enabled: inAppEnabled,
          office_reminder_enabled: reminderEnabled,
          reminder_time: reminderTime,
          reminder_timezone: timezone,
        }),
        savePolicy({
          required_days_per_week: requiredDays,
          preferred_weekdays: preferredDays,
          eligible_weekdays: eligibleDays,
          month_end_rule: monthEndRule,
        }, todayInTimezone(timezone)),
      ]);
      await refresh();
      setSuccess('Your settings have been saved.');
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    if (!user || !window.confirm('Delete your account and its Office Buddy data? This includes your profile, attendance, absences, holidays, settings, and notifications. This cannot be undone.')) return;
    setBusy(true);
    setError('');
    try {
      await deleteAccountRequest();
      window.location.hash = '#/';
    } catch (cause) {
      setError(friendlyError(cause));
      setBusy(false);
    }
  }

  return <>
    <PageTitle title="Settings" description="Your profile and weekly office policy." />
    {error && <div className="mb-5"><Alert>{error}</Alert></div>}
    {success && <div className="mb-5"><Alert tone="success">{success}</Alert></div>}
    <form onSubmit={submit} className="space-y-5">
      <Card><h2 className="font-bold text-navy">Profile</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Display name"><input className="form-input" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field>
        <Field label="Email"><input className="form-input bg-slate-50" value={user?.email ?? ''} readOnly /></Field>
        <Field label="Timezone"><input className="form-input" required value={timezone} onChange={(event) => setTimezone(event.target.value)} /></Field>
        <Field label="Office location name"><input className="form-input" required maxLength={120} value={officeName} onChange={(event) => setOfficeName(event.target.value)} /></Field>
      </div></Card>
      <Card><h2 className="font-bold text-navy">Attendance policy</h2><p className="mt-1 text-sm text-slate-500">Preferred days guide recommendations. Any eligible weekday counts.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Required office days per week"><select className="form-select" value={requiredDays} onChange={(event) => setRequiredDays(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option value={n} key={n}>{n} {n === 1 ? 'day' : 'days'}</option>)}</select></Field>
          <Field label="Month-end Monday rule"><select className="form-select" value={monthEndRule} onChange={(event) => setMonthEndRule(event.target.value as typeof monthEndRule)}><option value="month_end_monday_to_previous_month">Final Monday counts toward ending month</option><option value="calendar_month">Use actual calendar month</option></select></Field></div>
        <DayChoices title="Preferred days" selected={preferredDays} onToggle={(day) => toggle(day, preferredDays, setPreferredDays)} />
        <DayChoices title="Eligible days" selected={eligibleDays} onToggle={(day) => toggle(day, eligibleDays, setEligibleDays)} />
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">Changing a policy updates the active policy record. Historical versioned policies are supported by the database and rules engine.</p>
      </Card>
      <Card><h2 className="font-bold text-navy">Reminders</h2><label className="mt-4 flex items-center gap-3 text-sm text-slate-700"><input className="size-4 rounded border-slate-300 text-mint focus:ring-mint" type="checkbox" checked={inAppEnabled} onChange={(event) => setInAppEnabled(event.target.checked)} />Show status notifications in the app</label>
        <label className="mt-3 flex items-center gap-3 text-sm text-slate-700"><input className="size-4 rounded border-slate-300 text-mint focus:ring-mint" type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} />Email me office reminders</label>
        <div className="mt-4 max-w-xs"><Field label="Evening reminder time"><input className="form-input" type="time" value={reminderTime} onChange={(event) => setReminderTime(event.target.value)} /></Field></div>
        <p className="mt-2 text-xs text-slate-500">You’ll get your weekly plan at 8:00 AM on the first day of each reporting week, and a reminder at this time the evening before each suggested office day. Times use your profile timezone and may arrive up to an hour late.</p>
      </Card>
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</Button>
    </form>
    <Card className="mt-8 border-red-100"><h2 className="font-bold text-red-800">Account</h2><p className="mt-2 text-sm text-slate-600">Sign out from this device or permanently delete your account and its data.</p><div className="mt-4 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => void signOut()}>Sign out</Button><Button variant="danger" onClick={() => void deleteAccount()}>Delete account</Button></div></Card>
  </>;
}

function DayChoices({ title, selected, onToggle }: { title: string; selected: number[]; onToggle: (day: number) => void }) {
  return <fieldset className="mt-5"><legend className="text-sm font-semibold text-slate-700">{title}</legend><div className="mt-2 flex flex-wrap gap-2">
    {[['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]].map(([label, day]) => <label key={day} className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${selected.includes(Number(day)) ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600'}`}><input className="sr-only" type="checkbox" checked={selected.includes(Number(day))} onChange={() => onToggle(Number(day))} />{label}</label>)}
  </div></fieldset>;
}
