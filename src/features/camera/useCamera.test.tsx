import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { useCamera } from './useCamera';

function CameraHarness({ onReset }: { onReset?: (reset: () => void) => void }) {
  const camera = useCamera();
  useEffect(() => {
    onReset?.(camera.reset);
  }, [camera.reset, onReset]);

  return (
    <>
      <video ref={camera.videoRef} />
      <output>{camera.state.status}</output>
      <button type="button" onClick={() => void camera.start()}>
        Aktifkan
      </button>
      <button
        type="button"
        onClick={() =>
          void camera.capture({
            frameCount: 1,
            durationMs: 0,
            jpegQuality: 0.86,
          })
        }
      >
        Ambil frame
      </button>
    </>
  );
}

describe('useCamera lifecycle', () => {
  it('tidak meminta kamera sebelum tindakan pengguna dan berhenti saat unmount', async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    const addEventListener = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
      getVideoTracks: () => [{ addEventListener }],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();

    const view = render(<CameraHarness />);
    expect(getUserMedia).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Aktifkan' }));
    await waitFor(() => expect(screen.getByText('ready')).toBeVisible());
    expect(getUserMedia).toHaveBeenCalledOnce();

    view.unmount();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('reset menghentikan track dan kembali idle', async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
      getVideoTracks: () => [{ addEventListener: vi.fn() }],
    } as unknown as MediaStream;
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    let resetCamera: (() => void) | undefined;
    render(<CameraHarness onReset={(reset) => (resetCamera = reset)} />);

    await user.click(screen.getByRole('button', { name: 'Aktifkan' }));
    await waitFor(() => expect(screen.getByText('ready')).toBeVisible());
    act(() => resetCamera?.());

    expect(screen.getByText('idle')).toBeVisible();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('menghentikan track segera setelah burst selesai', async () => {
    const user = userEvent.setup();
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
      getVideoTracks: () => [{ addEventListener: vi.fn() }],
    } as unknown as MediaStream;
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
    );

    render(<CameraHarness />);
    await user.click(screen.getByRole('button', { name: 'Aktifkan' }));
    await waitFor(() => expect(screen.getByText('ready')).toBeVisible());
    const video = document.querySelector('video');
    Object.defineProperties(video, {
      readyState: { configurable: true, value: 4 },
      videoWidth: { configurable: true, value: 640 },
      videoHeight: { configurable: true, value: 480 },
    });

    await user.click(screen.getByRole('button', { name: 'Ambil frame' }));
    await waitFor(() => expect(screen.getByText('captured')).toBeVisible());
    expect(stop).toHaveBeenCalledOnce();
  });
});
