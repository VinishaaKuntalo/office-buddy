import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/domain';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error('Office Buddy is not connected yet. Add the Supabase URL and public anon key to your environment file.');
  }
  return supabase;
}

export function friendlyError(error: unknown): string {
  const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (code === 'over_email_send_rate_limit' || message.includes('email rate limit')) {
    return 'Supabase has reached its email sending limit. Wait for the limit to reset before trying again. For this disposable test project, check the email confirmation setting in Supabase Authentication.';
  }
  if (status === 429 || code === 'over_request_rate_limit' || message.includes('rate limit')) {
    return 'Too many requests. Wait before trying again; repeated attempts may keep hitting the rate limit.';
  }
  if (error instanceof Error) {
    if (message.includes('fetch') || message.includes('network')) {
      return 'We could not reach Supabase. Check your internet connection and try again.';
    }
    if (message.includes('duplicate key') || message.includes('already exists')) {
      return 'A record for this date already exists. Review the calendar before trying again.';
    }
    if (message.includes('invalid login') || message.includes('invalid credentials')) {
      return 'The email or password was not recognized. Please try again.';
    }
    if (message.includes('jwt') || message.includes('session')) {
      return 'Your session has expired. Please sign in again.';
    }
    if (message.includes('policy is missing')) {
      return 'Your attendance policy is missing for today. Complete onboarding or contact support.';
    }
    if (message.includes('policy') || message.includes('row-level security')) {
      return 'This change is not allowed for your account. Refresh the page and try again.';
    }
    if (message.includes('project is paused')) {
      return 'Your Supabase project is paused. Resume it in the Supabase dashboard, then try again.';
    }
  }
  return 'Something went wrong while saving your data. Please try again.';
}
