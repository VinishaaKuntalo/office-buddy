import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { saveOnboarding } from '../data/repository';
import { isValidTimezone } from '../lib/dates';
import { friendlyError } from '../lib/supabase';
import { Alert, Button, Field } from '../components/UI';

const days = [
  { index: 1, label: 'Monday' }, { index: 2, label: 'Tuesday' },
  { index: 3, label: 'Wednesday' }, { index: 4, label: 'Thursday' },
  { index: 5, label: 'Friday' }, { index: 6, label: 'Saturday' },
  { index: 0, label: 'Sunday' },
];

export function Onboarding() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(String(user?.user_metadata.display_name ?? ''));
  const [timezone, setTimezone] = useState('America/Toronto');
  const [officeName, setOfficeName] = useState('');
  const [requiredDays, setRequiredDays] = useState(3);
  const [preferredDays, setPreferredDays] = useState([2, 3, 4]);
  const [eligibleDays, setEligibleDays] = useState([1, 2, 3, 4, 5]);
  const [monthEndRule, setMonthEndRule] = useState<'calendar_month' | 'month_end_monday_to_previous_month'>('month_end_monday_to_previous_month');
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!user) return <Navigate to="/signin" replace />;
  const authenticatedUserId = user.id;

  function toggle(value: number, current: number[], setCurrent: (next: number[]) => void) {
    setCurrent(current.includes(value) ? current.filter((day) => day !== value) : [...current, value].sort());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
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
    try {
      await saveOnboarding({ userId: authenticatedUserId, displayName, timezone, officeName, requiredDays, preferredDays, eligibleWeekdays: eligibleDays, monthEndRule, reminderEnabled });
      navigate('/app', { replace: true });
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  return <main className="min-h-screen bg-canvas px-4 py-10">
    <section className="mx-auto max-w-2xl rounded-3xl border border-slate-100 bg-white p-6 shadow-soft sm:p-9">
      <p className="text-sm font-semibold text-mint">Let’s set up your week</p>
      <h1 className="mt-2 text-3xl font-bold text-navy">Make Office Buddy yours</h1>
      <p className="mt-2 text-slate-500">The suggested defaults are ready to go. You can change them any time.</p>
      {error && <div className="mt-5"><Alert>{error}</Alert></div>}
      <form className="mt-7 space-y-6" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name"><input className="form-input" autoComplete="name" required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></Field>
          <Field label="Timezone" hint="Use an IANA timezone name.">
            <input className="form-input" required value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          </Field>
          <Field label="Office location name"><input className="form-input" required maxLength={120} placeholder="e.g. Downtown office" value={officeName} onChange={(event) => setOfficeName(event.target.value)} /></Field>
          <Field label="Required office days per week"><select className="form-select" value={requiredDays} onChange={(event) => setRequiredDays(Number(event.target.value))}>{[0, 1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'day' : 'days'}</option>)}</select></Field>
        </div>
        <fieldset><legend className="text-sm font-semibold text-navy">Preferred office days</legend><p className="mt-1 text-xs text-slate-500">Recommendations only—not the only days that count.</p>
          <div className="mt-3 flex flex-wrap gap-2">{days.map((day) => <label key={day.index} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${preferredDays.includes(day.index) ? 'border-emerald-500 bg-emerald-50 text-emerald-900' : 'border-slate-200 text-slate-600'}`}><input className="sr-only" type="checkbox" checked={preferredDays.includes(day.index)} onChange={() => toggle(day.index, preferredDays, setPreferredDays)} />{day.label}</label>)}</div>
        </fieldset>
        <fieldset><legend className="text-sm font-semibold text-navy">Days that can count</legend><div className="mt-3 flex flex-wrap gap-2">{days.map((day) => <label key={day.index} className={`cursor-pointer rounded-xl border px-3 py-2 text-sm ${eligibleDays.includes(day.index) ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-600'}`}><input className="sr-only" type="checkbox" checked={eligibleDays.includes(day.index)} onChange={() => toggle(day.index, eligibleDays, setEligibleDays)} />{day.label}</label>)}</div></fieldset>
        <Field label="Month-end Monday rule"><select className="form-select" value={monthEndRule} onChange={(event) => setMonthEndRule(event.target.value as typeof monthEndRule)}><option value="month_end_monday_to_previous_month">Final Monday counts toward ending month</option><option value="calendar_month">Use actual calendar month</option></select></Field>
        <label className="flex items-start gap-3 text-sm text-slate-700"><input className="mt-1 size-4 rounded border-slate-300 text-mint focus:ring-mint" type="checkbox" checked={reminderEnabled} onChange={(event) => setReminderEnabled(event.target.checked)} /><span><span className="font-medium">Email me office reminders</span><span className="mt-1 block text-xs text-slate-500">A weekly plan on Monday morning and a reminder the evening before each suggested office day. You can change this in Settings.</span></span></label>
        <Button type="submit" disabled={busy}>{busy ? 'Saving your setup…' : 'Save and continue'}</Button>
      </form>
    </section>
  </main>;
}
