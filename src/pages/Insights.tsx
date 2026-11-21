import { format, parseISO } from 'date-fns';
import { useOutletContext } from 'react-router-dom';
import type { UserData } from '../data/repository';
import { datesBetween, todayInTimezone } from '../lib/dates';
import { evaluateAttendance, getReportingMonth } from '../rules/engine';
import { Card, PageTitle } from '../components/UI';

interface OutletData { data: UserData }

export function Insights() {
  const { data } = useOutletContext<OutletData>();
  const today = todayInTimezone(data.profile.timezone);
  const result = evaluateAttendance({
    timezone: data.profile.timezone,
    dateRange: { start: `${today.slice(0, 4)}-01-01`, end: `${today.slice(0, 4)}-12-31` },
    policy: data.policy,
    policies: data.policies,
    attendanceEvents: data.attendance,
    approvedAbsences: data.absences,
    holidays: data.holidays,
    currentDate: today,
  });
  const monthAttendance = result.monthly.completedOfficeDays;
  const attendedPercent = result.monthly.adjustedRequirement > 0
    ? Math.round((monthAttendance / result.monthly.adjustedRequirement) * 100)
    : 0;
  const policyForDate = (date: string) => data.policies.find((policy) =>
    policy.effective_from <= date && (!policy.effective_to || policy.effective_to >= date),
  ) ?? data.policy;
  const monthAbsenceDates = new Set(data.absences.flatMap((absence) => {
    const start = absence.start_date < result.monthly.start ? result.monthly.start : absence.start_date;
    const end = absence.end_date > result.monthly.end ? result.monthly.end : absence.end_date;
    return start <= end
      ? datesBetween(start, end).filter((date) =>
        getReportingMonth(date, policyForDate(date).month_end_rule) === result.reportingMonth,
      )
      : [];
  }));
  const monthHolidayDates = new Set(data.holidays
    .map((holiday) => holiday.holiday_date)
    .filter((date) => getReportingMonth(date, policyForDate(date).month_end_rule) === result.reportingMonth));
  const weeklyBreakdown = [...new Set(
    result.attendanceAssignments
      .filter((assignment) => assignment.reportingMonth === result.reportingMonth)
      .map((assignment) => `${assignment.reportingWeek.start}/${assignment.reportingWeek.end}`),
  )].map((week) => {
    const [start, end] = week.split('/');
    const count = new Set(
      result.attendanceAssignments
        .filter((assignment) =>
          assignment.reportingMonth === result.reportingMonth
          && assignment.reportingWeek.start === start
          && assignment.reportingWeek.end === end
          && data.attendance.some((event) => event.event_date === assignment.attendanceDate && event.status === 'in_office'),
        )
        .map((assignment) => assignment.attendanceDate),
    ).size;
    return { start, end, count };
  }).sort((left, right) => left.start.localeCompare(right.start));
  return <>
    <PageTitle title="Weekly insights" description="See the numbers behind your recommendation." />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric title="Normal weekly target" value={`${result.normalRequirement} days`} />
      <Metric title="Adjusted target" value={`${result.adjustedRequirement} days`} />
      <Metric title="Completed" value={`${result.completedOfficeDays} days`} />
      <Metric title="Still needed" value={`${result.remainingOfficeDays} days`} />
    </div>
    <Card className="mt-5">
      <h2 className="font-bold text-navy">This week, step by step</h2>
      <ul className="mt-4 space-y-3 text-sm text-slate-600">
        <li className="flex justify-between gap-4"><span>Week of Monday</span><strong>{format(parseISO(`${result.reportingWeek.start}T00:00:00`), 'MMMM d')} – {format(parseISO(`${result.reportingWeek.end}T00:00:00`), 'MMMM d, yyyy')}</strong></li>
        <li className="flex justify-between gap-4"><span>Eligible office dates remaining</span><strong>{result.eligibleRemainingDates.length}</strong></li>
        <li className="flex justify-between gap-4"><span>Recommended next date</span><strong>{result.recommendedNextOfficeDate ? format(parseISO(`${result.recommendedNextOfficeDate}T00:00:00`), 'EEEE, MMMM d') : 'No eligible date remaining'}</strong></li>
        <li className="flex justify-between gap-4"><span>Status</span><strong>{result.weeklyStatus}</strong></li>
      </ul>
      {result.explanationMessages.length > 0 && <div className="mt-5 space-y-2">{result.explanationMessages.map((message) => <p key={message} className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{message}</p>)}</div>}
      <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-sm font-semibold text-navy">Why this result?</p><ul className="mt-2 list-inside list-disc space-y-1 text-sm text-slate-600">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
    </Card>
    <PageTitle title="Monthly insights" description={`Reporting month: ${format(parseISO(`${result.reportingMonth}-01T00:00:00`), 'MMMM yyyy')}`} />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric title="Office attendance" value={`${monthAttendance} days`} />
      <Metric title="Adjusted expected" value={`${result.monthly.adjustedRequirement} days`} />
      <Metric title="Approved absence dates" value={`${monthAbsenceDates.size}`} />
      <Metric title="Holiday dates" value={`${monthHolidayDates.size}`} />
    </div>
    <Card className="mt-5">
      <div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-navy">Month progress</h2><p className="mt-1 text-sm text-slate-500">Attendance as a share of your adjusted expected total.</p></div><strong className="text-xl text-navy">{result.monthly.adjustedRequirement === 0 ? '—' : `${attendedPercent}%`}</strong></div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-mint" style={{ width: `${result.monthly.adjustedRequirement === 0 ? 0 : Math.min(attendedPercent, 100)}%` }} /></div>
      <p className="mt-2 text-xs text-slate-500">You attended {monthAttendance} of {result.monthly.adjustedRequirement} adjusted expected office days{attendedPercent > 100 ? ' (over target)' : ''}.</p>
      <p className="mt-4 text-xs leading-5 text-slate-500">The month-end Monday reporting rule assigns a final Monday’s attendance to the ending month without changing the recorded date. {result.explanationMessages.find((message) => message.includes('month-end')) ?? ''}</p>
      <div className="mt-6 border-t border-slate-100 pt-4"><h3 className="text-sm font-bold text-navy">Week-by-week attendance</h3>
        {weeklyBreakdown.length === 0 ? <p className="mt-2 text-sm text-slate-500">No office attendance recorded in this reporting month yet.</p> : <ul className="mt-2 divide-y divide-slate-100">{weeklyBreakdown.map((week) => <li key={`${week.start}-${week.end}`} className="flex items-center justify-between py-2 text-sm"><span>{format(parseISO(`${week.start}T00:00:00`), 'MMM d')} – {format(parseISO(`${week.end}T00:00:00`), 'MMM d')}</span><strong className="text-navy">{week.count} office day{week.count === 1 ? '' : 's'}</strong></li>)}</ul>}
      </div>
    </Card>
  </>;
}

function Metric({ title, value }: { title: string; value: string }) {
  return <Card><p className="text-sm text-slate-500">{title}</p><p className="mt-2 text-2xl font-bold text-navy">{value}</p></Card>;
}
