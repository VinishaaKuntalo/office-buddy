import { AuthApiError } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { friendlyError } from './supabase';

describe('friendlyError rate limits', () => {
  it('explains the email quota error returned by Supabase signup', () => {
    const error = new AuthApiError('email rate limit exceeded', 429, 'over_email_send_rate_limit');
    expect(friendlyError(error)).toContain('email sending limit');
    expect(friendlyError(error)).toContain('email confirmation setting');
  });

  it('identifies HTTP 429 even when the response is not an Error instance', () => {
    expect(friendlyError({ status: 429, message: 'Request rejected' })).toContain('Too many requests');
  });

  it('recognizes rate-limit messages without an HTTP status', () => {
    expect(friendlyError(new Error('Request rate limit exceeded'))).toContain('Wait before trying again');
  });

  it('does not mislabel a missing active policy as an authorization denial', () => {
    expect(friendlyError(new Error('Your attendance policy is missing.'))).toBe(
      'Your attendance policy is missing for today. Complete onboarding or contact support.',
    );
  });
});
