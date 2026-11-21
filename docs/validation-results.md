# Validation results

Validation performed on November 20, 2026 (local time).

## Local checks

- Vitest: 40 tests passed across 9 files, including rate-limit and missing-policy error handling.
- The last default parallel run timed out starting workers before executing tests. The full suite passed with `npm test -- --maxWorkers=1`; no assertions or isolation settings were disabled.
- TypeScript: `npm run typecheck` passed.
- Production: `npm run build` passed without the 500 KB chunk warning.
- Dependencies: `npm audit --audit-level=moderate` reported 0 vulnerabilities.
- Local browser: landing page loaded successfully at `http://127.0.0.1:5173/`.
- Browser sign-up error display verified with an intercepted HTTP 429 response in a separate test tab; this check sent no sign-up request to Supabase.

Production JavaScript output (KB, as reported by Vite):

| Chunk | Size | Gzip |
| --- | ---: | ---: |
| Main | 86.62 | 25.34 |
| React | 183.47 | 60.42 |
| Supabase | 230.49 | 60.05 |
| Import | 25.02 | 9.34 |
| Settings | 6.39 | 2.35 |
| Calendar | 6.19 | 2.70 |
| Insights | 5.96 | 1.99 |
| History | 4.23 | 1.61 |
| Privacy | 3.18 | 1.38 |
| Notifications | 1.60 | 0.82 |

Route-level loading defers secondary pages. Vendor splitting reduces individual chunk sizes and improves caching, not the total size of dependencies.

## Live Supabase status

- Initial migrations `202611200001` and `202611200002` were applied by the user through SQL Editor. Initial execution logs are user-confirmed; resulting tables, bootstrap behavior, and policies were independently exercised afterward.
- The seed intentionally contains no shared/demo records. Default profiles, policies, assignments, and preferences were verified through two authenticated registrations.
- Initial sign-up errors included an email quota limit. After the saved confirmation setting propagated, the public Auth API reported `mailer_autoconfirm: true`, and both test registrations returned authenticated sessions.
- Core live API suite: 37/37 checks passed for registration, bootstrap, onboarding writes, manual attendance, approved absence, CSV import and duplicate handling, imported-record immutability, unauthenticated access, initial isolation, and independent-client persistence.
- Additional live suite: 114/114 checks passed. Both users had populated fixtures in all 11 personal-data tables. Cross-user reads, updates, and deletes were denied in both directions, and each owner's records were checked unchanged afterward.
- The first deletion test exposed an audit foreign-key failure. Migration `202611200003_account_deletion_audit.sql` was applied through the shared SQL Editor and fixed it. Ordinary attendance deletion still writes audit history, while account deletion removes linked records without recreating audit rows.
- Both disposable accounts were successfully deleted through the authenticated account-deletion RPC. Neither could sign in afterward; deleting the first left the second user's attendance intact.
- Transactional SQL regression `supabase/tests/account_deletion.sql` passed on the live database. Its fixtures were rolled back.
- A subsequent real-user registration exposed another boundary bug: database UTC defaults started the initial policy on November 21 while the profile-local Toronto date was November 20. Migration `202611200004_profile_policy_timezone.sql` was applied through SQL Editor, correcting bootstrap dates and repairing affected untouched default setups. Reloading the affected account reached onboarding successfully instead of the misleading authorization error.
- Transactional SQL regression `supabase/tests/profile_bootstrap.sql` passed while the UTC and Toronto dates differed. Its fixture was rolled back.
- Browser sign-in loaded all three attendance records. Clearing the browser cache and all storage for the app origin, then signing in again, returned exactly the same three records.

Independent SQL Editor evidence after regression and cleanup:

```text
public_tables  all_rls_enabled  remaining_test_accounts  orphan_audit_rows
13             true             0                        0
```

### Remaining limitations

- The browser tool refused a separate isolated browser context due to session-storage affinity restrictions. A fresh Supabase API client and actual browser cache/storage-clearing test passed, but a genuinely second independent browser still needs manual verification.
- Onboarding, attendance creation, absence creation, CSV import, and account deletion were exercised through their live database APIs; full UI workflows for each remain manual checks. Browser sign-in and attendance history were exercised end-to-end.
- Organization membership/admin isolation and external-feed ingestion were not tested; they are not implemented MVP write workflows.
- Direct Postgres ports remained inaccessible from this laptop; database inspection and the fix used the authenticated SQL Editor.
- Email confirmation is disabled only for disposable validation. Restore production-appropriate authentication and email delivery settings before deployment.
- Rotate the database password previously shared in chat. No database password was written into application files.

The two-user isolation checks provide evidence beyond merely enabling RLS, but are not a substitute for a complete security audit.

## Source tree

Generated dependencies and build output are omitted. Local environment values are not included.

```text
office-buddy
  .github
    workflows
      deploy.yml
  .env.example
  .gitignore
  index.html
  package.json
  package-lock.json
  postcss.config.js
  README.md
  tailwind.config.js
  tsconfig.app.json
  tsconfig.json
  tsconfig.node.json
  vite.config.ts
  public
    .nojekyll
    sample-attendance.csv
  src
    App.tsx
    main.tsx
    styles.css
    vite-env.d.ts
    auth
      AuthPage.tsx
      AuthProvider.tsx
      RequireAuth.tsx
      RequireAuth.test.tsx
    components
      AppLayout.tsx
      AttendanceDialog.tsx
      AttendanceDialog.test.tsx
      UI.tsx
    data
      repository.ts
    hooks
      useUserData.ts
    lib
      dates.ts
      supabase.ts
      supabase.test.ts
    pages
      CalendarPage.tsx
      CalendarPage.test.tsx
      Dashboard.tsx
      Dashboard.test.tsx
      History.tsx
      History.test.tsx
      ImportPage.tsx
      ImportPage.test.tsx
      Insights.tsx
      Landing.tsx
      Notifications.tsx
      Onboarding.tsx
      Privacy.tsx
      Settings.tsx
      Settings.test.tsx
    rules
      engine.ts
      engine.test.ts
    test
      fixtures.ts
      setup.ts
    types
      domain.ts
  supabase
    config.toml
    seed.sql
    verify-rls.sql
    migrations
      202611200001_initial_schema.sql
      202611200002_policy_account_security.sql
      202611200003_account_deletion_audit.sql
      202611200004_profile_policy_timezone.sql
    tests
      account_deletion.sql
      profile_bootstrap.sql
  docs
    architecture.md
    data-model.md
    manual-testing-checklist.md
    rules-engine.md
    security-and-rls.md
    validation-results.md
```

The temporary combined migration copy was removed after application. Apply only new migrations to the initialized project; do not rerun the initial schema migration.
