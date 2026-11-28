import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    // O host acima não prende o WebSocket de HMR. Em middleware mode ele escuta em ws.host.
    ws: {
      host: '127.0.0.1',
    },
  },
  preview: {
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist/client',
    emptyOutDir: true,
  },
});
