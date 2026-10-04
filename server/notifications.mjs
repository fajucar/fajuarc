/**
 * In-process pub/sub for the SSE notification stream (GET /api/notifications/stream
 * in index.mjs). The scheduler broadcasts payment lifecycle events here; each
 * connected SSE client subscribes and forwards matching events to its browser.
 */

import { EventEmitter } from 'node:events'

export const notificationBus = new EventEmitter()
notificationBus.setMaxListeners(0) // unbounded — one listener per connected SSE client

/**
 * @param {string} walletAddress - owner of the event, used by the SSE route to filter
 * @param {object} event - arbitrary JSON payload, must include a `type`
 */
export function broadcast(walletAddress, event) {
  const owner = (walletAddress ?? '').toLowerCase()
  // An event without an owner would match no one safely — drop it instead of
  // letting it reach every connected client.
  if (!owner) {
    console.warn('[Notifications] dropped event without wallet address:', event?.type)
    return
  }
  notificationBus.emit('notification', {
    ...event,
    walletAddress: owner,
  })
}
