// @vitest-environment node
import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  handler: undefined as ((request: Request) => Promise<Response>) | undefined,
}));

vi.mock('./reminder-runner', () => ({ runReminders: mocks.run }));

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: {
      get: () => 'cron-secret',
      toObject: () => ({ REMINDER_CRON_SECRET: 'cron-secret' }),
    },
    serve: (handler: (request: Request) => Promise<Response>) => { mocks.handler = handler; },
  });
  await import('../supabase/functions/send-reminders/main');
});

beforeEach(() => {
  mocks.run.mockReset().mockResolvedValue({ checked: 1, delivered: 0, failures: 0 });
});

afterAll(() => vi.unstubAllGlobals());

it('rejects a missing or incorrect scheduler credential before accessing attendance', async () => {
  for (const secret of ['', 'wrong']) {
    const response = await mocks.handler!(new Request('https://example.test', {
      method: 'POST', headers: { 'x-reminder-secret': secret },
    }));
    expect(response.status).toBe(401);
  }
  expect(mocks.run).not.toHaveBeenCalled();
});

it('runs the normal reminder check for an authenticated scheduler call', async () => {
  const response = await mocks.handler!(new Request('https://example.test', {
    method: 'POST', headers: { 'x-reminder-secret': 'cron-secret' },
  }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ checked: 1, delivered: 0, failures: 0 });
  expect(mocks.run).toHaveBeenCalledWith({
    REMINDER_CRON_SECRET: 'cron-secret', SEND_TEST_EMAIL: 'false',
  });
});

it('returns a failure status when delivery fails instead of reporting success', async () => {
  mocks.run.mockRejectedValue(new Error('Delivery unavailable'));
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const response = await mocks.handler!(new Request('https://example.test', {
      method: 'POST', headers: { 'x-reminder-secret': 'cron-secret' },
    }));
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
