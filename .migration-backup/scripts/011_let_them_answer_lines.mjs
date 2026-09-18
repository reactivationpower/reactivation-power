/**
 * 011: Break inline "(Let them answer...)" cues onto their own line.
 *
 * Before: "...something else? (Let them answer.) Thanks for letting me know..."
 * After:  "...something else?
 *
 *          Let them answer.
 *
 *          Thanks for letting me know..."
 *
 * Applies to every script_flow_steps row (all niches + general flow).
 */
import pg from 'pg'

const cs = (process.env.POSTGRES_URL_NON_POOLING || '').replace(
  /([?&])sslmode=[^&]*/,
  '$1',
)
const client = new pg.Client({
  connectionString: cs,
  ssl: { rejectUnauthorized: false },
})

/** Convert "(Let them answer, be warm...)" -> "Let them answer, be warm..." on its own line */
function breakOutCues(content) {
  // Match "(Let them answer" through the closing paren, case-insensitive.
  const re = /[ \t]*\((let them answer[^)]*)\)[ \t]*/gi
  return content.replace(re, (_match, cue) => {
    // Normalize the cue text: capitalize first letter, ensure ending period.
    let text = cue.trim()
    text = text.charAt(0).toUpperCase() + text.slice(1)
    if (!/[.!?]$/.test(text)) text += '.'
    return `\n\n${text}\n\n`
  })
}

/** Collapse any accidental 3+ newlines down to exactly 2 */
function tidy(content) {
  return content.replace(/\n{3,}/g, '\n\n').trim()
}

async function main() {
  await client.connect()

  const { rows } = await client.query(
    String.raw`select id, step_key, content from script_flow_steps where content ~* '\(let them answer'`,
  )
  console.log(`Steps to update: ${rows.length}`)

  let updated = 0
  for (const row of rows) {
    const next = tidy(breakOutCues(row.content))
    if (next !== row.content) {
      await client.query(
        'update script_flow_steps set content = $1 where id = $2',
        [next, row.id],
      )
      updated++
    }
  }
  console.log(`Updated: ${updated}`)

  // Verify nothing inline remains
  const { rows: left } = await client.query(
    String.raw`select count(*)::int as c from script_flow_steps where content ~* '\(let them answer'`,
  )
  console.log(`Remaining inline cues: ${left[0].c}`)

  await client.end()
}

main().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})
