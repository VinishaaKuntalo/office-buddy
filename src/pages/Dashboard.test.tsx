import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard';
import { testEvent, testUserData } from '../test/fixtures';

const mocks = vi.hoisted(() => ({
  outlet: null as unknown,
  user: { id: 'user-1', email: 'taylor@example.test' },
  today: '2026-11-25',
}));

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useOutletContext: () => mocks.outlet };
});
vi.mock('../lib/dates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/dates')>();
  return { ...actual, todayInTimezone: () => mocks.today };
});
vi.mock('../data/repository', () => ({ syncStatusNotifications: vi.fn().mockResolvedValue(false) }));
vi.mock('../components/AttendanceDialog', () => ({ AttendanceDialog: () => null }));

describe('Dashboard', () => {
  beforeEach(() => {
    cleanup();
    mocks.today = '2026-11-25';
    mocks.outlet = { data: testUserData([testEvent('2026-11-24'), testEvent('2026-11-25')]), refresh: vi.fn() };
  });

  it('shows the remaining-day action for a 2-of-3 week', () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: '1 more office day needed' })).toBeInTheDocument();
    expect(screen.getByText('Any eligible weekday works toward your target. Next available: Thursday, November 26.')).toBeInTheDocument();
  });

  it('offers Monday rather than a preferred Tuesday and keeps monthly credits out of the weekly card', () => {
    mocks.today = '2026-11-23';
    const data = testUserData();
    data.holidays = ['2026-11-05', '2026-11-12'].map((date) => ({
      id: date, user_id: 'user-1', organization_id: null, holiday_date: date,
      name: 'Holiday', source: 'manual', external_event_id: null, created_at: '', updated_at: '',
    }));
    mocks.outlet = { data, refresh: vi.fn() };
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText('Any eligible weekday works toward your target. Next available: Monday, November 23.')).toBeInTheDocument();
    // This reporting week also includes the final Monday, November 30.
    expect(screen.getAllByText('Available')).toHaveLength(6);
    expect(screen.queryByText(/recommended next office day/)).not.toBeInTheDocument();
    expect(screen.queryByText(/counted toward your target/)).not.toBeInTheDocument();
  });

  it('shows You can chill only after the weekly target is complete', () => {
    mocks.today = '2026-11-26';
    mocks.outlet = {
      data: testUserData([
        testEvent('2026-11-24'),
        testEvent('2026-11-25'),
        testEvent('2026-11-26'),
      ]),
      refresh: vi.fn(),
    };
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'You can chill' })).toBeInTheDocument();
    expect(screen.getByText('Your weekly office requirement is complete.')).toBeInTheDocument();
  });

  it('counts an approved holiday toward the full weekly target', () => {
    mocks.today = '2026-11-26';
    const data = testUserData([testEvent('2026-11-24'), testEvent('2026-11-25')]);
    data.holidays = [{
      id: 'holiday-1',
      user_id: 'user-1',
      organization_id: null,
      holiday_date: '2026-11-26',
      name: 'Holiday',
      source: 'manual',
      external_event_id: null,
      created_at: '',
      updated_at: '',
    }];
    mocks.outlet = { data, refresh: vi.fn() };
    render(<MemoryRouter><Dashboard /></MemoryRouter>);
    expect(screen.getByText('Your weekly target is complete, including approved absences or holidays. You can chill for the rest of this week.')).toBeInTheDocument();
    expect(screen.getByText('2 in office + 1 absence/holiday')).toBeInTheDocument();
    expect(screen.getByText('This week: 1 approved absence or holiday date counted toward your target of 3 days.')).toBeInTheDocument();
  });
});
