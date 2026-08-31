import { fetch } from '@tauri-apps/plugin-http'
import { endpointUrl, getEndpoint } from '$lib/db'

/**
 * Talking to the school server.
 *
 * `fetch` here is the one from tauri-plugin-http, which sends the request from
 * Rust rather than from the webview. That matters: the desktop app's page has
 * an origin of its own, so a browser fetch to the school server would be a
 * cross-origin request and would need CORS headers on the API. Going out
 * through Rust means there is no origin to check, and the API can stay the
 * plain same-origin PHP the student portal needs it to be.
 *
 * The address is never compiled in. It is read from `server_endpoint`, which
 * the instructor edits in the app, so moving the server or changing the subnet
 * does not need a new build.
 */

/** Long enough for a slow computer on school wi-fi, short enough to give up. */
const TIMEOUT_MS = 8000

/**
 * Sign-in waits on this before falling back to the cached password, and the
 * instructor is watching a spinner the whole time, so it gives up sooner. A
 * server on the same wi-fi answers in milliseconds; anything past a couple of
 * seconds is not there.
 */
export const QUICK_TIMEOUT_MS = 2500

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: 'offline'; message: string }
  | { ok: false; reason: 'rejected'; message: string; status: number }

export function isOffline<T>(result: ApiResult<T>): boolean {
  return !result.ok && result.reason === 'offline'
}

/**
 * POST a JSON body to one of the API scripts and read the JSON back.
 *
 * The two ways this fails are kept apart on purpose. "Offline" means the server
 * could not be reached at all, and the right response is to carry on working
 * locally. "Rejected" means the server answered and said no, which is something
 * the instructor has to see.
 */
export async function post<T>(
  script: string,
  body: unknown,
  timeoutMs: number = TIMEOUT_MS
): Promise<ApiResult<T>> {
  let url: string
  try {
    url = `${endpointUrl(await getEndpoint())}api/${script}`
  } catch (error) {
    return { ok: false, reason: 'offline', message: describe(error) }
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    return {
      ok: false,
      reason: 'offline',
      message: `Could not reach the server at ${url}. ${describe(error)}`,
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    // Apache serving an error page, or the wrong path: a reply that is not
    // JSON means the address points at something that is not this API.
    return {
      ok: false,
      reason: 'rejected',
      status: response.status,
      message: `The server at ${url} did not answer with JSON. Check the address.`,
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload as { error: unknown }).error)
        : `The server refused the request (${response.status}).`

    return { ok: false, reason: 'rejected', status: response.status, message }
  }

  return { ok: true, data: payload as T }
}

/** Whether the server is up, used by the sign-in screen and the sync button. */
export async function reachable(): Promise<boolean> {
  try {
    const url = `${endpointUrl(await getEndpoint())}api/health.php`
    const response = await fetch(url, { signal: AbortSignal.timeout(QUICK_TIMEOUT_MS) })
    return response.ok
  } catch {
    return false
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
