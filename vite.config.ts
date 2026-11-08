import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  if (mode === 'production' && env.VITE_DATA_SOURCE === 'mock') {
    throw new Error(
      'Build produksi ditolak: VITE_DATA_SOURCE tidak boleh bernilai mock.',
    );
  }

  return {
    plugins: [react()],
    build: {
      sourcemap: false,
    },
  };
});
