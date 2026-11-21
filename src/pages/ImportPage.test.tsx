import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportPage } from './ImportPage';
import { testUserData } from '../test/fixtures';

const mocks = vi.hoisted(() => ({
  outlet: null as unknown,
  user: { id: 'user-1', email: 'taylor@example.test' },
  insert: vi.fn(),
}));

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useOutletContext: () => mocks.outlet };
});
vi.mock('../data/repository', () => ({
  insertImportedAttendance: (...args: unknown[]) => mocks.insert(...args),
}));

describe('ImportPage', () => {
  it('previews valid records, identifies invalid rows, and commits only valid rows', async () => {
    const user = userEvent.setup();
    mocks.outlet = { data: testUserData(), refresh: vi.fn().mockResolvedValue(undefined) };
    mocks.insert.mockResolvedValue({ inserted: 1, skipped: 0, rejected: 1 });
    render(<ImportPage />);
    const file = new File([
      'date,status,notes\n2026-11-17,in_office,Office day\nnot-a-date,unknown,Bad row\n',
    ], 'records.csv', { type: 'text/csv' });
    await user.upload(screen.getByLabelText('Select CSV file'), file);
    expect(await screen.findByText('1 valid, 1 rejected')).toBeInTheDocument();
    expect(screen.getByText(/Row 3: Date must be a real date/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import valid rows' }));
    await waitFor(() => expect(mocks.insert).toHaveBeenCalledWith([
      {
        event_date: '2026-11-17',
        status: 'in_office',
        notes: 'Office day',
        external_event_id: 'csv:2026-11-17:in_office:Office day',
      },
    ], 'records.csv', 1));
  });
});
