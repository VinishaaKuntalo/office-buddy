import { useEffect, useMemo, useState } from 'react';
import { addMonths, endOfMonth, format, getDay, parseISO, startOfMonth, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { fetchCalendarData, type UserData } from '../data/repository';
import { addDateDays, dateKey, todayInTimezone } from '../lib/dates';
import { evaluateAttendance } from '../rules/engine';
import type { AttendanceStatus } from '../types/domain';
import { AttendanceDialog } from '../components/AttendanceDialog';
import { Button, Card, PageTitle } from '../components/UI';

interface OutletData { data: UserData; refresh: () => Promise<void> }
const mondayFirst = (day: number) => (day + 6) % 7;

export function CalendarPage() {
  const { user } = useAuth();
  const { data, refresh } = useOutletContext<OutletData>();
  const today = todayInTimezone(data.profile.timezone);
  const [month, setMonth] = useState(parseISO(`${today.slice(0, 7)}-01T00:00:00`));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState(data.attendance);
  const [calendarAbsences, setCalendarAbsences] = useState(data.absences);
  const [calendarHolidays, setCalendarHolidays] = useState(data.holidays);
  const [calendarError, setCalendarError] = useState('');
  const days = useMemo(() => {
    const first = startOfMonth(month);
    const firstKey = dateKey(first);
    const start = addDateDays(firstKey, -mondayFirst(getDay(first)));
    const end = dateKey(endOfMonth(month));
    const endColumn = mondayFirst(getDay(endOfMonth(month)));
    const paddedEnd = addDateDays(end, 6 - endColumn);
    const result: string[] = [];
    for (let date = start; date <= paddedEnd; date = addDateDays(date, 1)) result.push(date);
    return result;
  }, [month]);
  useEffect(() => {
    if (!user) return;
    const start = days[0];
    const end = days[days.length - 1];
    let active = true;
    void fetchCalendarData(user.id, start, end).then((result) => {
      if (active) {
        setCalendarEvents(result.attendance);
        setCalendarAbsences(result.absences);
        setCalendarHolidays(result.holidays);
        setCalendarError('');
      }
    }).catch(() => {
      if (active) setCalendarError('Calendar records could not be loaded. Check your connection and try again.');
    });
    return () => { active = false; };
  }, [days, user]);
  const evaluated = evaluateAttendance({
    timezone: data.profile.timezone,
    dateRange: { start: dateKey(startOfMonth(month)), end: dateKey(endOfMonth(month)) },
    policy: data.policy,
    policies: data.policies,
    attendanceEvents: data.attendance,
    approvedAbsences: data.absences,
    holidays: data.holidays,
    currentDate: today,
  });
  const selectedEvent = selectedDate ? calendarEvents.find((event) => event.event_date === selectedDate) : undefined;

  function getDateStatus(date: string): AttendanceStatus | 'recommended' | null {
    if (calendarHolidays.some((holiday) => holiday.holiday_date === date)) return 'holiday';
    if (calendarAbsences.some((absence) => date >= absence.start_date && date <= absence.end_date)) return 'approved_absence';
    const event = calendarEvents.find((item) => item.event_date === date);
    if (event) return event.status;
    if (evaluated.recommendedNextOfficeDate === date) return 'recommended';
    return null;
  }

  function handleKeyDown(event: import('react').KeyboardEvent<HTMLButtonElement>, date: string) {
    const movements: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 7, ArrowUp: -7 };
    const movement = movements[event.key];
    if (!movement) return;
    event.preventDefault();
    const next = addDateDays(date, movement);
    document.querySelector<HTMLButtonElement>(`[data-calendar-date="${next}"]`)?.focus();
  }

  return <>
    <PageTitle title="Calendar" description="Choose a date to record your office day, absence, or holiday." action={
      <Button onClick={() => setSelectedDate(today)}>Add today</Button>
    } />
    {calendarError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{calendarError}</p>}
    <Card>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold text-navy">{format(month, 'MMMM yyyy')}</h2><p className="mt-1 text-xs text-slate-500">Recommended days are outlined, not required days.</p></div>
        <div className="flex gap-2"><Button variant="secondary" className="px-3" aria-label="Previous month" onClick={() => setMonth((current) => subMonths(current, 1))}><ChevronLeft size={18} /></Button><Button variant="secondary" className="px-3" aria-label="Next month" onClick={() => setMonth((current) => addMonths(current, 1))}><ChevronRight size={18} /></Button></div>
      </div>
      <div role="grid" aria-label={`${format(month, 'MMMM yyyy')} calendar`} className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div role="columnheader" key={day} className="py-2 text-center text-xs font-semibold text-slate-500">{day}</div>)}
        {days.map((date) => {
          const inMonth = date.startsWith(format(month, 'yyyy-MM'));
          const status = getDateStatus(date);
          const dayClasses: Record<string, string> = {
            in_office: 'bg-emerald-100 text-emerald-900 hover:bg-emerald-200',
            approved_absence: 'bg-blue-100 text-blue-900 hover:bg-blue-200',
            holiday: 'bg-purple-100 text-purple-900 hover:bg-purple-200',
            remote: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
            not_in_office: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
            recommended: 'border-2 border-dashed border-emerald-500 bg-white text-emerald-800 hover:bg-emerald-50',
          };
          const label = status ? `${date}, ${status.replaceAll('_', ' ')}` : date;
          return <button role="gridcell" key={date} type="button" data-calendar-date={date} aria-label={label} aria-current={date === today ? 'date' : undefined} onKeyDown={(event) => handleKeyDown(event, date)} onClick={() => setSelectedDate(date)}
            className={`relative min-h-14 rounded-xl border border-transparent p-1 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy sm:min-h-20 sm:p-2 ${!inMonth ? 'opacity-30' : ''} ${dayClasses[status ?? ''] ?? 'bg-slate-50 text-slate-700 hover:bg-slate-100'} ${date === today ? 'ring-2 ring-navy ring-offset-1' : ''}`}>
            <span>{parseISO(`${date}T00:00:00`).getDate()}</span>
            {status && <span className="mt-1 block truncate text-[9px] font-semibold sm:text-[10px]">{status === 'in_office' ? 'In office' : status === 'approved_absence' ? 'Absence' : status === 'not_in_office' ? 'Not in office' : status === 'recommended' ? 'Recommended' : status[0].toUpperCase() + status.slice(1)}</span>}
          </button>;
        })}
      </div>
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-600">
        <Legend color="bg-emerald-200" label="In office" /><Legend color="bg-blue-200" label="Approved absence" /><Legend color="bg-purple-200" label="Holiday" /><Legend color="bg-slate-200" label="Remote / not in office" /><Legend color="border border-dashed border-emerald-500" label="Recommended" />
      </div>
    </Card>
    <p className="mt-4 text-xs text-slate-500">Entries are stored in your account. Imported source records are read-only; manual records can be edited or deleted.</p>
    {selectedDate && user && <AttendanceDialog
      userId={user.id}
      date={selectedDate}
      existing={selectedEvent}
      existingAbsence={calendarAbsences.find((absence) => selectedDate >= absence.start_date && selectedDate <= absence.end_date)}
      existingHoliday={calendarHolidays.find((holiday) => holiday.holiday_date === selectedDate)}
      onClose={() => setSelectedDate(null)}
      onSaved={async () => {
        await refresh();
        const updated = await fetchCalendarData(user.id, days[0], days[days.length - 1]);
        setCalendarEvents(updated.attendance);
        setCalendarAbsences(updated.absences);
        setCalendarHolidays(updated.holidays);
      }}
    />}
  </>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-2"><span className={`size-3 rounded-sm ${color}`} />{label}</span>;
}
