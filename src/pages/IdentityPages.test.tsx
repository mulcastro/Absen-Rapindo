import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { App } from '../app/App';

vi.mock('../services/identity', async () => {
  const actual = await vi.importActual('../services/identity');
  const { createMockIdentityService } =
    await import('../test/fixtures/identityService');
  return {
    ...actual,
    loadIdentityService: () => Promise.resolve(createMockIdentityService()),
  };
});

vi.mock('../services/attendance', async () => {
  const actual = await vi.importActual('../services/attendance');
  const { createMockAttendanceService } =
    await import('../test/fixtures/attendanceService');
  return {
    ...actual,
    loadAttendanceService: () => Promise.resolve(createMockAttendanceService()),
  };
});

describe('halaman identitas', () => {
  it('mempertahankan nol awal PIN peserta dan tidak memakai browser storage', async () => {
    const user = userEvent.setup();
    const storageSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(
      <MemoryRouter initialEntries={['/masuk']}>
        <App />
      </MemoryRouter>,
    );
    await user.type(await screen.findByLabelText('Kode peserta'), 'P-001');
    const pin = screen.getByLabelText('PIN 6 digit');
    await user.type(pin, '012345');
    expect(pin).toHaveValue('012345');
    await user.click(screen.getByRole('button', { name: 'Masuk ke akun' }));
    expect(
      await screen.findByRole('heading', { name: 'Halo, P-001' }),
    ).toBeVisible();
    expect(storageSpy).not.toHaveBeenCalled();
  });

  it('admin memerlukan TOTP enam digit', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/masuk']}>
        <App />
      </MemoryRouter>,
    );
    await user.type(await screen.findByLabelText('Nama pengguna'), 'admin');
    await user.type(screen.getByLabelText('Kata sandi'), 'rahasia');
    await user.click(screen.getByRole('button', { name: 'Masuk' }));
    expect(
      await screen.findByText('Kode TOTP harus tepat enam digit.'),
    ).toBeVisible();
  });

  it('menyediakan panduan pemasangan dari login peserta', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/masuk']}>
        <App />
      </MemoryRouter>,
    );
    await user.click(
      await screen.findByRole('button', {
        name: 'Panduan memasang aplikasi',
      }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Pasang Absensi LPK Rapindo',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Kembali ke halaman masuk' }),
    ).toBeVisible();
  });

  it('consent tidak tercentang otomatis dan challenge mengikuti urutan service', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/daftar/valid']}>
        <App />
      </MemoryRouter>,
    );
    const consent = await screen.findByRole('checkbox');
    expect(consent).not.toBeChecked();
    await user.click(
      screen.getByRole('button', { name: 'Setuju dan lanjutkan' }),
    );
    expect(screen.getByText(/Persetujuan harus diberikan/)).toBeVisible();
    await user.click(consent);
    await user.click(
      screen.getByRole('button', { name: 'Setuju dan lanjutkan' }),
    );
    await user.type(screen.getByLabelText('PIN baru 6 digit'), '012345');
    await user.type(screen.getByLabelText('Konfirmasi PIN'), '012345');
    await user.click(
      screen.getByRole('button', { name: 'Lanjutkan ke verifikasi wajah' }),
    );
    const steps = await screen.findAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      'Lihat lurus',
      'Gerakkan wajah ke kanan',
    ]);
    expect(screen.getByText(/tanpa berpindah halaman/)).toBeVisible();
  });

  it.each([
    ['expired', 'Undangan kedaluwarsa'],
    ['used', 'Undangan sudah digunakan'],
    ['duplicate', 'Peserta sudah terdaftar'],
    ['rejected', 'Pendaftaran ditolak'],
  ])('menampilkan state undangan %s', async (token, title) => {
    render(
      <MemoryRouter initialEntries={[`/daftar/${token}`]}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: title })).toBeVisible();
  });

  it('menandai alur reenroll secara eksplisit', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/daftar/reenroll']}>
        <App />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Perbarui data wajah dan PIN',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('checkbox'));
    await user.click(
      screen.getByRole('button', { name: 'Setuju dan lanjutkan' }),
    );
    await user.type(screen.getByLabelText('PIN baru 6 digit'), '012345');
    await user.type(screen.getByLabelText('Konfirmasi PIN'), '012345');
    await user.click(
      screen.getByRole('button', { name: 'Lanjutkan ke verifikasi wajah' }),
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Verifikasi wajah sebelumnya',
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: 'Verifikasi wajah' }),
    ).toBeNull();
  });
});
