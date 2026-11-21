import { format, parseISO } from 'date-fns';
import { Bell, Check } from 'lucide-react';
import { useOutletContext } from 'react-router-dom';
import { markNotificationRead } from '../data/repository';
import type { UserData } from '../data/repository';
import { friendlyError } from '../lib/supabase';
import { Alert, Button, Card, EmptyState, PageTitle } from '../components/UI';
import { useState } from 'react';

interface OutletData { data: UserData; refresh: () => Promise<void> }

export function Notifications() {
  const { data, refresh } = useOutletContext<OutletData>();
  const [error, setError] = useState('');
  async function markRead(id: string) {
    setError('');
    try {
      await markNotificationRead(id);
      await refresh();
    } catch (cause) { setError(friendlyError(cause)); }
  }
  return <>
    <PageTitle title="Notifications" description="In-app updates for your office week." />
    {error && <div className="mb-4"><Alert>{error}</Alert></div>}
    {data.notifications.length === 0 ? <EmptyState title="You’re all caught up" description="There are no in-app notifications to show right now." /> :
      <div className="space-y-3">{data.notifications.map((item) => <Card key={item.id} className={item.read_at ? 'opacity-75' : ''}>
        <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><Bell size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-navy">{item.title}</h2><p className="mt-1 text-sm text-slate-600">{item.message}</p><time className="mt-2 block text-xs text-slate-400">{format(parseISO(item.due_at), 'MMM d, yyyy · h:mm a')}</time></div>{!item.read_at && <Button variant="secondary" className="px-3 py-2" onClick={() => void markRead(item.id)}><Check size={15} />Mark read</Button>}</div></div></div>
      </Card>)}</div>}
  </>;
}
