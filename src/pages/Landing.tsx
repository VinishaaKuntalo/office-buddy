import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, Check, DoorOpen, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

export function Landing() {
  const { user } = useAuth();
  if (user) return <Navigate to="/app" replace />;
  return <main className="min-h-screen bg-canvas">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
      <Link to="/" className="flex items-center gap-2.5 font-bold text-navy"><span className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-mint"><DoorOpen size={19} /></span>office buddy</Link>
      <nav className="flex items-center gap-2"><Link className="rounded-xl px-4 py-2 text-sm font-semibold text-navy hover:bg-white" to="/signin">Sign in</Link><Link className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800" to="/signup">Get started</Link></nav>
    </header>
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-12 md:grid-cols-[1.05fr_.95fr] md:pt-24">
      <div>
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800"><span className="size-2 rounded-full bg-mint" />A calmer way to plan your office week</div>
        <h1 className="max-w-xl text-4xl font-bold leading-tight tracking-tight text-navy sm:text-5xl">Know when you’re done with the office.</h1>
        <p className="mt-5 max-w-lg text-lg leading-8 text-slate-600">Keep attendance, approved absences, and holidays in one clear view. Office Buddy tells you what’s left—then gives you permission to chill.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link to="/signup" className="inline-flex items-center gap-2 rounded-xl bg-navy px-5 py-3 font-semibold text-white hover:bg-slate-800">Create your account <ArrowRight size={17} /></Link><Link to="/signin" className="rounded-xl border border-slate-200 bg-white px-5 py-3 font-semibold text-navy hover:bg-slate-50">Sign in</Link></div>
        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500"><span className="inline-flex items-center gap-1.5"><Check size={15} className="text-mint" />Your data stays yours</span><span className="inline-flex items-center gap-1.5"><Check size={15} className="text-mint" />No badge tracking</span><span className="inline-flex items-center gap-1.5"><Check size={15} className="text-mint" />Start free</span></div>
      </div>
      <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-soft sm:p-7">
        <div className="flex items-center justify-between"><div><p className="text-sm font-medium text-slate-500">This week</p><p className="mt-1 text-2xl font-bold text-navy">2 of 3 days</p></div><div className="grid size-12 place-items-center rounded-2xl bg-amber-50 text-amber-600"><DoorOpen size={22} /></div></div>
        <div className="mt-6 grid grid-cols-5 gap-2 text-center text-xs">
          {['M', 'T', 'W', 'T', 'F'].map((day, index) => <div key={`${day}-${index}`}><div className="text-slate-400">{day}</div><div className={`mt-2 grid aspect-square place-items-center rounded-xl font-semibold ${index < 2 ? 'bg-emerald-100 text-emerald-800' : index < 4 ? 'border border-dashed border-emerald-400 text-emerald-700' : 'bg-slate-50 text-slate-400'}`}>{index < 2 ? <Check size={16} /> : index + 17}</div></div>)}
        </div>
        <div className="mt-6 rounded-2xl bg-amber-50 p-4"><p className="font-semibold text-amber-900">One more office day needed</p><p className="mt-1 text-sm text-amber-800">Thursday is your recommended day.</p></div>
        <div className="mt-5 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={15} className="text-mint" />Attendance and settings live in your own Supabase account.</div>
      </div>
    </section>
    <footer className="mx-auto flex max-w-6xl flex-col gap-3 border-t border-slate-200 px-5 py-7 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
      <p>Office Buddy stores your attendance and policy in your own Supabase account—not as browser data.</p>
      <Link to="/privacy" className="font-semibold text-mint hover:underline">Privacy notice</Link>
    </footer>
  </main>;
}
