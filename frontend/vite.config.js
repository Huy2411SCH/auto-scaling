import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // so `npm run dev` can talk to the local Express server on :3000
      '/api': 'http://localhost:3000'
    }
  }
})
