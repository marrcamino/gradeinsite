import { session } from '$lib/session.svelte'
import type { LayoutLoad } from './$types'

// The desktop app is a Tauri shell loading files off disk - there is no Node
// server to render on. Prerender the routes to static HTML at build time and
// let the client router take over from there.
export const prerender = true
export const ssr = false

/**
 * Put the signed-in instructor back before anything renders.
 *
 * A reload restarts the webview, so every rune in the app starts empty again -
 * including the session. Restoring it here rather than in a component is what
 * makes the refresh invisible: `load` runs before the first screen is drawn, so
 * the guards below it already know who is signed in and nobody sees the
 * sign-in form flash past on the way back to their records.
 *
 * The session deliberately does not travel to those guards as load data. This
 * function runs once a launch and its return value is then cached for every
 * navigation after it, while signing in and out changes the session constantly
 * - a guard reading the cached copy would answer with whoever was signed in at
 * startup. The guards read the store itself instead, and `restore` is safe to
 * call from each of them because it hands back an already-restored session
 * untouched.
 */
export const load: LayoutLoad = () => {
  session.restore()
}
