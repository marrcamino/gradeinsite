// The desktop app is a Tauri shell loading files off disk - there is no Node
// server to render on. Prerender the routes to static HTML at build time and
// let the client router take over from there.
export const prerender = true
export const ssr = false
