import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';

import {
  captureBurst,
  mapMediaError,
  requestFrontCamera,
  stopCameraStream,
} from './cameraService';
import {
  CameraError,
  type BurstConfig,
  type CameraState,
  type CapturedFrame,
} from './types';

const INITIAL_STATE: CameraState = {
  status: 'idle',
  error: null,
  capturedCount: 0,
  targetCount: 0,
};

export interface UseCameraResult {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: CameraState;
  frames: readonly CapturedFrame[];
  start: () => Promise<void>;
  capture: (config: BurstConfig) => Promise<readonly CapturedFrame[]>;
  reset: () => void;
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureAbortRef = useRef<AbortController | null>(null);
  const manuallyStoppingRef = useRef(false);
  const mountedRef = useRef(true);
  const [state, setState] = useState<CameraState>(INITIAL_STATE);
  const [frames, setFrames] = useState<CapturedFrame[]>([]);

  const releaseResources = useCallback(() => {
    captureAbortRef.current?.abort();
    captureAbortRef.current = null;
    manuallyStoppingRef.current = true;
    stopCameraStream(streamRef.current);
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    manuallyStoppingRef.current = false;
  }, []);

  const reset = useCallback(() => {
    releaseResources();
    setFrames([]);
    setState(INITIAL_STATE);
  }, [releaseResources]);

  const start = useCallback(async () => {
    releaseResources();
    setFrames([]);
    setState({ ...INITIAL_STATE, status: 'requesting' });

    try {
      const stream = await requestFrontCamera();
      if (!mountedRef.current) {
        stopCameraStream(stream);
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) {
        stopCameraStream(stream);
        streamRef.current = null;
        throw new CameraError(
          'video-not-ready',
          'Pratinjau kamera belum tersedia. Muat ulang halaman lalu coba lagi.',
        );
      }
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      stream.getVideoTracks().forEach((track) => {
        track.addEventListener(
          'ended',
          () => {
            if (mountedRef.current && !manuallyStoppingRef.current) {
              captureAbortRef.current?.abort();
              setFrames([]);
              setState({
                ...INITIAL_STATE,
                status: 'error',
                error: new CameraError(
                  'stream-ended',
                  'Aliran kamera berhenti. Aktifkan kembali kamera untuk melanjutkan.',
                ),
              });
            }
          },
          { once: true },
        );
      });

      setState({ ...INITIAL_STATE, status: 'ready' });
    } catch (error) {
      const cameraError = mapMediaError(error);
      if (mountedRef.current) {
        setState({ ...INITIAL_STATE, status: 'error', error: cameraError });
      }
    }
  }, [releaseResources]);

  const capture = useCallback(
    async (config: BurstConfig): Promise<readonly CapturedFrame[]> => {
      const video = videoRef.current;
      if (!video || !streamRef.current) {
        const error = new CameraError(
          'video-not-ready',
          'Aktifkan kamera dan tunggu pratinjau sebelum mengambil gambar.',
        );
        setState({ ...INITIAL_STATE, status: 'error', error });
        throw error;
      }

      captureAbortRef.current?.abort();
      const abortController = new AbortController();
      captureAbortRef.current = abortController;
      setFrames([]);
      setState({
        status: 'capturing',
        error: null,
        capturedCount: 0,
        targetCount: config.frameCount,
      });

      try {
        const capturedFrames = await captureBurst({
          video,
          config,
          signal: abortController.signal,
          onProgress: (capturedCount) => {
            if (mountedRef.current) {
              setState((current) => ({ ...current, capturedCount }));
            }
          },
        });
        // Burst selesai: kamera dan timer tidak boleh tetap aktif saat frame
        // menunggu proses lanjutan di memori sesi.
        releaseResources();
        if (mountedRef.current) {
          setFrames(capturedFrames);
          setState({
            status: 'captured',
            error: null,
            capturedCount: capturedFrames.length,
            targetCount: config.frameCount,
          });
        }
        return capturedFrames;
      } catch (error) {
        const cameraError = mapMediaError(error);
        if (mountedRef.current) {
          setFrames([]);
          setState({
            ...INITIAL_STATE,
            status: 'error',
            error: cameraError,
          });
        }
        throw cameraError;
      } finally {
        if (captureAbortRef.current === abortController) {
          captureAbortRef.current = null;
        }
      }
    },
    [releaseResources],
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        captureAbortRef.current?.abort();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      releaseResources();
    };
  }, [releaseResources]);

  return { videoRef, state, frames, start, capture, reset };
}
