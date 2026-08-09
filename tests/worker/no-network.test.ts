import { expect, it } from 'vitest'

it('refuses fetch', () => {
  expect(() => fetch('https://cdn.mos.cms.futurecdn.net/an-image.jpg')).toThrow(
    /no network access/,
  )
})
