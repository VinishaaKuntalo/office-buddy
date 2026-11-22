import { useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardList,
  DoorOpen,
  House,
  Menu,
  Settings,
  Upload,
  X,
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
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  if (loading) return <Loading />;
  if (error) return <main className="mx-auto max-w-3xl px-5 py-12"><div role="alert" className="rounded-2xl border border-red-200 bg-white p-6 text-red-800">{error}<Button className="ml-3" variant="secondary" onClick={() => void refresh()}>Try again</Button></div></main>;
  if (!data) return <Loading />;
  if (!data.profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />;
  }

  const navLinks = (
    <div className="flex flex-col gap-1.5">
      {navigation.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setMenuOpen(false)} className={({ isActive }) =>
          `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-50 hover:text-navy'}`
        }>
          <Icon size={18} aria-hidden="true" /><span>{label}</span>
        </NavLink>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Open menu" aria-expanded={menuOpen} aria-controls="mobile-nav" onClick={() => setMenuOpen(true)} className="-ml-2 grid size-10 place-items-center rounded-xl text-navy hover:bg-slate-100 lg:hidden">
              <Menu size={22} aria-hidden="true" />
            </button>
          <NavLink to="/app" className="flex items-center gap-2.5 font-bold tracking-tight text-navy">
            <span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-mint"><DoorOpen size={19} aria-hidden="true" /></span>
            <span>office buddy</span>
          </NavLink>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:block">Hi, {data.profile.display_name || user?.email}</span>
            <Button variant="plain" className="px-3" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Main navigation" className="hidden min-h-[calc(100vh-4rem)] border-r border-slate-200 bg-white px-4 py-7 lg:block">
          {navLinks}
        </nav>
        <main className="min-w-0 px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
          <Outlet context={{ data, refresh }} />
        </main>
      </div>
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy/40" aria-hidden="true" onClick={() => setMenuOpen(false)} />
          <nav id="mobile-nav" aria-label="Main navigation" role="dialog" aria-modal="true" className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-white px-4 py-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-bold tracking-tight text-navy">Menu</span>
              <button type="button" aria-label="Close menu" autoFocus onClick={() => setMenuOpen(false)} className="grid size-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100">
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {navLinks}
          </nav>
        </div>
      )}
    </div>
  );
}
