import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/ws': { target: 'ws://localhost:8000', ws: true },
      '/docs': 'http://localhost:8000',
      '/redoc': 'http://localhost:8000',
      '/openapi.json': 'http://localhost:8000',
    },
  },
})
