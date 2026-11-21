import {
  addDays,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns';

export type DateKey = `${number}-${number}-${number}`;

export function dateKey(date: Date): DateKey {
  return format(date, 'yyyy-MM-dd') as DateKey;
}

export function parseDateKey(value: string): Date {
  return parseISO(`${value}T00:00:00`);
}

export function addDateDays(value: string, days: number): string {
  return dateKey(addDays(parseDateKey(value), days));
}

export function getWeekStart(value: string): string {
  return dateKey(startOfWeek(parseDateKey(value), { weekStartsOn: 1 }));
}

export function getMonthStart(value: string): string {
  return dateKey(startOfMonth(parseDateKey(value)));
}

export function getMonthEnd(value: string): string {
  return dateKey(endOfMonth(parseDateKey(value)));
}

export function isDateBetween(value: string, start: string, end: string): boolean {
  const date = parseDateKey(value);
  return !isBefore(date, parseDateKey(start)) && !isAfter(date, parseDateKey(end));
}

export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let date = parseDateKey(start); !isAfter(date, parseDateKey(end)); date = addDays(date, 1)) {
    dates.push(dateKey(date));
  }
  return dates;
}

export function todayInTimezone(timezone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export function weekday(value: string): number {
  return parseDateKey(value).getDay();
}

export function monthKey(value: string): string {
  return value.slice(0, 7);
}
