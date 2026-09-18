/**
 * Aligns the niche list with the 19 official Script-Only PDFs:
 *  - Renames "Dental" to "Dental Implants" (id preserved; contacts keep their niche)
 *  - Adds "Clear Aligners" and "Orthodontics / Braces"
 *  - Deactivates "Med Spa" and "Acoustic Wave Therapy" (no official script)
 *  - Re-numbers active niches alphabetically
 */
import pg from 'pg'

const client = new pg.Client({
  connectionString: (process.env.POSTGRES_URL_NON_POOLING ?? '').replace(
    /([?&])sslmode=[^&]*/,
    '$1',
  ),
  ssl: { rejectUnauthorized: false },
})
await client.connect()

// 1. Rename Dental -> Dental Implants
await client.query(
  `update niches set name = 'Dental Implants' where name = 'Dental'`,
)

// 2. Add the two new niches if missing
for (const name of ['Clear Aligners', 'Orthodontics / Braces']) {
  await client.query(
    `insert into niches (name, is_active, sort_order)
     select $1, true, coalesce(max(sort_order), 0) + 1 from niches
     where not exists (select 1 from niches where name = $1)`,
    [name],
  )
}

// 3. Deactivate niches without an official script
await client.query(
  `update niches set is_active = false
   where name in ('Med Spa', 'Acoustic Wave Therapy')`,
)

// 4. Re-number active niches alphabetically (inactive pushed to the end)
const { rows } = await client.query(
  `select id from niches order by is_active desc, name asc`,
)
for (let i = 0; i < rows.length; i++) {
  await client.query('update niches set sort_order = $1 where id = $2', [
    i + 1,
    rows[i].id,
  ])
}

const { rows: after } = await client.query(
  'select name, is_active from niches order by sort_order',
)
console.log('NICHES AFTER MIGRATION:')
after.forEach((r) => console.log(` ${r.is_active ? '[on] ' : '[off]'} ${r.name}`))

await client.end()
