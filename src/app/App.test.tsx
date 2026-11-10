import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { App } from './App';

vi.mock('../services/attendance', async () => {
  const actual = await vi.importActual('../services/attendance');
  const { createMockAttendanceService } =
    await import('../test/fixtures/attendanceService');
  return {
    ...actual,
    loadAttendanceService: () => Promise.resolve(createMockAttendanceService()),
  };
});

vi.mock('../services/admin', async () => {
  const actual = await vi.importActual('../services/admin');
  const { createMockAdminService } =
    await import('../test/fixtures/adminService');
  return {
    ...actual,
    loadAdminService: () => Promise.resolve(createMockAdminService()),
  };
});

vi.mock('../services/identity', async () => {
  const actual = await vi.importActual('../services/identity');
  const { createMockIdentityService } =
    await import('../test/fixtures/identityService');
  return {
    ...actual,
    loadIdentityService: () => Promise.resolve(createMockIdentityService()),
  };
});

async function loginAsAdmin(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText('Nama pengguna'), 'admin');
  await user.type(screen.getByLabelText('Kata sandi'), 'rahasia');
  await user.type(screen.getByLabelText('Kode TOTP'), '123456');
  await user.click(screen.getByRole('button', { name: 'Masuk' }));
}

describe('App', () => {
  it('menampilkan layar absensi dari service pada route peserta', async () => {
    render(
      <MemoryRouter initialEntries={['/absen/sesi-contoh']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('button', { name: 'Izinkan dan ambil lokasi' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sesi terbuka')).toBeInTheDocument();
    expect(screen.getByText('Wajah dalam bingkai')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Kembali ke daftar sesi/ }),
    ).toBeVisible();
  });

  it('menawarkan retry ketika izin lokasi ditolak', async () => {
    const user = userEvent.setup();
    let failure: PositionErrorCallback = () => undefined;
    const watchPosition = vi.fn(
      (
        _success: PositionCallback,
        onFailure?: PositionErrorCallback | null,
      ) => {
        failure = onFailure ?? (() => undefined);
        return 9;
      },
    );
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition, clearWatch: vi.fn() },
    });
    render(
      <MemoryRouter initialEntries={['/absen/sesi-contoh']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Izinkan dan ambil lokasi' }),
    );
    act(() => failure({ code: 1 } as GeolocationPositionError));
    expect(
      await screen.findByRole('button', { name: 'Coba ambil lokasi lagi' }),
    ).toBeVisible();
    expect(screen.getByText(/Izin lokasi ditolak/)).toBeVisible();

    await user.click(
      screen.getByRole('button', { name: 'Coba ambil lokasi lagi' }),
    );
    expect(watchPosition).toHaveBeenCalledTimes(2);
  });

  it('memberikan state unknown tanpa menampilkan sukses', async () => {
    render(
      <MemoryRouter initialEntries={['/hasil/attempt-contoh']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'Hasil belum dapat dipastikan',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Absen berhasil' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Periksa kembali' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Kembali ke daftar sesi' }),
    ).toBeVisible();
  });

  it('memuat ulang hasil berdasarkan attemptId tanpa router state', async () => {
    render(
      <MemoryRouter initialEntries={['/hasil/attempt-simulasi-001']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Absensi berhasil' }),
    ).toBeVisible();
    expect(screen.getByText('Ahmad Fauzi')).toBeVisible();
  });

  it('memisahkan hadir sah, terlambat, belum, dan percobaan gagal pada rekap', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/sesi/sesi-contoh']}>
        <App />
      </MemoryRouter>,
    );

    await loginAsAdmin(user);

    expect(
      await screen.findByRole('heading', {
        name: 'Pelatihan K3 — Sesi Pagi',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('5 / 8')).toBeInTheDocument();
    expect(screen.getByText('Belum absen').parentElement).toHaveTextContent(
      '3',
    );
    expect(screen.getByText(/Percobaan gagal terakhir:/)).toHaveTextContent(
      'tidak dihitung sebagai hadir',
    );
    expect(screen.queryByText('/ 35')).not.toBeInTheDocument();
    expect(screen.getAllByText('Terlambat').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Belum').length).toBeGreaterThan(0);
    expect(screen.getByText(/08.20 — Wajah belum cocok/)).toBeInTheDocument();
    expect(screen.getByText('Ayu Pratama').parentElement).toHaveTextContent(
      'Hadir',
    );
  });

  it('aksi ekspor admin memberi konfirmasi selesai', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/sesi/sesi-contoh']}>
        <App />
      </MemoryRouter>,
    );

    await loginAsAdmin(user);

    await user.click(
      await screen.findByRole('button', { name: 'Ekspor Excel' }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Daftar hadir Excel berhasil diunduh.',
    );
  });

  it('keluar dari area admin dan kembali ke halaman masuk', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/sesi']}>
        <App />
      </MemoryRouter>,
    );

    await loginAsAdmin(user);
    await user.click(await screen.findByRole('button', { name: 'Keluar' }));

    expect(
      await screen.findByRole('heading', { name: 'Masuk admin' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Keluar' })).toBeNull();
  });

  it('menampilkan halaman tidak ditemukan untuk route asing', () => {
    render(
      <MemoryRouter initialEntries={['/route-tidak-ada']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Alamat tidak tersedia' }),
    ).toBeInTheDocument();
  });
});
