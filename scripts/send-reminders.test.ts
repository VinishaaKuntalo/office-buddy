// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('loads real reminder runtime imports and reports missing configuration as a failure', () => {
  const result = spawnSync(process.execPath, [
    '--import', 'tsx', fileURLToPath(new URL('./send-reminders.ts', import.meta.url)),
  ], {
    encoding: 'utf8',
    timeout: 120000,
    env: {
      ...process.env,
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      RESEND_API_KEY: '',
      VAPID_PUBLIC_KEY: '',
      VAPID_PRIVATE_KEY: '',
    },
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  expect(result.stdout).toContain('Reminders are not configured');
  expect(result.stderr).toContain('Reminder configuration is incomplete');
}, 125000);
