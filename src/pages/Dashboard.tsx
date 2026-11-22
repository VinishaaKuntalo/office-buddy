import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowRight, CalendarCheck2, CalendarClock, CheckCircle2, CircleAlert, DoorOpen } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import type { UserData } from '../data/repository';
import { addDateDays, todayInTimezone, weekday } from '../lib/dates';
import { friendlyError } from '../lib/supabase';
import { syncStatusNotifications } from '../data/repository';
import { evaluateAttendance } from '../rules/engine';
import { AttendanceDialog } from '../components/AttendanceDialog';
import { Alert, Button, Card, PageTitle } from '../components/UI';

interface OutletData { data: UserData; refresh: () => Promise<void> }

export function Dashboard() {
  const { user } = useAuth();
  const { data, refresh } = useOutletContext<OutletData>();
  const today = todayInTimezone(data.profile.timezone);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const result = evaluateAttendance({
    timezone: data.profile.timezone,
    dateRange: { start: addDateDays(today, -365), end: addDateDays(today, 365) },
    policy: data.policy,
    policies: data.policies,
    attendanceEvents: data.attendance,
    approvedAbsences: data.absences,
    holidays: data.holidays,
    currentDate: today,
  });
  const monthEvents = result.monthly.completedOfficeDays;
  const upcoming = [
    ...data.absences.filter((absence) => absence.end_date >= today).map((absence) => ({ date: absence.start_date, title: absence.reason || 'Approved absence', type: 'Absence' })),
    ...data.holidays.filter((holiday) => holiday.holiday_date >= today).map((holiday) => ({ date: holiday.holiday_date, title: holiday.name, type: 'Holiday' })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const weeklyDates = Array.from({ length: 8 }, (_, index) => addDateDays(result.reportingWeek.start, index))
    .filter((date) => {
      if (date > result.reportingWeek.end) return false;
      const activePolicy = data.policies.find((policy) =>
        policy.effective_from <= date && (!policy.effective_to || policy.effective_to >= date),
      ) ?? data.policy;
      return activePolicy.eligible_weekdays.includes(weekday(date));
    });

  useEffect(() => {
    if (!user || !data.notificationPreferences.in_app_enabled) return;
    let active = true;
    void syncStatusNotifications(user.id, result, data.notificationPreferences.in_app_enabled)
      .then(() => { if (active) setNotificationError(''); })
      .catch((cause: unknown) => { if (active) setNotificationError(friendlyError(cause)); });
    return () => { active = false; };
  }, [
    data.notificationPreferences.in_app_enabled,
    result.canChill,
    result.monthly.status,
    result.reportingMonth,
    result.reportingWeek.start,
    result.remainingOfficeDays,
    result.recommendedNextOfficeDate,
    result.weekly.explanationMessages.join('|'),
    result.weeklyStatus,
    user,
  ]);

  const doneDays = result.completedOfficeDays + result.creditedDays;
  const target = result.normalRequirement;
  const title = result.canChill || result.remainingOfficeDays === 0
    ? 'You can chill'
    : doneDays === 0
      ? 'Plan your office days'
      : `${result.remainingOfficeDays} more office ${result.remainingOfficeDays === 1 ? 'day' : 'days'} needed`;
  const message = result.canChill
    ? result.creditedDays > 0
      ? 'Your weekly target is complete, including approved absences or holidays. You can chill for the rest of this week.'
      : 'Your weekly office requirement is complete.'
    : result.recommendedNextOfficeDate
      ? `${format(parseISO(`${result.recommendedNextOfficeDate}T00:00:00`), 'EEEE, MMMM d')} is your recommended next office day.`
      : 'No eligible office days remain this week. Review your attendance or policy.';

  return <>
    <PageTitle title={`Good ${getGreeting()}, ${data.profile.display_name || 'there'}`} description="Here’s your office week at a glance." action={<Button onClick={() => setShowQuickAdd(true)}><DoorOpen size={17} /> Add a date</Button>} />
    <Card className="overflow-hidden border-0 bg-navy text-white">
      <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
        <div><div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-slate-200"><span className={`size-2 rounded-full ${result.canChill ? 'bg-emerald-300' : result.weeklyStatus === 'At risk' || result.weeklyStatus === 'Action required' ? 'bg-amber-300' : 'bg-blue-300'}`} />{result.weeklyStatus}</div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2><p className="mt-2 max-w-xl text-slate-300">{message}</p>
          {result.explanationMessages.length > 0 && <p className="mt-3 max-w-xl text-sm text-slate-300">{result.explanationMessages[0]}</p>}
        </div>
        <div className="flex items-center gap-4 rounded-2xl bg-white/10 p-4 md:min-w-48 md:flex-col md:gap-1 md:text-center">
          <div className="text-4xl font-bold">{doneDays}<span className="text-slate-400">/{target}</span></div>
          <div><div className="text-sm font-semibold">days done</div><div className="text-xs text-slate-300">{result.remainingOfficeDays} remaining</div></div>
        </div>
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-white/15 pt-5 text-sm">
        <span className="text-slate-300">Week of {format(parseISO(`${result.reportingWeek.start}T00:00:00`), 'MMMM d')}</span>
        <Link to="/app/insights" className="inline-flex items-center gap-1 font-semibold text-white hover:underline">See weekly insights <ArrowRight size={15} /></Link>
      </div>
    </Card>

    <div className="mt-5 grid gap-4 sm:grid-cols-2">
      <Card><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">This week</p><p className="mt-1 text-2xl font-bold text-navy">{doneDays} <span className="text-base font-medium text-slate-400">/ {target}</span></p><p className="mt-1 text-sm text-slate-500">{result.creditedDays > 0 ? `${result.completedOfficeDays} in office + ${result.creditedDays} absence/holiday` : 'Office days this week'}</p></div><CalendarCheck2 className="text-mint" size={24} /></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-mint transition-all" style={{ width: `${target === 0 ? 100 : Math.min(100, doneDays / target * 100)}%` }} /></div></Card>
      <Card><div className="flex items-center justify-between"><div><p className="text-sm text-slate-500">This month</p><p className="mt-1 text-2xl font-bold text-navy">{monthEvents} <span className="text-base font-medium text-slate-400">attended</span></p><p className="mt-1 text-sm text-slate-500">Reporting month: {format(parseISO(`${result.reportingMonth}-01T00:00:00`), 'MMMM yyyy')}</p></div><CalendarClock className="text-blue-600" size={24} /></div><Link to="/app/insights" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-mint hover:underline">View monthly progress <ArrowRight size={15} /></Link></Card>
    </div>

    <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_.85fr]">
      <Card><div className="flex items-center justify-between"><h2 className="font-bold text-navy">This week’s plan</h2><Link to="/app/calendar" className="text-sm font-semibold text-mint hover:underline">Open calendar</Link></div>
        <div className="mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${weeklyDates.length || 1}, minmax(0, 1fr))` }}>
          {weeklyDates.map((dayDate) => {
            const entry = data.attendance.find((item) => item.event_date === dayDate);
            const recommended = result.recommendedNextOfficeDate === dayDate;
            return <div key={dayDate} className={`rounded-xl border p-2 text-center sm:p-3 ${entry?.status === 'in_office' ? 'border-emerald-200 bg-emerald-50' : recommended ? 'border-dashed border-emerald-400 bg-white' : 'border-slate-100 bg-slate-50'}`}>
              <div className="text-xs text-slate-500">{format(parseISO(`${dayDate}T00:00:00`), 'EEE')}</div>
              <div className="mt-2 text-sm font-bold text-navy">{parseISO(`${dayDate}T00:00:00`).getDate()}</div>
              <div className="mt-1 truncate text-[10px] font-medium text-slate-500">{entry?.status === 'in_office' ? 'In office' : recommended ? 'Recommended' : '—'}</div>
            </div>;
          })}
        </div>
      </Card>
      <Card><div className="flex items-center gap-2"><CalendarClock size={18} className="text-blue-600" /><h2 className="font-bold text-navy">Coming up</h2></div>
        {upcoming.length === 0 ? <p className="mt-5 text-sm text-slate-500">No approved absences or holidays coming up.</p> : <ul className="mt-4 divide-y divide-slate-100">{upcoming.map((item) => <li key={`${item.type}-${item.date}`} className="flex items-center justify-between gap-3 py-3"><span><span className="block text-sm font-semibold text-navy">{item.title}</span><span className="text-xs text-slate-500">{item.type}</span></span><time className="text-sm text-slate-500">{format(parseISO(`${item.date}T00:00:00`), 'MMM d')}</time></li>)}</ul>}
      </Card>
    </div>
    {result.weeklyStatus === 'Action required' && <div className="mt-5"><Alert tone="info"><span className="inline-flex items-center gap-2"><CircleAlert size={16} />No eligible office days remain this week. Review the recorded attendance or policy.</span></Alert></div>}
    {notificationError && <div className="mt-5"><Alert>{notificationError}</Alert></div>}
    {result.canChill && <p className="sr-only" role="status"><CheckCircle2 />Your weekly office target is complete. You can chill.</p>}
    {showQuickAdd && user && <AttendanceDialog userId={user.id} date={today} existing={data.attendance.find((event) => event.event_date === today)} onClose={() => setShowQuickAdd(false)} onSaved={refresh} />}
  </>;
}

function getGreeting() {
  const hour = new Date().getHours();
  return hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
}

