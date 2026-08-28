import adapter from '@sveltejs/adapter-static'

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    // Tauri loads the frontend off the filesystem - there is no Node server to
    // deploy to, so every route has to come out of the build as static files.
    // `prerender` in src/routes/+layout.ts is what makes that hold.
    adapter: adapter(),
  },
}
