import { runReminders } from './reminder-runner';

try {
  await runReminders(process.env);
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exitCode = 1;
}
