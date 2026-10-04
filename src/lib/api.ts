/**
 * Authenticated calls to the FajuARC backend.
 *
 * The backend identifies the caller only from the Privy access token (see
 * server/auth.mjs) — never from ids/emails in the request body — so every
 * request that touches a user's wallet or data must go through these helpers.
 */

import { getAccessToken } from '@privy-io/react-auth'

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3002'

/** fetch() against the backend with `Authorization: Bearer <Privy access token>`. */
export async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

/**
 * Opens an authenticated Server-Sent Events stream. EventSource can't send
 * headers, so the token goes in `access_token`. The browser's built-in
 * auto-reconnect would keep reusing an expired token (and give up on the
 * resulting 401), so when the stream closes we reopen it with a fresh token.
 *
 * @returns a function that closes the stream for good.
 */
export function openAuthedEventSource(
  path: string,
  params: Record<string, string>,
  onMessage: (event: MessageEvent) => void,
): () => void {
  let source: EventSource | null = null
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const connect = async () => {
    const token = await getAccessToken().catch(() => null)
    if (stopped) return
    if (!token) {
      retryTimer = setTimeout(connect, 5000) // not logged in (yet) — try again shortly
      return
    }
    const query = new URLSearchParams({ ...params, access_token: token })
    source = new EventSource(`${API_BASE}${path}?${query}`)
    source.onmessage = onMessage
    source.onerror = () => {
      // Transient drops are retried by the browser itself (readyState CONNECTING);
      // only a CLOSED stream (e.g. 401 after token expiry) needs a manual reopen.
      if (source?.readyState === EventSource.CLOSED && !stopped) {
        source.close()
        retryTimer = setTimeout(connect, 5000)
      }
    }
  }

  connect()

  return () => {
    stopped = true
    clearTimeout(retryTimer)
    source?.close()
  }
}
