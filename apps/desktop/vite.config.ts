import { defineConfig } from 'vite'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'

// Tauri sets this when developing against a physical device on the LAN.
const host = process.env.TAURI_DEV_HOST

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],

  // Tauri shows its own errors; don't let Vite wipe the terminal.
  clearScreen: false,

  server: {
    // Must match `build.devUrl` in src-tauri/tauri.conf.json.
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    // src-tauri is watched by cargo, not Vite.
    watch: { ignored: ['**/src-tauri/**'] },
  },
})
