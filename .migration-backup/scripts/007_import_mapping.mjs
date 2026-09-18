// Migration: CSV import + automatic niche identification
// - participants.default_niche_id: practice-wide fallback niche
// - contacts.service_label: the raw service/appointment type from the practice's export
// - service_niche_mappings: per-practice "service name -> niche" mappings,
//   learned once at import time and reused on every future upload.
import pg from 'pg'

const url = (process.env.POSTGRES_URL_NON_POOLING ?? '').replace(
  /[?&]sslmode=[^&]*/,
  '',
)
const client = new pg.Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

await client.query(`
  alter table participants
  add column if not exists default_niche_id uuid references niches(id) on delete set null
`)

await client.query(`
  alter table contacts
  add column if not exists service_label text
`)

await client.query(`
  create table if not exists service_niche_mappings (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references participants(id) on delete cascade,
    service_label text not null,
    niche_id uuid references niches(id) on delete cascade,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (owner_id, service_label)
  )
`)

console.log('007_import_mapping applied')
await client.end()
