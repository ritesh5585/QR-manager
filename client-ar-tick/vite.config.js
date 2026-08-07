// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    allowedHosts: [
      'mustang-refold-paternity.ngrok-free.dev',
      'localhost',
    ],
    // For development, you can also use a proxy to avoid CORS
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        secure: false,
      }
    }
  },
});