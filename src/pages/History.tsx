import { useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { fetchAttendancePage, type UserData } from '../data/repository';
import type { AttendanceEvent, AttendanceStatus } from '../types/domain';
import { AttendanceDialog } from '../components/AttendanceDialog';
import { Alert, Card, EmptyState, Field, Loading, PageTitle } from '../components/UI';
import { friendlyError } from '../lib/supabase';

interface OutletData { data: UserData; refresh: () => Promise<void> }
const statuses: AttendanceStatus[] = ['in_office', 'approved_absence', 'holiday', 'remote', 'not_in_office'];
const sources = ['manual', 'csv_import', 'badge', 'hr_feed', 'outlook', 'holiday_feed', 'admin_correction', 'system'];

export function History() {
  const { user } = useAuth();
  const { data, refresh } = useOutletContext<OutletData>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<AttendanceEvent | null>(null);
  const [reload, setReload] = useState(0);
  const pageSize = 20;
  const [records, setRecords] = useState(data.attendance.slice(0, pageSize));
  const [total, setTotal] = useState(data.attendance.length);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setError('');
    void fetchAttendancePage({
      userId: user.id,
      fromDate: from || undefined,
      toDate: to || undefined,
      status,
      source,
      page,
      pageSize,
    }).then((result) => {
      if (active) {
        setRecords(result.rows);
        setTotal(result.total);
      }
    }).catch((cause: unknown) => {
      if (active) setError(friendlyError(cause));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [from, page, pageSize, reload, source, status, to, user]);

  return <>
    <PageTitle title="Attendance history" description="Review recently recorded attendance and its source." />
    <Card className="mb-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="From"><input className="form-input" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(0); }} /></Field>
        <Field label="To"><input className="form-input" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(0); }} /></Field>
        <Field label="Status"><select className="form-select" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}><option value="">All statuses</option>{statuses.map((item) => <option value={item} key={item}>{item.replaceAll('_', ' ')}</option>)}</select></Field>
        <Field label="Source"><select className="form-select" value={source} onChange={(event) => { setSource(event.target.value); setPage(0); }}><option value="">All sources</option>{sources.map((item) => <option value={item} key={item}>{item.replaceAll('_', ' ')}</option>)}</select></Field>
      </div>
    </Card>
    {error && <div className="mb-4"><Alert>{error}</Alert></div>}
    {loading ? <Loading label="Loading attendance history…" /> : total === 0 ? <EmptyState title="No attendance records yet" description="Attendance entries will appear here after you add them from the calendar or dashboard." /> :
      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Source</th><th className="px-5 py-3">Notes</th><th className="px-5 py-3">Action</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{records.map((event) => <tr key={event.id}><td className="px-5 py-4 font-medium text-navy">{format(parseISO(`${event.event_date}T00:00:00`), 'MMM d, yyyy')}</td><td className="px-5 py-4 capitalize text-slate-700">{event.status.replaceAll('_', ' ')}</td><td className="px-5 py-4 capitalize text-slate-500">{event.source.replaceAll('_', ' ')}</td><td className="max-w-60 truncate px-5 py-4 text-slate-500">{event.notes || '—'}</td><td className="px-5 py-4">{event.source === 'manual' ? <button className="font-semibold text-mint hover:underline" onClick={() => setSelected(event)}>Edit</button> : <span className="text-xs text-slate-400">Read-only</span>}</td></tr>)}</tbody>
        </table></div>
        <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500"><span>{total} record{total === 1 ? '' : 's'}</span><div className="flex gap-3"><button className="font-semibold text-mint disabled:text-slate-300" disabled={page === 0} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="font-semibold text-mint disabled:text-slate-300" disabled={(page + 1) * pageSize >= total} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
      </Card>}
    {selected && user && <AttendanceDialog userId={user.id} date={selected.event_date} existing={selected} onClose={() => setSelected(null)} onSaved={async () => { await refresh(); setReload((value) => value + 1); }} />}
  </>;
}
