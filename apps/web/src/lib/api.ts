/**
 * Talking to the PHP API.
 *
 * Every request below uses a RELATIVE URL.
 *
 * In development, Vite proxies `/api` to XAMPP (see vite.config.ts).
 * In production, the built SPA and the PHP files live in the same XAMPP
 * folder. Either way the browser sees a single origin, so CORS never
 * applies and no Access-Control-Allow-Origin header is needed.
 *
 * Do not reintroduce absolute URLs like `http://192.168.x.x/...` here -
 * that is what made the 2024 build fail.
 */
const API_BASE = 'api'

/**
 * What came back.
 *
 * A refusal is not an exception here. The API answers a first-time sign-in with
 * 409 and `reason: "password_not_set"`, which is not a failure at all - it is
 * the screen telling the portal where to send the student next. Throwing would
 * turn that into something to catch and unpick, so the reason is carried back
 * in the result instead.
 *
 * `status: 0` is the one case the server did not answer: Apache down, the wi-fi
 * gone. It is worth separating because the student can act on it - the portal
 * says the school server cannot be reached rather than blaming their password.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; reason?: string }

interface ErrorBody {
  error?: string
  reason?: string
}

/** Cookies are what carry the session, and the API is same-origin by design. */
const CREDENTIALS: RequestCredentials = 'same-origin'

async function readResult<T>(response: Response): Promise<ApiResult<T>> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    // Apache serving an error page rather than the API: a reply that is not
    // JSON means the deployment is wrong, not that the request was.
    return {
      ok: false,
      status: response.status,
      message: 'The server did not answer properly. Please tell your instructor.',
    }
  }

  if (response.ok) {
    return { ok: true, data: body as T }
  }

  const error = (body ?? {}) as ErrorBody
  return {
    ok: false,
    status: response.status,
    message: error.error ?? 'Something went wrong.',
    reason: error.reason,
  }
}

const OFFLINE: Omit<Extract<ApiResult<never>, { ok: false }>, 'reason'> = {
  ok: false,
  status: 0,
  message: 'Cannot reach the school server. Check that you are on the school wi-fi.',
}

export async function apiGet<T>(endpoint: string): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/${endpoint}`, { credentials: CREDENTIALS })
  } catch {
    return OFFLINE
  }
  return readResult<T>(response)
}

export async function apiPost<T>(endpoint: string, body: unknown): Promise<ApiResult<T>> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      credentials: CREDENTIALS,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    return OFFLINE
  }
  return readResult<T>(response)
}
