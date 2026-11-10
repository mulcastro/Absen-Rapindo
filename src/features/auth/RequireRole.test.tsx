import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { AuthContext, type AuthValue } from './authContextValue';
import { RequireRole } from './RequireRole';

function renderGuard(value: AuthValue) {
  return render(
    <MemoryRouter>
      <AuthContext.Provider value={value}>
        <RequireRole roles={['admin']}>
          <p>Konten admin</p>
        </RequireRole>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

describe('RequireRole', () => {
  it('menolak role peserta sebagai guard UX', () => {
    renderGuard({
      session: { displayName: 'Peserta', role: 'participant' },
      restoring: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    expect(
      screen.getByRole('heading', { name: 'Akses memerlukan login' }),
    ).toBeVisible();
    expect(screen.queryByText('Konten admin')).not.toBeInTheDocument();
  });

  it('mengizinkan role admin tetapi tetap bukan otorisasi server', () => {
    renderGuard({
      session: { displayName: 'Admin', role: 'admin' },
      restoring: false,
      login: vi.fn(),
      logout: vi.fn(),
    });
    expect(screen.getByText('Konten admin')).toBeVisible();
  });

  it('mengarahkan pengguna tanpa sesi ke halaman login yang ditentukan', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <AuthContext.Provider
          value={{
            session: null,
            restoring: false,
            login: vi.fn(),
            logout: vi.fn(),
          }}
        >
          <Routes>
            <Route
              path="/"
              element={
                <RequireRole roles={['participant']} loginPath="/masuk">
                  <p>Daftar sesi</p>
                </RequireRole>
              }
            />
            <Route path="/masuk" element={<p>Login peserta</p>} />
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Login peserta')).toBeVisible();
    expect(screen.queryByText('Daftar sesi')).not.toBeInTheDocument();
  });
});
