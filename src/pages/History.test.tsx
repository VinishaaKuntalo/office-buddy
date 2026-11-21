import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { History } from './History';
import { testUserData } from '../test/fixtures';

const mocks = vi.hoisted(() => ({
  outlet: null as unknown,
  user: { id: 'user-1', email: 'taylor@example.test' },
  fetchPage: vi.fn(),
}));

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useOutletContext: () => mocks.outlet };
});
vi.mock('../data/repository', () => ({
  fetchAttendancePage: (...args: unknown[]) => mocks.fetchPage(...args),
}));
vi.mock('../components/AttendanceDialog', () => ({ AttendanceDialog: () => null }));

describe('History', () => {
  it('shows an empty state when the server has no attendance rows', async () => {
    mocks.outlet = { data: testUserData(), refresh: vi.fn() };
    mocks.fetchPage.mockResolvedValue({ rows: [], total: 0 });
    render(<History />);
    expect(await screen.findByRole('heading', { name: 'No attendance records yet' })).toBeInTheDocument();
  });
});
