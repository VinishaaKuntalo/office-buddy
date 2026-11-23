import { runReminders } from '../../../scripts/reminder-runner.ts';

declare const Deno: {
  env: { get(name: string): string | undefined; toObject(): Record<string, string> };
  serve(handler: (request: Request) => Promise<Response>): void;
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('REMINDER_CRON_SECRET');
  if (!secret || request.headers.get('x-reminder-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  try {
    const result = await runReminders({ ...Deno.env.toObject(), SEND_TEST_EMAIL: 'false' });
    return Response.json(result);
  } catch (cause) {
    console.error('Scheduled reminders failed:', cause instanceof Error ? cause.message : cause);
    return Response.json({ error: 'Reminder delivery failed. Check function logs.' }, { status: 500 });
  }
});
