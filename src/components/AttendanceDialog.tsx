import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { deleteAbsence, deleteAttendance, deleteHoliday, saveAbsence, saveAttendance, saveHoliday } from '../data/repository';
import { friendlyError } from '../lib/supabase';
import type { ApprovedAbsence, AttendanceEvent, AttendanceStatus, Holiday } from '../types/domain';
import { Alert, Button, Field } from './UI';

type Status = AttendanceStatus | 'approved_absence' | 'holiday';

export function AttendanceDialog({
  userId,
  date,
  existing,
  existingAbsence,
  existingHoliday,
  onClose,
  onSaved,
}: {
  userId: string;
  date: string;
  existing?: AttendanceEvent;
  existingAbsence?: ApprovedAbsence;
  existingHoliday?: Holiday;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [status, setStatus] = useState<Status>(existingAbsence ? 'approved_absence' : existingHoliday ? 'holiday' : existing?.status ?? 'in_office');
  const [notes, setNotes] = useState(existingAbsence?.reason ?? existing?.notes ?? '');
  const [name, setName] = useState(existingHoliday?.name ?? '');
  const [startDate, setStartDate] = useState(existingAbsence?.start_date ?? date);
  const [endDate, setEndDate] = useState(existingAbsence?.end_date ?? date);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const source = existingHoliday?.source ?? existingAbsence?.source ?? existing?.source ?? 'manual';
  const readOnly = [existing?.source, existingAbsence?.source, existingHoliday?.source]
    .some((recordSource) => recordSource !== undefined && recordSource !== 'manual');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    return () => previousFocus?.focus();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (status === 'approved_absence') {
        await saveAbsence({ id: existingAbsence?.id, userId, startDate, endDate, reason: notes });
      } else if (status === 'holiday') {
        await saveHoliday({ id: existingHoliday?.id, userId, date, name: name.trim() });
      } else {
        await saveAttendance({ id: existing?.id, userId, date, status, notes });
      }
      await onSaved();
      onClose();
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if ((!existing && !existingAbsence && !existingHoliday) || !window.confirm(`Delete the manual record for ${date}? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      if (existing) await deleteAttendance(existing.id);
      if (existingAbsence) await deleteAbsence(existingAbsence.id);
      if (existingHoliday) await deleteHoliday(existingHoliday.id);
      await onSaved();
      onClose();
    } catch (cause) {
      setError(friendlyError(cause));
      setBusy(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && !busy) onClose();
    if (event.key === 'Tab' && dialogRef.current) {
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-navy/40 p-4" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="attendance-title" onKeyDown={handleKeyDown} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div><h2 id="attendance-title" className="text-xl font-bold text-navy">{existing || existingAbsence || existingHoliday ? 'Edit date' : 'Add a date'}</h2><p className="mt-1 text-sm text-slate-500">{date}</p></div>
          <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mint" aria-label="Close" onClick={onClose} disabled={busy}><X size={18} /></button>
        </div>
        {(existing || existingAbsence || existingHoliday) && <p className="mt-2 text-xs text-slate-500">Source: {(existing?.source ?? existingAbsence?.source ?? existingHoliday?.source ?? 'manual').replaceAll('_', ' ')}</p>}
        {error && <div className="mt-4"><Alert>{error}</Alert></div>}
        <form onSubmit={submit} className="mt-5 space-y-4">
          {readOnly ? <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p><strong className="text-navy">Source:</strong> {source.replaceAll('_', ' ')}</p>
            {existing && <><p className="mt-2"><strong className="text-navy">Status:</strong> {existing.status.replaceAll('_', ' ')}</p>{existing.notes && <p className="mt-2"><strong className="text-navy">Notes:</strong> {existing.notes}</p>}</>}
            {existingAbsence && <><p className="mt-2"><strong className="text-navy">Status:</strong> Approved absence</p><p className="mt-2">{existingAbsence.start_date} – {existingAbsence.end_date}</p>{existingAbsence.reason && <p className="mt-2"><strong className="text-navy">Reason:</strong> {existingAbsence.reason}</p>}</>}
            {existingHoliday && <><p className="mt-2"><strong className="text-navy">Status:</strong> Holiday</p><p className="mt-2">{existingHoliday.name}</p></>}
            <p className="mt-2 text-xs text-slate-500">Imported records are read-only. Create an administrative correction through the source system.</p>
          </div> : <Field label="What happened?">
            <select className="form-select" value={status} onChange={(event) => setStatus(event.target.value as Status)}>
              {existingAbsence || existingHoliday
                  ? <option value={status}>{status.replaceAll('_', ' ')}</option>
                  : existing
                    ? <><option value="in_office">In office</option><option value="remote">Remote</option><option value="not_in_office">Not in office</option></>
                    : <><option value="in_office">In office</option><option value="approved_absence">Approved absence</option><option value="holiday">Holiday</option><option value="remote">Remote</option><option value="not_in_office">Not in office</option></>}
            </select>
          </Field>}
          {!readOnly && status === 'approved_absence' && <div className="grid gap-3 sm:grid-cols-2"><Field label="First day">
            <input className="form-input" type="date" value={startDate} required onChange={(event) => setStartDate(event.target.value)} />
          </Field><Field label="Last day">
            <input className="form-input" type="date" min={startDate} value={endDate} required onChange={(event) => setEndDate(event.target.value)} />
          </Field></div>}
          {!readOnly && status === 'holiday' && <Field label="Holiday name">
            <input className="form-input" value={name} maxLength={120} required onChange={(event) => setName(event.target.value)} />
          </Field>}
          {!readOnly && status !== 'holiday' && <Field label={status === 'approved_absence' ? 'Reason (optional)' : 'Notes (optional)'}>
            <textarea className="form-textarea" rows={3} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </Field>}
          <div className="flex flex-wrap justify-between gap-3 pt-1">
            <span>{!readOnly && (existing?.source === 'manual' || existingAbsence?.source === 'manual' || existingHoliday?.source === 'manual') && <Button type="button" variant="danger" onClick={() => void remove()} disabled={busy}>Delete record</Button>}</span>
            <span className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>{readOnly ? 'Close' : 'Cancel'}</Button>{!readOnly && <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save date'}</Button>}</span>
          </div>
        </form>
      </div>
    </div>
  );
}
