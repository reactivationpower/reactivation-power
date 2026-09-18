// Apply content/flows/*.json back to Supabase, idempotently.
//   node scripts/flows/apply.ts skin-tightening general   # one or more files
//   node scripts/flows/apply.ts --all                       # every file
//   node scripts/flows/apply.ts --dry-run skin-tightening   # show the diff only
//
// Matching rules (never duplicates, never deletes):
//   steps    niche + step_key
//   choices  niche + from_step_key + to_step_key (paired in sort_order when a
//            step has two buttons routing to the same target)
// Rows that exist in the database but not in the file are left untouched and
// listed so the author can decide what to do with them.
//
// Refuses to write anything when any file has a structural error: a choice
// that routes to a step_key that does not exist (in the niche or in general),
// or a {{token}} the player cannot fill.
import {
  GENERAL_SLUG,
  fetchAll,
  getSupabase,
  listSlugs,
  printProblems,
  readFlowFile,
  validateStructure,
  type FlowChoice,
  type FlowFile,
  type FlowStep,
} from './lib.ts'

interface StepRow extends FlowStep {
  id: string
  niche_id: string | null
}
interface ChoiceRow extends FlowChoice {
  id: string
  niche_id: string | null
}
interface NicheRow {
  id: string
  name: string
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const all = args.includes('--all')
const requested = args.filter((a) => !a.startsWith('--'))

function choiceKey(c: FlowChoice): string {
  return `${c.from_step_key}\u0000${c.to_step_key ?? ''}`
}

function short(s: string, n = 70): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '\u2026' : one
}

async function main() {
  const slugs = all ? listSlugs() : requested
  if (slugs.length === 0) {
    console.error('usage: node scripts/flows/apply.ts [--dry-run] (--all | <slug> ...)')
    process.exit(2)
  }

  // 1. Read + validate every requested file before touching the database.
  const general = readFlowFile(GENERAL_SLUG)
  const generalKeys = new Set(general.steps.map((s) => s.step_key))
  const files = new Map<string, FlowFile>()
  const problems = []
  for (const slug of slugs) {
    const file = readFlowFile(slug)
    files.set(slug, file)
    problems.push(...validateStructure(slug, file, generalKeys))
  }
  const errors = problems.filter((p) => p.level === 'error')
  if (errors.length > 0) {
    printProblems(errors)
    console.error(`\nRefusing to apply: ${errors.length} structural error(s).`)
    process.exit(1)
  }

  // 2. Resolve niche ids and load the live rows.
  const supabase = getSupabase()
  const [niches, liveSteps, liveChoices] = await Promise.all([
    fetchAll<NicheRow>(supabase, 'niches', 'id,name'),
    fetchAll<StepRow>(
      supabase,
      'script_flow_steps',
      'id,niche_id,step_key,title,content,sort_order',
    ),
    fetchAll<ChoiceRow>(
      supabase,
      'script_flow_choices',
      'id,niche_id,from_step_key,label,to_step_key,variant,sort_order',
    ),
  ])
  const nicheByName = new Map(niches.map((n) => [n.name.toLowerCase(), n.id]))

  let totalUpdated = 0
  let totalInserted = 0
  let totalUnchanged = 0

  for (const [slug, file] of files) {
    let nicheId: string | null = null
    if (slug !== GENERAL_SLUG) {
      if (!file.niche) throw new Error(`${slug}.json has no niche block`)
      const id = nicheByName.get(file.niche.name.toLowerCase())
      if (!id) {
        throw new Error(
          `${slug}.json: niche "${file.niche.name}" does not exist in the niches table. ` +
            'Create the niche in the admin first, then apply.',
        )
      }
      nicheId = id
    }

    console.log(`\n== ${slug} (${nicheId ? `niche ${nicheId}` : 'general'})`)

    // ---- steps
    const dbSteps = new Map(
      liveSteps.filter((s) => s.niche_id === nicheId).map((s) => [s.step_key, s]),
    )
    const stepUpdates: Array<{ id: string; patch: Partial<FlowStep>; why: string[] }> = []
    const stepInserts: FlowStep[] = []
    for (const s of file.steps) {
      const db = dbSteps.get(s.step_key)
      if (!db) {
        stepInserts.push(s)
        continue
      }
      const patch: Partial<FlowStep> = {}
      const why: string[] = []
      if (db.title !== s.title) {
        patch.title = s.title
        why.push(`title "${short(db.title, 40)}" -> "${short(s.title, 40)}"`)
      }
      if (db.content !== s.content) {
        patch.content = s.content
        why.push(`content (${db.content.length} -> ${s.content.length} chars)`)
      }
      if (db.sort_order !== s.sort_order) {
        patch.sort_order = s.sort_order
        why.push(`sort_order ${db.sort_order} -> ${s.sort_order}`)
      }
      if (why.length > 0) stepUpdates.push({ id: db.id, patch, why })
      else totalUnchanged++
    }
    const fileStepKeys = new Set(file.steps.map((s) => s.step_key))
    const orphanSteps = [...dbSteps.keys()].filter((k) => !fileStepKeys.has(k))

    for (const u of stepUpdates) {
      const key = file.steps.find((s) => dbSteps.get(s.step_key)?.id === u.id)?.step_key
      console.log(`  update step   ${key}: ${u.why.join('; ')}`)
    }
    for (const s of stepInserts) console.log(`  insert step   ${s.step_key} "${short(s.title, 40)}"`)
    for (const k of orphanSteps) console.log(`  keep   step   ${k} (in database, not in file)`)

    // ---- choices (paired by from+to, in sort_order, so duplicates line up)
    const dbChoiceGroups = new Map<string, ChoiceRow[]>()
    for (const c of liveChoices.filter((c) => c.niche_id === nicheId)) {
      const list = dbChoiceGroups.get(choiceKey(c)) ?? []
      list.push(c)
      dbChoiceGroups.set(choiceKey(c), list)
    }
    for (const list of dbChoiceGroups.values()) list.sort((a, b) => a.sort_order - b.sort_order)
    const fileChoiceGroups = new Map<string, FlowChoice[]>()
    for (const c of file.choices) {
      const list = fileChoiceGroups.get(choiceKey(c)) ?? []
      list.push(c)
      fileChoiceGroups.set(choiceKey(c), list)
    }
    for (const list of fileChoiceGroups.values()) list.sort((a, b) => a.sort_order - b.sort_order)

    const choiceUpdates: Array<{ id: string; patch: Partial<FlowChoice>; why: string }> = []
    const choiceInserts: FlowChoice[] = []
    for (const [key, fileList] of fileChoiceGroups) {
      const dbList = dbChoiceGroups.get(key) ?? []
      fileList.forEach((c, i) => {
        const db = dbList[i]
        if (!db) {
          choiceInserts.push(c)
          return
        }
        const patch: Partial<FlowChoice> = {}
        const why: string[] = []
        if (db.label !== c.label) {
          patch.label = c.label
          why.push(`label "${short(db.label, 40)}" -> "${short(c.label, 40)}"`)
        }
        if (db.variant !== c.variant) {
          patch.variant = c.variant
          why.push(`variant ${db.variant} -> ${c.variant}`)
        }
        if (db.sort_order !== c.sort_order) {
          patch.sort_order = c.sort_order
          why.push(`sort_order ${db.sort_order} -> ${c.sort_order}`)
        }
        if (why.length > 0) {
          choiceUpdates.push({
            id: db.id,
            patch,
            why: `${c.from_step_key} -> ${c.to_step_key}: ${why.join('; ')}`,
          })
        } else totalUnchanged++
      })
      if (dbList.length > fileList.length) {
        for (const extra of dbList.slice(fileList.length)) {
          console.log(
            `  keep   choice ${extra.from_step_key} -> ${extra.to_step_key} "${short(extra.label, 40)}" (in database, not in file)`,
          )
        }
      }
    }
    for (const [key, dbList] of dbChoiceGroups) {
      if (!fileChoiceGroups.has(key)) {
        for (const extra of dbList) {
          console.log(
            `  keep   choice ${extra.from_step_key} -> ${extra.to_step_key} "${short(extra.label, 40)}" (in database, not in file)`,
          )
        }
      }
    }
    for (const u of choiceUpdates) console.log(`  update choice ${u.why}`)
    for (const c of choiceInserts) {
      console.log(`  insert choice ${c.from_step_key} -> ${c.to_step_key} "${short(c.label, 40)}"`)
    }

    const changes = stepUpdates.length + stepInserts.length + choiceUpdates.length + choiceInserts.length
    if (changes === 0) {
      console.log('  no changes')
      continue
    }
    if (dryRun) {
      console.log(`  (dry run) ${changes} change(s) not written`)
      continue
    }

    // ---- write
    const now = new Date().toISOString()
    for (const u of stepUpdates) {
      const { error } = await supabase
        .from('script_flow_steps')
        .update({ ...u.patch, updated_at: now })
        .eq('id', u.id)
      if (error) throw new Error(`update step ${u.id}: ${error.message}`)
      totalUpdated++
    }
    if (stepInserts.length > 0) {
      const { error } = await supabase
        .from('script_flow_steps')
        .insert(stepInserts.map((s) => ({ ...s, niche_id: nicheId, updated_at: now })))
      if (error) throw new Error(`insert steps: ${error.message}`)
      totalInserted += stepInserts.length
    }
    for (const u of choiceUpdates) {
      const { error } = await supabase
        .from('script_flow_choices')
        .update(u.patch)
        .eq('id', u.id)
      if (error) throw new Error(`update choice ${u.id}: ${error.message}`)
      totalUpdated++
    }
    if (choiceInserts.length > 0) {
      const { error } = await supabase
        .from('script_flow_choices')
        .insert(choiceInserts.map((c) => ({ ...c, niche_id: nicheId })))
      if (error) throw new Error(`insert choices: ${error.message}`)
      totalInserted += choiceInserts.length
    }
    console.log(`  applied ${changes} change(s)`)
  }

  console.log(
    `\n${dryRun ? 'Dry run. ' : ''}${totalUpdated} updated, ${totalInserted} inserted, ${totalUnchanged} unchanged.`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
