import { build } from 'esbuild';

await build({
  entryPoints: ['supabase/functions/send-reminders/main.ts'],
  outfile: 'supabase/functions/send-reminders/index.ts',
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  plugins: [{
    name: 'deno-npm-imports',
    setup(builder) {
      builder.onResolve({ filter: /^(@supabase\/supabase-js|web-push)$/ }, ({ path }) => ({
        path: `npm:${path === 'web-push' ? 'web-push@4.0.0' : '@supabase/supabase-js@2.119.2'}`,
        external: true,
      }));
    },
  }],
});
