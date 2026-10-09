import pg, { Pool } from 'pg'
import { expect, it } from 'vitest'

it('bounds both named and default test pools while allowing two-client race tests', async () => {
  const pools = [new pg.Pool(), new Pool({ max: 10 }), new Pool({ max: 1 })]
  expect(pools.map(pool => pool.options.max)).toEqual([2, 2, 1])
  // No connections are made here. Explicit cleanup must coexist with the
  // setup hook, which must not call end() twice on already-ended pools.
  await Promise.all(pools.map(pool => pool.end()))
})
