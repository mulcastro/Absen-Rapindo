import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdminShell } from './AdminShell';
import { ParticipantShell } from './ParticipantShell';

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
      <AdminShell actions={<button type="button">Tindakan admin</button>}>
        <main>Konten admin</main>
      </AdminShell>,
    );

    expect(screen.getByText('Rekap Absensi')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Tindakan admin' }),
    ).toBeEnabled();
  });
});
