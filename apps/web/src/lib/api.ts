/**
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

export async function apiPost<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    throw new Error(`${endpoint} failed with ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function apiGet<T>(endpoint: string): Promise<T> {
  const res = await fetch(`${API_BASE}/${endpoint}`)
  if (!res.ok) {
    throw new Error(`${endpoint} failed with ${res.status}`)
  }
  return res.json() as Promise<T>
}
