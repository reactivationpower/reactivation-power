/**
 * Clones the healthcare course's module/video structure into the
 * Home Services course. Copies module titles, descriptions, statuses and
 * sort orders, plus every video's title, description, status and sort order.
 * Does NOT copy video files, thumbnails, durations, or attachments —
 * those get uploaded per-video through the admin UI later.
 *
 * Idempotent: skips any module (by sort_order) that already exists on the
 * Home Services course.
 */
import pg from 'pg'

const connectionString = (
  process.env.POSTGRES_URL_NON_POOLING || ''
).replace(/([?&])sslmode=[^&]*/, '$1')

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

async function main() {
  await client.connect()

  const { rows: courses } = await client.query(
    `select id, sector from courses where sector in ('healthcare','home_services')`,
  )
  const source = courses.find((c) => c.sector === 'healthcare')
  const target = courses.find((c) => c.sector === 'home_services')
  if (!source || !target) throw new Error('Missing source or target course')

  const { rows: modules } = await client.query(
    `select id, title, description, status, sort_order
       from modules where course_id = $1 order by sort_order`,
    [source.id],
  )

  let modulesCreated = 0
  let videosCreated = 0

  for (const mod of modules) {
    const { rows: existing } = await client.query(
      `select id from modules where course_id = $1 and sort_order = $2`,
      [target.id, mod.sort_order],
    )
    let targetModuleId
    if (existing.length > 0) {
      targetModuleId = existing[0].id
      console.log(`module ${mod.sort_order} already exists, reusing`)
    } else {
      const { rows: inserted } = await client.query(
        `insert into modules (course_id, title, description, status, sort_order)
         values ($1, $2, $3, $4, $5) returning id`,
        [target.id, mod.title, mod.description, mod.status, mod.sort_order],
      )
      targetModuleId = inserted[0].id
      modulesCreated++
      console.log(`created module ${mod.sort_order}: ${mod.title}`)
    }

    const { rows: videos } = await client.query(
      `select title, description, status, sort_order
         from videos where module_id = $1 order by sort_order`,
      [mod.id],
    )
    for (const vid of videos) {
      const { rows: vexisting } = await client.query(
        `select id from videos where module_id = $1 and sort_order = $2`,
        [targetModuleId, vid.sort_order],
      )
      if (vexisting.length > 0) {
        console.log(`  video ${vid.sort_order} already exists, skipping`)
        continue
      }
      await client.query(
        `insert into videos (module_id, title, description, status, sort_order,
                             video_url, duration_seconds, thumbnail_url)
         values ($1, $2, $3, $4, $5, null, null, null)`,
        [targetModuleId, vid.title, vid.description, vid.status, vid.sort_order],
      )
      videosCreated++
      console.log(`  created video ${vid.sort_order}: ${vid.title}`)
    }
  }

  console.log(
    `\nDone. Modules created: ${modulesCreated}, videos created: ${videosCreated}`,
  )
  await client.end()
}

main().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
