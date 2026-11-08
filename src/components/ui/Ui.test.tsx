import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Badge } from './Badge';
import { Button } from './Button';
import { EmptyState, ErrorNotice, LoadingState } from './Feedback';
import { PINInput } from './Input';
import { SessionCard } from './SessionCard';

describe('komponen UI dasar', () => {
  it('menonaktifkan button dan memberi status saat loading', () => {
    render(<Button loading>Simpan</Button>);

    expect(screen.getByRole('button', { name: 'Memproses…' })).toBeDisabled();
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true');
  });

  it('menghubungkan label dan error PIN serta mempertahankan nol awal', async () => {
    const user = userEvent.setup();
    render(<PINInput label="PIN (6 digit)" error="PIN belum lengkap." />);
    const input = screen.getByLabelText('PIN (6 digit)');

    await user.type(input, '012345');

    expect(input).toHaveValue('012345');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('PIN belum lengkap.');
  });

  it('button aktif memanggil tindakan satu kali', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Lanjut</Button>);

    await user.click(screen.getByRole('button', { name: 'Lanjut' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('badge menyampaikan status lewat teks, bukan warna saja', () => {
    render(<Badge tone="success">Hadir</Badge>);

    expect(screen.getByText('Hadir')).toBeVisible();
  });

  it('kartu sesi menampilkan label status dan informasi yang diberikan', () => {
    render(
      <SessionCard
        title="Sesi contoh"
        schedule="08.00–10.00"
        location="Lokasi menunggu konfirmasi server"
        status="open"
      />,
    );

    expect(screen.getByRole('heading', { name: 'Sesi contoh' })).toBeVisible();
    expect(screen.getByText('Sesi terbuka')).toBeVisible();
    expect(screen.getByText('Lokasi menunggu konfirmasi server')).toBeVisible();
  });

  it('feedback memakai peran aksesibilitas yang sesuai', () => {
    const { rerender } = render(
      <ErrorNotice>
        <p>Silakan coba lagi.</p>
      </ErrorNotice>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Silakan coba lagi.');

    rerender(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Memuat data');

    rerender(
      <EmptyState
        title="Belum ada sesi"
        description="Periksa kembali nanti."
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Belum ada sesi' }),
    ).toBeVisible();
  });
});
