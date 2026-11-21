import { Suspense, lazy, type ComponentType } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { AuthPage } from './auth/AuthPage';
import { AppLayout } from './components/AppLayout';
import { RequireAuth } from './auth/RequireAuth';
import { Dashboard } from './pages/Dashboard';
import { Landing } from './pages/Landing';
import { Onboarding } from './pages/Onboarding';

function named<T extends Record<string, ComponentType>>(load: () => Promise<T>, key: keyof T) {
  return lazy(async () => ({ default: (await load())[key] }));
}
const CalendarPage = named(() => import('./pages/CalendarPage'), 'CalendarPage');
const History = named(() => import('./pages/History'), 'History');
const ImportPage = named(() => import('./pages/ImportPage'), 'ImportPage');
const Insights = named(() => import('./pages/Insights'), 'Insights');
const Notifications = named(() => import('./pages/Notifications'), 'Notifications');
const Privacy = named(() => import('./pages/Privacy'), 'Privacy');
const Settings = named(() => import('./pages/Settings'), 'Settings');

function AppRoutes() {
  return <Suspense fallback={<p className="p-8 text-sm text-slate-500" role="status">Loading…</p>}><Routes>
    <Route path="/" element={<Landing />} />
    <Route path="/privacy" element={<Privacy />} />
    <Route path="/signin" element={<AuthPage mode="signin" />} />
    <Route path="/signup" element={<AuthPage mode="signup" />} />
    <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
    <Route path="/reset-password" element={<AuthPage mode="reset" />} />
    <Route element={<RequireAuth />}>
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/app" element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="insights" element={<Insights />} />
        <Route path="history" element={<History />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></Suspense>;
}

export default function App() {
  return <HashRouter><AuthProvider><AppRoutes /></AuthProvider></HashRouter>;
}
