// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

beforeEach(() => {
  process.argv = [...originalArgv.slice(0, 2), 'secrets'];
  for (const [name, value] of Object.entries({
    SUPABASE_PROJECT_REF: 'testproject',
    SUPABASE_ACCESS_TOKEN: 'test-access-token',
    RESEND_API_KEY: 'test-resend-key',
    VAPID_PUBLIC_KEY: 'test-public-key',
    VAPID_PRIVATE_KEY: 'test-private-key',
    APP_URL: 'https://example.test',
  })) vi.stubEnv(name, value);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

it.each([200, 201, 204])('accepts an empty successful secrets response (HTTP %s)', async (status) => {
  const fetch = vi.fn()
    .mockResolvedValueOnce(Response.json([{ decrypted_secret: 'test-cron-secret' }]))
    .mockResolvedValueOnce(new Response(null, { status }));
  vi.stubGlobal('fetch', fetch);
  await import('./configure-reminder-cron.mjs');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toBe('https://api.supabase.com/v1/projects/testproject/secrets');
});

it.each([
  new Response(null, { status: 200 }),
  Response.json({}),
])('rejects a missing or invalid database query result before changing secrets', async (response) => {
  const fetch = vi.fn().mockResolvedValueOnce(response);
  vi.stubGlobal('fetch', fetch);
  await expect(import('./configure-reminder-cron.mjs')).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('reports failed secret configuration instead of announcing success', async () => {
  vi.stubGlobal('fetch', vi.fn()
    .mockResolvedValueOnce(Response.json([{ decrypted_secret: 'test-cron-secret' }]))
    .mockResolvedValueOnce(new Response(null, { status: 403 })));
  await expect(import('./configure-reminder-cron.mjs')).rejects.toThrow('Supabase secrets failed (HTTP 403).');
  expect(console.log).not.toHaveBeenCalled();
});
