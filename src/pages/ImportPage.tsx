import { useMemo, useState, type ChangeEvent } from 'react';
import Papa from 'papaparse';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { insertImportedAttendance } from '../data/repository';
import type { UserData } from '../data/repository';
import { friendlyError } from '../lib/supabase';
import type { AttendanceStatus } from '../types/domain';
import { Alert, Button, Card, PageTitle } from '../components/UI';

interface OutletData { data: UserData; refresh: () => Promise<void> }
interface CsvRow { date: string; status: string; notes?: string; external_event_id?: string }
interface ValidRow { date: string; status: AttendanceStatus; notes: string; external_event_id: string }
interface RejectedRow { row: number; reason: string; values: CsvRow }
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 1000;
const validStatuses = new Set<AttendanceStatus>(['in_office', 'approved_absence', 'holiday', 'remote', 'not_in_office']);

export function ImportPage() {
  const { user } = useAuth();
  const { refresh } = useOutletContext<OutletData>();
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [rejected, setRejected] = useState<RejectedRow[]>([]);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);

  const parsed = useMemo(() => {
    const accepted: Array<{ line: number; record: ValidRow; values: CsvRow }> = [];
    const issues = [...rejected];
    rows.forEach((row, index) => {
      const date = String(row.date ?? '').trim();
      const statusValue = String(row.status ?? '').trim().toLowerCase();
      const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
        && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
      const status = statusValue as AttendanceStatus;
      if (!dateValid) issues.push({ row: index + 2, reason: 'Date must be a real date in YYYY-MM-DD format.', values: row });
      else if (!validStatuses.has(status)) issues.push({ row: index + 2, reason: 'Status must be one of the supported status values.', values: row });
      else if (String(row.notes ?? '').length > 2000) issues.push({ row: index + 2, reason: 'Notes cannot exceed 2000 characters.', values: row });
      else if (String(row.external_event_id ?? '').length > 2048) issues.push({ row: index + 2, reason: 'External event IDs cannot exceed 2048 characters.', values: row });
      else {
        const notes = String(row.notes ?? '').trim();
        accepted.push({
          line: index + 2,
          values: row,
          record: {
            date,
            status,
            notes,
            external_event_id: String(row.external_event_id ?? '').trim() || `csv:${date}:${status}:${notes}`,
          },
        });
      }
    });
    const seen = new Set<string>();
    const unique: ValidRow[] = [];
    accepted.forEach(({ line, record, values }) => {
      if (seen.has(record.external_event_id)) issues.push({ row: line, reason: 'Duplicate external_event_id in this file.', values });
      else {
        seen.add(record.external_event_id);
        unique.push(record);
      }
    });
    return { accepted: unique, rejected: issues };
  }, [fileName, rejected, rows]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError('');
    setResult('');
    setRejected([]);
    setRows([]);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setError('CSV files must be 2 MB or smaller.');
      return;
    }
    setFileName(file.name);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (parsedCsv) => {
        if (parsedCsv.data.length > MAX_ROWS) {
          setError(`CSV files are limited to ${MAX_ROWS} rows.`);
          return;
        }
        const headers = parsedCsv.meta.fields ?? [];
        if (!headers.includes('date') || !headers.includes('status')) {
          setError('Your CSV needs date and status columns. See the example below.');
          return;
        }
        setRows(parsedCsv.data);
        setRejected(parsedCsv.errors.map((item) => ({
          row: (item.row ?? -2) + 2,
          reason: item.message,
          values: { date: '', status: '' },
        })));
      },
      error: () => setError('We could not read this CSV. Check the file format and try again.'),
    });
  }

  async function importData() {
    if (!user || (parsed.accepted.length === 0 && parsed.rejected.length === 0)) return;
    setBusy(true);
    setError('');
    setResult('');
    try {
      const records = parsed.accepted.map((row) => ({
        event_date: row.date,
        status: row.status,
        notes: row.notes,
        external_event_id: row.external_event_id,
      }));
      const summary = await insertImportedAttendance(records, fileName, parsed.rejected.length);
      setResult(`Import complete: ${summary.inserted} inserted, ${summary.skipped} duplicate${summary.skipped === 1 ? '' : 's'} skipped, ${summary.rejected} rejected.`);
      await refresh();
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setFileName('');
    setRows([]);
    setRejected([]);
    setError('');
    setResult('');
  }

  return <>
    <PageTitle title="Import attendance" description="Bring in a CSV when you need to. Normal use never depends on importing." />
    {error && <div className="mb-5"><Alert>{error}</Alert></div>}
    {result && <div className="mb-5"><Alert tone="success">{result}</Alert></div>}
    <Card><h2 className="font-bold text-navy">CSV format</h2><p className="mt-2 text-sm text-slate-500">Required columns: <code>date,status</code>. Optional: <code>notes,external_event_id</code>. Use ISO dates and status values shown below.</p>
      <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs leading-6 text-slate-100">{`date,status,notes,external_event_id
2026-11-17,in_office,Team day,checkin-001
2026-11-18,remote,Working from home,checkin-002`}</pre>
      <p className="mt-3 text-xs text-slate-500">Maximum 2 MB and {MAX_ROWS.toLocaleString()} rows. Imported records are read-only; corrections must be recorded separately.</p>
      <label className="mt-5 block text-sm font-medium text-slate-700">Select CSV file<input className="form-input mt-2" type="file" accept=".csv,text/csv" onChange={(event) => void chooseFile(event)} /></label>
    </Card>
    {rows.length > 0 && <Card className="mt-5">    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-bold text-navy">Preview: {fileName}</h2><p className="mt-1 text-sm text-slate-500">{parsed.accepted.length} valid, {parsed.rejected.length} rejected</p></div><div className="flex gap-2"><Button variant="secondary" onClick={cancel} disabled={busy}>Cancel</Button><Button onClick={() => void importData()} disabled={busy}>{busy ? 'Importing…' : parsed.accepted.length ? 'Import valid rows' : 'Record rejected rows'}</Button></div></div>
      {parsed.rejected.length > 0 && <div className="mt-4 max-h-48 overflow-auto rounded-xl border border-amber-200 bg-amber-50 p-3"><h3 className="text-sm font-semibold text-amber-900">Rejected rows</h3><ul className="mt-2 space-y-1 text-xs text-amber-900">{parsed.rejected.map((item, index) => <li key={`${item.row}-${index}`}>Row {item.row || '—'}: {item.reason}</li>)}</ul></div>}
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[500px] text-left text-sm"><thead><tr className="border-b border-slate-100 text-xs text-slate-500"><th className="py-2">Date</th><th>Status</th><th>Notes</th><th>External ID</th></tr></thead><tbody>{parsed.accepted.slice(0, 10).map((row, index) => <tr key={`${row.external_event_id}-${index}`} className="border-b border-slate-50"><td className="py-2">{row.date}</td><td>{row.status.replaceAll('_', ' ')}</td><td>{row.notes || '—'}</td><td>{row.external_event_id}</td></tr>)}</tbody></table>{parsed.accepted.length > 10 && <p className="mt-2 text-xs text-slate-500">Showing first 10 valid rows of {parsed.accepted.length}.</p>}</div>
    </Card>}
  </>;
}
