/**
 * vite.config.ts
 * 
 * Vite configuration file for the project.
 * It sets up the React plugin, Tailwind CSS integration, and dev server options.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,
    host: '0.0.0.0',
    port: 3000,
  },
});
