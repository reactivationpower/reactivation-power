/**
 * Make every script flow step "spoken words only":
 * 1. Strip stage-direction paragraphs like "(Click what you hear.)" or
 *    "(Listen to how ... responds ...)" from all flow steps (all niches +
 *    the general flow).
 * 2. Merge instruction-only "hub" steps into the "open" step: the open
 *    screen ends with the opening question, so the response buttons now sit
 *    directly under the spoken script.
 * 3. Give picker steps real spoken lines instead of instructions.
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

// Paragraph is a pure stage direction (not spoken words)
const INSTRUCTION = /^\((click|listen|log |use the urgent|pick |choose |if they describe anything potentially hazardous)/i

function stripInstructions(content) {
  const paras = content.split(/\n\n+/)
  const kept = paras.filter((p) => {
    const t = p.trim()
    if (!t.startsWith('(')) return true
    return !INSTRUCTION.test(t)
  })
  return kept.join('\n\n').trim()
}

// Spoken replacements for picker/hub-style steps that would otherwise be empty
const SPOKEN_REPLACEMENTS = {
  problem_picker: {
    title: 'Tell Me More',
    content:
      'Oh no, I\u2019m sorry to hear that \u2014 tell me a little more about what\u2019s been going on.',
  },
  plans_picker: {
    title: 'Tell Me More',
    content:
      'Oh, that\u2019s exciting! Tell me a little more about what you have planned.',
  },
  property_hub: {
    title: 'Tell Me More',
    content:
      'Got it \u2014 thanks for letting me know. Tell me a little more so I can make sure we take care of you the right way.',
  },
}

async function main() {
  await client.connect()

  // ---- 1. Merge 'hub' into 'open' for every scope that has both ----
  const scopes = await client.query(`
    select distinct niche_id from script_flow_steps
    where step_key = 'hub'
  `)
  for (const { niche_id } of scopes.rows) {
    const scopeCond = niche_id === null ? 'niche_id is null' : 'niche_id = $1'
    const args = niche_id === null ? [] : [niche_id]

    // offset hub choices so they come after open's own (voicemail etc. stay last)
    await client.query(
      `update script_flow_choices set from_step_key = 'open', sort_order = sort_order + 100
       where from_step_key = 'hub' and ${scopeCond}`,
      args,
    )
    // push open's non-answer choices (voicemail, gatekeeper, wrong number) to the end
    await client.query(
      `update script_flow_choices set sort_order = sort_order + 500
       where from_step_key = 'open' and to_step_key in ('voicemail','gatekeeper','wrong_number') and ${scopeCond}`,
      args,
    )
    // delete the "continue" choice open -> hub
    await client.query(
      `delete from script_flow_choices
       where from_step_key = 'open' and to_step_key = 'hub' and ${scopeCond}`,
      args,
    )
    // delete the hub step itself
    await client.query(
      `delete from script_flow_steps where step_key = 'hub' and ${scopeCond}`,
      args,
    )
    console.log('merged hub->open for scope', niche_id ?? 'general')
  }

  // ---- 2. Strip stage directions from every step ----
  const steps = await client.query(
    `select id, step_key, niche_id, title, content from script_flow_steps`,
  )
  let stripped = 0
  const emptied = []
  for (const s of steps.rows) {
    const next = stripInstructions(s.content)
    if (next !== s.content) {
      let title = s.title
      let content = next
      if (!content) {
        const repl = SPOKEN_REPLACEMENTS[s.step_key]
        if (repl) {
          title = repl.title
          content = repl.content
        } else {
          emptied.push(`${s.niche_id ?? 'general'}:${s.step_key}`)
          continue // keep original rather than leave a blank screen
        }
      } else if (SPOKEN_REPLACEMENTS[s.step_key]) {
        // picker had leftover text; prepend the spoken line and use clean title
        title = SPOKEN_REPLACEMENTS[s.step_key].title
        content = SPOKEN_REPLACEMENTS[s.step_key].content
      }
      await client.query(
        `update script_flow_steps set content = $1, title = $2 where id = $3`,
        [content, title, s.id],
      )
      stripped++
    }
  }
  console.log('steps updated:', stripped)
  if (emptied.length) console.log('WOULD-BE-EMPTY (left as-is):', emptied.join(', '))

  await client.end()
}

main().catch((e) => {
  console.error('MIGRATION FAILED:', e.message)
  process.exit(1)
})
