import { useEffect, useState } from 'react';

import { appConfig } from '../../config/appConfig';
import type { DemoVisualData } from './types';

type DemoDataState =
  | { status: 'loading'; data: null }
  | { status: 'ready'; data: DemoVisualData }
  | { status: 'unavailable'; data: null };

export function useVisualDemo(): DemoDataState {
  const [state, setState] = useState<DemoDataState>({
    status: 'loading',
    data: null,
  });

  useEffect(() => {
    let active = true;

    async function loadFixture() {
      if (!import.meta.env.DEV || appConfig.dataSource !== 'mock') {
        if (active) {
          setState({ status: 'unavailable', data: null });
        }
        return;
      }

      const { visualFixtures } = await import('../../mocks/visualFixtures');
      if (active) {
        setState({ status: 'ready', data: visualFixtures });
      }
    }

    void loadFixture();

    return () => {
      active = false;
    };
  }, []);

  return state;
}

export type VisualState = 'data' | 'loading' | 'empty' | 'error';

export function getVisualState(search: string): VisualState {
  if (!import.meta.env.DEV) {
    return 'data';
  }

  const requested = new URLSearchParams(search).get('state');
  return requested === 'loading' ||
    requested === 'empty' ||
    requested === 'error'
    ? requested
    : 'data';
}
