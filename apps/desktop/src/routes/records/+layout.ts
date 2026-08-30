import { redirect } from '@sveltejs/kit'
import { session } from '$lib/session.svelte'
import type { LayoutLoad } from './$types'

/**
 * The guard on everything behind the sign-in screen.
 *
 * It runs on a reload and on a typed-in URL alike, before the layout mounts, so
 * these screens are never built for nobody. The layout keeps a reactive check
 * of its own for the other case this cannot see: signing out does not re-run a
 * `load`.
 */
export const load: LayoutLoad = () => {
  if (!session.restore()) {
    redirect(307, '/')
  }
}
