import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { DoorOpen, ShieldCheck } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { isSupabaseConfigured } from '../lib/supabase';
import { friendlyError } from '../lib/supabase';
import { Alert, Button, Field } from '../components/UI';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

export function AuthPage({ mode }: { mode: AuthMode }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  if (auth.user && mode !== 'reset') return <Navigate to="/app" replace />;
  const isSignUp = mode === 'signup';
  const title = mode === 'signin' ? 'Welcome back' : isSignUp ? 'Create your account' : mode === 'forgot' ? 'Reset your password' : 'Choose a new password';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'signin') {
        await auth.signIn(email, password);
        navigate('/app', { replace: true, state: { from: location.state?.from } });
      } else if (mode === 'signup') {
        await auth.signUp(email, password, displayName);
        setMessage('Check your email for a confirmation link. Your account data will be ready once you confirm.');
      } else if (mode === 'forgot') {
        await auth.resetPassword(email);
        setMessage('If an account exists for that email, a password reset link is on its way.');
      } else {
        await auth.updatePassword(password);
        setMessage('Your password has been updated. You can now sign in.');
        navigate('/signin', { replace: true });
      }
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5 text-lg font-bold text-navy">
          <span className="grid size-10 place-items-center rounded-xl bg-emerald-50 text-mint"><DoorOpen size={21} aria-hidden="true" /></span>
          office buddy
        </Link>
        <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-soft sm:p-8">
          <h1 className="text-2xl font-bold text-navy">{title}</h1>
          <p className="mt-2 text-sm text-slate-500">
            {mode === 'signin' ? 'Sign in to pick up where you left off.' : isSignUp ? 'A simple, private way to keep track of office days.' : mode === 'forgot' ? 'We’ll send a secure reset link if the account exists.' : 'Use at least 8 characters.'}
          </p>
          {!isSupabaseConfigured && <div className="mt-5"><Alert>Supabase is not configured. Copy <code>.env.example</code> to <code>.env</code> and add your project URL and public anon key.</Alert></div>}
          {error && <div className="mt-5"><Alert>{error}</Alert></div>}
          {message && <div className="mt-5"><Alert tone="success">{message}</Alert></div>}
          <form onSubmit={submit} className="mt-6 space-y-4">
            {isSignUp && <Field label="Display name"><input className="form-input" autoComplete="name" required maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></Field>}
            {mode !== 'reset' && <Field label="Email"><input className="form-input" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></Field>}
            {mode !== 'forgot' && <Field label={mode === 'reset' ? 'New password' : 'Password'} hint={isSignUp || mode === 'reset' ? 'At least 8 characters.' : undefined}>
              <input className="form-input" type="password" autoComplete={mode === 'reset' ? 'new-password' : isSignUp ? 'new-password' : 'current-password'} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>}
            <Button type="submit" className="w-full" disabled={busy || !isSupabaseConfigured}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : isSignUp ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Update password'}
            </Button>
          </form>
          <div className="mt-6 space-y-3 text-center text-sm text-slate-500">
            {mode === 'signin' && <><p><Link className="font-semibold text-mint hover:underline" to="/forgot-password">Forgot password?</Link></p><p>New here? <Link className="font-semibold text-mint hover:underline" to="/signup">Create an account</Link></p></>}
            {isSignUp && <p>Already have an account? <Link className="font-semibold text-mint hover:underline" to="/signin">Sign in</Link></p>}
            {mode === 'forgot' && <p><Link className="font-semibold text-mint hover:underline" to="/signin">Back to sign in</Link></p>}
          </div>
        </section>
        <p className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-500"><ShieldCheck size={15} aria-hidden="true" />Your records are stored in your private Supabase account.</p>
      </div>
    </main>
  );
}
