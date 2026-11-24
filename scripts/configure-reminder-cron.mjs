import { randomBytes } from 'node:crypto';

const project = process.env.SUPABASE_PROJECT_REF;
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!project || !/^[a-z]+$/.test(project) || !accessToken) {
  throw new Error('SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN are required.');
}

async function management(path, body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Supabase ${path} failed (HTTP ${response.status}).`);
  if (path === 'secrets') return;
  return response.json();
}

const quote = (value) => `'${value.replaceAll("'", "''")}'`;
const query = async (sql) => {
  const rows = await management('database/query', { query: sql });
  if (!Array.isArray(rows)) throw new Error('Supabase database/query returned an invalid result.');
  return rows;
};
const endpoint = `https://${project}.supabase.co/functions/v1/send-reminders`;

if (process.argv[2] === 'secrets') {
  const rows = await query(`
    select decrypted_secret from vault.decrypted_secrets
    where name = 'office_buddy_reminder_cron_secret';
  `);
  const secret = rows[0]?.decrypted_secret || randomBytes(32).toString('hex');
  if (rows.length === 0) {
    await query(`select vault.create_secret(${quote(secret)}, 'office_buddy_reminder_cron_secret');`);
  }
  const values = {
    REMINDER_CRON_SECRET: secret,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    APP_URL: process.env.APP_URL,
    REMINDER_FROM_EMAIL: process.env.REMINDER_FROM_EMAIL || 'Office Buddy <onboarding@resend.dev>',
  };
  if (!values.APP_URL || !values.RESEND_API_KEY || !values.VAPID_PUBLIC_KEY || !values.VAPID_PRIVATE_KEY) {
    throw new Error('Reminder channel secrets and APP_URL are required for deployment.');
  }
  await management('secrets', Object.entries(values).map(([name, value]) => ({ name, value })));
  console.log('Reminder credentials configured in Supabase (values not logged).');
} else if (process.argv[2] === 'schedule') {
  // Verify the function rejects unauthenticated calls before enabling its schedule.
  const unauthorized = await fetch(endpoint, { method: 'POST' });
  if (unauthorized.status !== 401) throw new Error('Reminder endpoint did not reject an unauthenticated request.');
  const rows = await query(`
    select decrypted_secret from vault.decrypted_secrets
    where name = 'office_buddy_reminder_cron_secret';
  `);
  if (!rows[0]?.decrypted_secret) throw new Error('Cron credential is missing.');
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'x-reminder-secret': rows[0].decrypted_secret },
  });
  if (!response.ok) throw new Error(`Reminder function smoke check failed (HTTP ${response.status}).`);
  const result = await response.json();
  if (result.failures !== 0 || !Number.isInteger(result.checked) || !Number.isInteger(result.delivered)) {
    throw new Error('Reminder function returned an invalid result.');
  }
  console.log(`Function verified: checked ${result.checked}, delivered ${result.delivered}, failures ${result.failures}.`);
  await query(`
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
    select cron.schedule(
      'office-buddy-reminders',
      '* * * * *',
      $cron$
        select net.http_post(
          url := ${quote(endpoint)},
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets
              where name = 'office_buddy_reminder_cron_secret')
          ),
          body := '{}'::jsonb,
          timeout_milliseconds := 55000
        );
      $cron$
    );
  `);
  const jobs = await query("select schedule, active from cron.job where jobname = 'office-buddy-reminders';");
  if (jobs.length !== 1 || jobs[0].schedule !== '* * * * *' || jobs[0].active !== true) {
    throw new Error('Minute-by-minute reminder schedule was not enabled.');
  }
  console.log('Supabase reminder schedule enabled: every minute.');
} else {
  throw new Error('Expected secrets or schedule argument.');
}
