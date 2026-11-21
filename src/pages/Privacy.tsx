import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export function Privacy() {
  return <main className="min-h-screen bg-canvas px-4 py-10 sm:py-16">
    <article className="mx-auto max-w-3xl rounded-3xl border border-slate-100 bg-white p-6 shadow-soft sm:p-10">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-mint hover:underline"><ArrowLeft size={16} />Back to Office Buddy</Link>
      <div className="mt-7 flex items-center gap-3"><ShieldCheck className="text-mint" size={24} /><h1 className="text-3xl font-bold text-navy">Privacy notice</h1></div>
      <div className="mt-6 space-y-5 text-sm leading-6 text-slate-600">
        <section><h2 className="font-bold text-navy">What is stored and why</h2><p className="mt-2">Office Buddy stores your account profile, timezone, office location label, attendance entries, approved absences, holidays, attendance-policy preferences, in-app notifications, and CSV import counts in your Supabase account. This information is used only to calculate and display your office-day progress and support account features.</p></section>
        <section><h2 className="font-bold text-navy">Your data and imported data</h2><p className="mt-2">You control manually entered attendance and can edit or remove those records in the app. Imported organizational records may have separate retention requirements set by the organization that supplied them; imported attendance is read-only in this app.</p></section>
        <section><h2 className="font-bold text-navy">Storage and access</h2><p className="mt-2">Application data is stored in PostgreSQL in your Supabase project and protected by database Row Level Security. The app does not use browser storage as the authoritative source for attendance, policies, absences, holidays, preferences, or calculated progress. Supabase Auth may store its own session on the browser so you can stay signed in.</p></section>
        <section><h2 className="font-bold text-navy">Account deletion</h2><p className="mt-2">Use <strong>Settings → Delete account</strong> and confirm the warning. This deletes your Supabase Auth account and its linked Office Buddy records. If an organization has other members, its shared organization record may remain. Database backups or provider retention windows may follow Supabase's applicable terms.</p></section>
        <p className="border-t border-slate-100 pt-4 text-xs">This notice describes the Office Buddy MVP. If your organization supplies data, review its policies and retention requirements as well.</p>
      </div>
    </article>
  </main>;
}
