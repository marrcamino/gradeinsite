import { redirect } from '@sveltejs/kit'
import { session } from '$lib/session.svelte'
import type { PageLoad } from './$types'

/**
 * The sign-in screen is for people who are not signed in.
 *
 * Reloading while signed in lands here only because `/` is where the window
 * opens; the restored session means there is nothing to ask for, so this hands
 * them straight back to their records.
 */
export const load: PageLoad = () => {
  if (session.restore()) {
    redirect(307, '/records')
  }
}
