import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './RequireAuth';

const mocks = vi.hoisted(() => ({ user: null as { id: string } | null, loading: false }));
vi.mock('./AuthProvider', () => ({ useAuth: () => mocks }));

describe('RequireAuth', () => {
  it('redirects signed-out visitors away from protected content', () => {
    mocks.user = null;
    render(
      <MemoryRouter initialEntries={['/private']}>
        <Routes>
          <Route element={<RequireAuth />}>
            <Route path="/private" element={<p>Private page</p>} />
          </Route>
          <Route path="/signin" element={<p>Sign-in page</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Sign-in page')).toBeInTheDocument();
    expect(screen.queryByText('Private page')).not.toBeInTheDocument();
  });
});
