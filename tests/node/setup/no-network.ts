import net from 'node:net'
import { beforeAll } from 'vitest'

/**
 * Extraction is a pure function over saved HTML: repairing it after a Source
 * redesign must never depend on the Sources being reachable. This setup makes
 * that a property of the suite rather than a convention — any attempt to open
 * a socket or call `fetch` fails the test that made it.
 */
beforeAll(() => {
  const refuse = (what: string) => () => {
    throw new Error(`Tests run with no network access: ${what} was attempted`)
  }

  globalThis.fetch = refuse('fetch()') as unknown as typeof globalThis.fetch

  const connect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const target = args[0]
    const isUnixSocket = typeof target === 'string' || (typeof target === 'object' && target !== null && 'path' in target)
    if (isUnixSocket) {
      return connect.apply(this, args as Parameters<typeof connect>)
    }
    throw new Error('Tests run with no network access: a TCP connection was attempted')
  } as typeof net.Socket.prototype.connect
})
