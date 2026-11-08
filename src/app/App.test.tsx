import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';

import { App } from './App';

describe('App', () => {
  it('menampilkan layar absensi simulasi pada route peserta', async () => {
    render(
      <MemoryRouter initialEntries={['/absen/sesi-contoh']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('button', { name: 'Izinkan dan ambil lokasi' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Sesi terbuka')).toBeInTheDocument();
    expect(
      screen.getByText('Panduan ini bukan hasil deteksi otomatis.'),
    ).toBeInTheDocument();
  });

  it('sesi geo opsional tidak meminta GPS dan langsung menawarkan kamera', async () => {
    const watchPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition, clearWatch: vi.fn() },
    });
    render(
      <MemoryRouter initialEntries={['/absen/sesi-contoh?session=optional']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('button', { name: 'Aktifkan kamera depan' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Browser tidak akan meminta izin GPS/),
    ).toBeVisible();
    expect(watchPosition).not.toHaveBeenCalled();
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

  it.each([
    ['closed', 'Sesi sudah ditutup'],
    ['expired', 'Sesi telah kedaluwarsa'],
    ['unknown', 'Status sesi belum termuat'],
  ])('menampilkan state sesi %s tanpa CTA absensi', async (state, title) => {
    render(
      <MemoryRouter initialEntries={[`/absen/sesi-contoh?session=${state}`]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: title })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: /lokasi|kamera|frame/i }),
    ).not.toBeInTheDocument();
  });

  it('memberikan state unknown tanpa menampilkan sukses', async () => {
    render(
      <MemoryRouter initialEntries={['/hasil/attempt-contoh?state=empty']}>
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
  });

  it('memuat ulang hasil simulasi berdasarkan attemptId tanpa router state', async () => {
    render(
      <MemoryRouter initialEntries={['/hasil/attempt-simulasi-001']}>
        <App />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: 'Absen berhasil' }),
    ).toBeVisible();
    expect(screen.getByText('Peserta Simulasi')).toBeVisible();
  });

  it('memisahkan hadir sah, terlambat, belum, dan percobaan gagal pada rekap', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/sesi/sesi-contoh']}>
        <App />
      </MemoryRouter>,
    );

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
    expect(screen.getAllByText('Gagal').length).toBeGreaterThan(0);
  });

  it('aksi admin memberi feedback tanpa keberhasilan semu', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin/sesi/sesi-contoh']}>
        <App />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Ekspor Excel' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Ekspor belum terhubung. Tidak ada berkas yang dibuat.',
    );
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
