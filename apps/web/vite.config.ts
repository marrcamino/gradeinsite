import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte(), tailwindcss()],

  // Emit RELATIVE asset URLs ("./assets/index-xxxx.js") so the build can be
  // dropped into any XAMPP folder - htdocs/gradeinsite/ - and just work.
  base: './',

  server: {
    port: 5173,
    // In dev the SPA runs on :5173 while PHP runs on XAMPP :80. Proxying
    // /api through Vite keeps every request same-origin, so the browser
    // never applies CORS. Production is same-origin by construction.
    proxy: {
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/gradeinsite/api'),
      },
    },
  },
})
