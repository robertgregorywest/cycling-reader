import net from 'node:net'
import { expect, it } from 'vitest'

it('refuses fetch', () => {
  expect(() => fetch('https://www.cyclingnews.com/')).toThrow(/no network access/)
})

it('refuses a TCP connection', () => {
  expect(() => new net.Socket().connect(443, 'www.cyclingnews.com')).toThrow(/no network access/)
})
