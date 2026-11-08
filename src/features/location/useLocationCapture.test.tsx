import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocationCapture } from './useLocationCapture';
import { describe, expect, it, vi } from 'vitest';

function Harness({ scope }: { scope: string }) {
  const location = useLocationCapture(scope);
  return (
    <>
      <output>{location.state.status}</output>
      <button
        type="button"
        onClick={() => void location.capture().catch(() => undefined)}
      >
        Ambil lokasi
      </button>
    </>
  );
}

describe('useLocationCapture lifecycle', () => {
  it('membersihkan watcher saat sesi berubah dan saat navigasi unmount', async () => {
    const user = userEvent.setup();
    const clearWatch = vi.fn();
    let nextWatchId = 1;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        watchPosition: vi.fn(() => nextWatchId++),
        clearWatch,
      },
    });
    const view = render(<Harness scope="sesi-a" />);

    await user.click(screen.getByRole('button', { name: 'Ambil lokasi' }));
    expect(screen.getByText('requesting')).toBeVisible();
    view.rerender(<Harness scope="sesi-b" />);
    await waitFor(() => expect(screen.getByText('idle')).toBeVisible());
    expect(clearWatch).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole('button', { name: 'Ambil lokasi' }));
    act(() => view.unmount());
    expect(clearWatch).toHaveBeenCalledWith(2);
  });
});
