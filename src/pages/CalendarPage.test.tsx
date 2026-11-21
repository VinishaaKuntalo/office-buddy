import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CalendarPage } from './CalendarPage';
import { testEvent, testUserData } from '../test/fixtures';

const mocks = vi.hoisted(() => ({
  outlet: null as unknown,
  user: { id: 'user-1', email: 'taylor@example.test' },
}));

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useOutletContext: () => mocks.outlet };
});
vi.mock('../lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/dates')>();
  return { ...actual, todayInTimezone: () => '2026-11-30' };
});
vi.mock('../data/repository', () => ({
  fetchCalendarData: vi.fn().mockResolvedValue({ attendance: [], absences: [], holidays: [] }),
}));
vi.mock('../components/AttendanceDialog', () => ({ AttendanceDialog: () => null }));

describe('CalendarPage', () => {
  it('shows attendance status in text and supports arrow-key date navigation', () => {
    mocks.outlet = { data: testUserData([testEvent('2026-11-30')]), refresh: vi.fn() };
    render(<CalendarPage />);
    const day = screen.getByRole('gridcell', { name: '2026-11-30, in office' });
    expect(day).toHaveClass('bg-emerald-100');
    fireEvent.keyDown(day, { key: 'ArrowRight' });
    expect(screen.getByRole('gridcell', { name: '2026-12-01' })).toHaveFocus();
  });
});
