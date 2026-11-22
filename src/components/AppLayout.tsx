import { Navigate, NavLink, Outlet } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  DoorOpen,
  House,
  Settings,
  Upload,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { useUserData } from '../hooks/useUserData';
import { Button, Loading } from './UI';

const navigation = [
  { to: '/app', label: 'Overview', icon: House, end: true },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/app/insights', label: 'Insights', icon: ChartNoAxesCombined },
  { to: '/app/history', label: 'History', icon: ClipboardList },
  { to: '/app/import', label: 'Import', icon: Upload },
  { to: '/app/notifications', label: 'Notifications', icon: Bell },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

export function AppLayout() {
  const { user, signOut } = useAuth();
  const { data, loading, error, refresh } = useUserData(user?.id);

  if (loading) return <Loading />;
  if (error) return <main className="mx-auto max-w-3xl px-5 py-12"><div role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-red-800">{error}<Button className="ml-3" variant="secondary" onClick={() => void refresh()}>Try again</Button></div></main>;
  if (!data) return <Loading />;
  if (!data.profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <NavLink to="/app" className="flex items-center gap-2.5 font-bold tracking-tight text-navy">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-mint"><DoorOpen size={19} aria-hidden="true" /></span>
            <span>office buddy</span>
          </NavLink>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">Hi, {data.profile.display_name || user?.email}</span>
            <Button variant="plain" className="px-3" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Main navigation" className="min-w-0 border-b border-slate-200 bg-white px-3 py-3 lg:min-h-[calc(100vh-4rem)] lg:border-b-0 lg:border-r lg:px-4 lg:py-7">
          <div className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-1.5">
            {navigation.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) =>
                `flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50 hover:text-navy'}`
              }>
                <Icon size={18} aria-hidden="true" /><span>{label}</span>
              </NavLink>
            ))}
          </div>
        </nav>
        <main className="min-w-0 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
          <Outlet context={{ data, refresh }} />
        </main>
      </div>
    </div>
  );
}
