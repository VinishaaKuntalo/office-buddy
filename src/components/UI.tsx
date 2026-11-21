import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

export function Button({
  children,
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'plain' }) {
  const variants = {
    primary: 'bg-navy text-white hover:bg-slate-800',
    secondary: 'bg-white border border-slate-200 text-navy hover:bg-slate-50',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    plain: 'text-slate-600 hover:bg-slate-100',
  };
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function PageTitle({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'info' }) {
  const colors = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  };
  return <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${colors[tone]}`}>{children}</div>;
}

export function Loading({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18} aria-hidden="true" />{label}</div>;
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
    <h3 className="font-semibold text-navy">{title}</h3>
    <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
  </div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="block text-sm font-medium text-slate-700">
    <span>{label}</span>
    <span className="mt-1.5 block">{children}</span>
    {hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}
  </label>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  // Tailwind resolves conflicting utilities by stylesheet order, so drop defaults the caller overrides.
  const overrides = (pattern: RegExp) => className.split(/\s+/).some((token) => pattern.test(token));
  const defaults = [
    overrides(/^bg-/) ? '' : 'bg-white',
    overrides(/^border-0$/) ? '' : overrides(/^border-[a-z]/) ? 'border' : 'border border-slate-100',
    overrides(/^(sm:)?p-/) ? '' : 'p-5 sm:p-6',
  ].join(' ');
  return <section className={`rounded-2xl shadow-soft ${defaults} ${className}`}>{children}</section>;
}
