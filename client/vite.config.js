import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { apiMiddleware } from '../server/apiHandler.js';
import { attachGameSocket, network } from '../server/game.js';

// Serve the trivia API and the phone-play socket directly from the Vite dev
// server — single port, no proxy. Phones can only reach it when started with
// `--host` (`npm run party`).
const apiPlugin = {
  name: 'trivia-api',
  configureServer(server) {
    server.middlewares.use(apiMiddleware);
    if (server.httpServer) attachGameSocket(server.httpServer);
    network.lanEnabled = !!server.config.server.host;
  },
};

export default defineConfig({
  plugins: [vue(), apiPlugin],
  server: {
    port: 5173,
  },
});
