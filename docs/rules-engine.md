# Rules engine

The pure rules engine is `src/rules/engine.ts`. It accepts a user's timezone, date range, policy history, raw attendance events, absences, holidays, and the user's current local date. It returns weekly/monthly status, requirements, completions, remaining eligible dates, recommendation, adjustment explanations, reasons, and date assignments. It does not perform I/O.

## Week dimensions

- `calendarWeek` is always Monday through Sunday for the actual date.
- `reportingWeek` normally matches `calendarWeek`.
- If a calendar week ends on Sunday and the next day is a month-final Monday, the reporting week is extended through that Monday. The final Monday therefore counts in the preceding month-end reporting week.
- The calendar week beginning on that final Monday keeps its Monday–Sunday `calendarWeek`; its reporting cycle starts Tuesday and ends Sunday. The Monday is not counted again in the following reporting cycle.

Example: Monday **November 30, 2026** has `calendarWeek` November 30–December 6 and `reportingWeek` November 23–30. Tuesday December 1 through Sunday December 6 has `reportingWeek` December 1–6. The actual attendance date remains November 30.

This same interpretation applies to Monday **August 31, 2026**. A Monday that is not the final date of its month does not shift. A month-final date that is not Monday does not trigger the special week.

## Month dimensions

- `calendarMonth` is `YYYY-MM` from the actual attendance date.
- Under `month_end_monday_to_previous_month`, a final Monday is explicitly assigned to its actual ending month. Other dates use the month containing the Sunday at the end of their reporting week.
- Under `calendar_month`, the actual calendar month is used for the reporting month.
- `attendanceAssignments` returns both week ranges and both month values for each raw attendance event; no source date is rewritten.

## Attendance and adjustments

- Only `in_office` events on eligible weekdays count. Duplicate events on a date count once.
- Preferred weekdays affect recommendations only; any eligible weekday can count.
- A unique eligible date with an approved absence or holiday reduces the target only when the corresponding policy toggle is enabled. Overlap is subtracted once, and the target is floored at zero.
- Weekends reduce a target only if they are eligible under the effective policy.
- Requirements use the policy effective on the current date; eligible weekdays and adjustment toggles use the effective policy for each date. Monthly expected attendance is prorated across eligible reporting dates and rounded up.
- Status considers the remaining eligible dates: enough remaining dates can be `On track`; too few means `At risk`; none with work remaining means `Action required`. A partial week alone is not proof of being on track.
- `You can chill` is returned only when the adjusted weekly requirement is met.

## Tests

`src/rules/engine.test.ts` covers standard weeks, Monday/Friday eligibility, preferred-day recommendations, duplicate events, absence/holiday adjustments, overlap, zero floor, weekends, partial weeks, at-risk/no-days states, excess attendance, month-end examples, cross-month/year weeks, leap day, timezone boundaries, and effective-dated policy changes.

