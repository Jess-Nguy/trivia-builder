import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { apiMiddleware } from '../server/apiHandler.js';

// Serve the trivia API directly from the Vite dev server — single port, no proxy.
const apiPlugin = {
  name: 'trivia-api',
  configureServer(server) {
    server.middlewares.use(apiMiddleware);
  },
};

export default defineConfig({
  plugins: [vue(), apiPlugin],
  server: {
    port: 5173,
  },
});
