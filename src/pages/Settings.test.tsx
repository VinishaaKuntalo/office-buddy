import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Settings } from './Settings';
import { testUserData } from '../test/fixtures';

const mocks = vi.hoisted(() => ({
  outlet: null as unknown,
  user: { id: 'user-1', email: 'taylor@example.test' },
  saveProfile: vi.fn(),
  saveOfficeLocation: vi.fn(),
  saveNotificationPreferences: vi.fn(),
  savePolicy: vi.fn(),
}));

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user, signOut: vi.fn() }) }));
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useOutletContext: () => mocks.outlet };
});
vi.mock('../data/repository', () => ({
  saveProfile: (...args: unknown[]) => mocks.saveProfile(...args),
  saveOfficeLocation: (...args: unknown[]) => mocks.saveOfficeLocation(...args),
  saveNotificationPreferences: (...args: unknown[]) => mocks.saveNotificationPreferences(...args),
  savePolicy: (...args: unknown[]) => mocks.savePolicy(...args),
  deleteAccount: vi.fn(),
}));

describe('Settings', () => {
  it('saves profile, location, preferences, and the active policy', async () => {
    mocks.outlet = { data: testUserData(), refresh: vi.fn().mockResolvedValue(undefined) };
    mocks.saveProfile.mockResolvedValue(undefined);
    mocks.saveOfficeLocation.mockResolvedValue(undefined);
    mocks.saveNotificationPreferences.mockResolvedValue(undefined);
    mocks.savePolicy.mockResolvedValue(undefined);
    render(<Settings />);
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Your settings have been saved.'));
    expect(mocks.saveProfile).toHaveBeenCalledWith('user-1', { display_name: 'Taylor', timezone: 'America/Toronto' });
    expect(mocks.savePolicy).toHaveBeenCalledOnce();
    expect(mocks.saveOfficeLocation).toHaveBeenCalledOnce();
    expect(mocks.saveNotificationPreferences).toHaveBeenCalledOnce();
  });
});
