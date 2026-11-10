import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { AdminShell } from './AdminShell';
import { ParticipantShell } from './ParticipantShell';
import { AuthContext } from '../../features/auth/authContextValue';

describe('shell aplikasi', () => {
  it('menampilkan logo resmi pada shell peserta', () => {
    render(
      <ParticipantShell>
        <main>Konten peserta</main>
      </ParticipantShell>,
    );

    expect(
      screen.getByRole('img', { name: 'Logo LPK Rapindo' }),
    ).toHaveAttribute('src', expect.stringContaining('logo-lpk-rapindo.svg'));
    expect(screen.getByText('Konten peserta')).toBeVisible();
  });

  it('menampilkan tindakan admin tanpa mengubahnya menjadi navigasi palsu', () => {
    render(
      <MemoryRouter initialEntries={['/admin/sesi']}>
        <AuthContext.Provider
          value={{
            session: { displayName: 'Admin', role: 'admin' },
            restoring: false,
            login: vi.fn(),
            logout: vi.fn().mockResolvedValue(undefined),
          }}
        >
          <AdminShell actions={<button type="button">Tindakan admin</button>}>
            <main>Konten admin</main>
          </AdminShell>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByText('Rekap Absensi')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Tindakan admin' }),
    ).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Sesi' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Peserta & undangan' }),
    ).toHaveAttribute('href', '/admin/peserta');
    expect(screen.getByRole('button', { name: 'Keluar' })).toBeEnabled();
  });
});
