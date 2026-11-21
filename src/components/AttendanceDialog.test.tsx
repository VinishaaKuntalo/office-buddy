import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttendanceDialog } from './AttendanceDialog';

const repository = vi.hoisted(() => ({
  deleteAbsence: vi.fn(),
  deleteAttendance: vi.fn(),
  deleteHoliday: vi.fn(),
  saveAbsence: vi.fn(),
  saveAttendance: vi.fn(),
  saveHoliday: vi.fn(),
}));

vi.mock('../data/repository', () => repository);

describe('AttendanceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repository.saveHoliday.mockResolvedValue(undefined);
  });

  it('requires a holiday name before saving', async () => {
    const user = userEvent.setup();
    const onSaved = vi.fn().mockResolvedValue(undefined);
    render(<AttendanceDialog userId="user-1" date="2026-11-30" onClose={vi.fn()} onSaved={onSaved} />);
    await user.selectOptions(screen.getByLabelText('What happened?'), 'holiday');
    await user.click(screen.getByRole('button', { name: 'Save date' }));
    expect(repository.saveHoliday).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Holiday name'), 'Civic holiday');
    await user.click(screen.getByRole('button', { name: 'Save date' }));
    await waitFor(() => expect(repository.saveHoliday).toHaveBeenCalledWith({
      userId: 'user-1',
      date: '2026-11-30',
      name: 'Civic holiday',
    }));
    expect(onSaved).toHaveBeenCalledOnce();
  });
});
