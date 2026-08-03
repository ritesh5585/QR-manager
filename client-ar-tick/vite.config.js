import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/ar-tick/',
  server: {
    host: true,
    // https: true,
    port: 5173,
    strictPort: true, 
    allowedHosts: [
      'mustang-refold-paternity.ngrok-free.dev'
    ],
  },
});
