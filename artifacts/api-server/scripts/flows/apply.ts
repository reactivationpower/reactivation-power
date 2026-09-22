// Apply content/flows/*.json back to Supabase, idempotently.
//   node scripts/flows/apply.ts skin-tightening general   # one or more files
//   node scripts/flows/apply.ts --all                       # every file
//   node scripts/flows/apply.ts --dry-run skin-tightening   # show the diff only
//   node scripts/flows/apply.ts --create-niches fillers     # also insert a missing niche row
//   node scripts/flows/apply.ts --steps recommendation,obj_cost teeth-whitening
//                                                           # push only those steps
//   node scripts/flows/apply.ts --force teeth-whitening     # overwrite conflicting rows anyway
//
// --steps <key,key> (alias --only): write only the listed step_keys, plus the
// choices that leave those steps. Every other row in the file is skipped and
// listed, so a task that edited two screens cannot drag the rest of the file
// (which may be missing wording another task already put on the phones) into
// the database with it. Every listed key must exist in at least one of the
// requested files.
//
// Conflict guard: a step (or choice) whose database text differs from the
// file AND from the committed git HEAD version of the file was changed by
// someone else since this branch was cut. Applying the file would silently
// revert that work, so apply refuses (exit 1, nothing written) and lists the
// rows. Either narrow the push with --steps, adopt the database text into
// the file (flows:export), or pass --force to overwrite knowingly.
//
// --create-niches: when a file's niche name is not in the niches table yet,
// insert it from the file's "niche" block (name, sector, is_active,
// sort_order) instead of refusing. Matching is by name, so re-running never
// duplicates the row; an existing niche row is never modified.
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
// a {{token}} the player cannot fill, or a non-terminal step with no outgoing
// choice (R12 dead end) that is not allow-listed in KNOWN_DEAD_ENDS.
// Allow-listed dead ends are printed as warnings and still applied.
import { pathToFileURL } from 'node:url'
import {
  GENERAL_SLUG,
  fetchAll,
  findDeadEnds,
  getSupabase,
  listSlugs,
  printProblems,
  readFlowFile,
  readHeadFlowFile,
  validateStructure,
  type FlowChoice,
  type FlowFile,
  type FlowStep,
  type Problem,
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

/**
 * Step 1 of apply: everything that must hold before a file is allowed to
 * touch the database. Structural errors (missing routes, unknown tokens) and
 * un-allow-listed dead ends come back as `error`; allow-listed dead ends and
 * stale allow-list entries come back as `warn`.
 */
export function validateForApply(slug: string, file: FlowFile, general: FlowFile): Problem[] {
  const generalKeys = new Set(general.steps.map((s) => s.step_key))
  return [...validateStructure(slug, file, generalKeys), ...findDeadEnds(slug, file, general)]
}

/** Parse `--steps a,b --only c` (repeatable, comma-separated) into a set; null when absent. */
export function parseStepFilter(args: string[]): Set<string> | null {
  const keys = new Set<string>()
  let seen = false
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    let value: string | undefined
    if (a === '--steps' || a === '--only') {
      seen = true
      value = args[i + 1]
      i++
    } else if (a.startsWith('--steps=') || a.startsWith('--only=')) {
      seen = true
      value = a.slice(a.indexOf('=') + 1)
    } else continue
    if (!value || value.startsWith('--')) {
      throw new Error(`${a} needs a comma-separated list of step keys`)
    }
    for (const k of value.split(',')) {
      const key = k.trim()
      if (key) keys.add(key)
    }
  }
  if (!seen) return null
  if (keys.size === 0) throw new Error('--steps was given but no step keys were listed')
  return keys
}

/**
 * Restrict a file to the steps in `only` and the choices that leave them.
 * Returns the narrowed file plus whatever was skipped, for the printout.
 */
export function filterFlowFile(
  file: FlowFile,
  only: Set<string>,
): { file: FlowFile; skippedSteps: string[]; skippedChoices: number } {
  const steps = file.steps.filter((s) => only.has(s.step_key))
  const choices = file.choices.filter((c) => only.has(c.from_step_key))
  return {
    file: { niche: file.niche, steps, choices },
    skippedSteps: file.steps.filter((s) => !only.has(s.step_key)).map((s) => s.step_key),
    skippedChoices: file.choices.length - choices.length,
  }
}

function choiceKey(c: FlowChoice): string {
  return `${c.from_step_key}\u0000${c.to_step_key ?? ''}`
}

function groupChoices<T extends FlowChoice>(list: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const c of list) {
    const g = groups.get(choiceKey(c)) ?? []
    g.push(c)
    groups.set(choiceKey(c), g)
  }
  for (const g of groups.values()) g.sort((a, b) => a.sort_order - b.sort_order)
  return groups
}

function short(s: string, n = 70): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '\u2026' : one
}

export interface Conflict {
  /** `step <key>` or `choice <from> -> <to>` */
  where: string
  /** the fields whose database value matches neither the file nor git HEAD */
  fields: string[]
}

const STEP_FIELDS = ['title', 'content', 'sort_order'] as const
const CHOICE_FIELDS = ['label', 'variant', 'sort_order'] as const

/**
 * Three-way check: for every row the file would update, a field conflicts
 * when the database value differs from the file (so we would write it) AND
 * from the committed HEAD version (so this branch is not the one that
 * changed it). A row the database has but HEAD does not is a conflict too:
 * two branches added it independently. Pass `head = null` when the file is
 * untracked; then every differing row counts as a conflict because there is
 * nothing to prove the database text is ours to overwrite.
 */
export function findConflicts(
  file: FlowFile,
  head: FlowFile | null,
  dbSteps: Map<string, FlowStep>,
  dbChoices: FlowChoice[],
): Conflict[] {
  const out: Conflict[] = []
  const headSteps = new Map((head?.steps ?? []).map((s) => [s.step_key, s]))
  for (const s of file.steps) {
    const db = dbSteps.get(s.step_key)
    if (!db) continue
    const h = headSteps.get(s.step_key)
    const fields = STEP_FIELDS.filter((f) => db[f] !== s[f] && (!h || db[f] !== h[f]))
    if (fields.length > 0) out.push({ where: `step ${s.step_key}`, fields: [...fields] })
  }

  const dbGroups = groupChoices(dbChoices)
  const headGroups = groupChoices(head?.choices ?? [])
  for (const [key, fileList] of groupChoices(file.choices)) {
    const dbList = dbGroups.get(key) ?? []
    const headList = headGroups.get(key) ?? []
    fileList.forEach((c, i) => {
      const db = dbList[i]
      if (!db) return
      const h = headList[i]
      const fields = CHOICE_FIELDS.filter((f) => db[f] !== c[f] && (!h || db[f] !== h[f]))
      if (fields.length > 0) {
        out.push({ where: `choice ${c.from_step_key} -> ${c.to_step_key}`, fields: [...fields] })
      }
    })
  }
  return out
}

interface FilePlan {
  slug: string
  nicheId: string | null
  stepUpdates: Array<{ id: string; patch: Partial<FlowStep>; why: string[] }>
  stepInserts: FlowStep[]
  choiceUpdates: Array<{ id: string; patch: Partial<FlowChoice>; why: string }>
  choiceInserts: FlowChoice[]
  conflicts: Conflict[]
}

function usage(): never {
  console.error(
    'usage: node scripts/flows/apply.ts [--dry-run] [--create-niches] [--force] [--steps key,key] (--all | <slug> ...)',
  )
  process.exit(2)
}

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const all = args.includes('--all')
  const createNiches = args.includes('--create-niches')
  const force = args.includes('--force')
  let only: Set<string> | null
  try {
    only = parseStepFilter(args)
  } catch (err) {
    console.error((err as Error).message)
    usage()
  }
  // positional args, minus the value that followed --steps / --only
  const requested: string[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--steps' || a === '--only') {
      i++
      continue
    }
    if (!a.startsWith('--')) requested.push(a)
  }

  const slugs = all ? listSlugs() : requested
  if (slugs.length === 0) usage()

  // 1. Read + validate every requested file before touching the database.
  //    Validation always runs on the whole file: a --steps subset on its own
  //    would look like a dead end / missing route even when the file is fine.
  const general = readFlowFile(GENERAL_SLUG)
  const fullFiles = new Map<string, FlowFile>()
  const problems: Problem[] = []
  for (const slug of slugs) {
    const file = readFlowFile(slug)
    fullFiles.set(slug, file)
    problems.push(...validateForApply(slug, file, general))
  }
  const errors = problems.filter((p) => p.level === 'error')
  const warnings = problems.filter((p) => p.level === 'warn')
  if (warnings.length > 0) {
    printProblems(warnings)
    console.log('')
  }
  if (errors.length > 0) {
    printProblems(errors)
    console.error(`\nRefusing to apply: ${errors.length} structural / dead-end error(s). Nothing written.`)
    process.exit(1)
  }

  // Narrow to --steps, and make sure every requested key exists somewhere.
  const files = new Map<string, FlowFile>()
  const skipped = new Map<string, { steps: string[]; choices: number }>()
  if (only) {
    const known = new Set<string>()
    for (const [slug, file] of fullFiles) {
      const narrowed = filterFlowFile(file, only)
      files.set(slug, narrowed.file)
      skipped.set(slug, { steps: narrowed.skippedSteps, choices: narrowed.skippedChoices })
      for (const s of file.steps) known.add(s.step_key)
    }
    const unknown = [...only].filter((k) => !known.has(k))
    if (unknown.length > 0) {
      console.error(
        `--steps: ${unknown.join(', ')} not found in ${[...fullFiles.keys()].join(', ')}. ` +
          'Check the step_key spelling; nothing was written.',
      )
      process.exit(1)
    }
    console.log(`Only pushing steps: ${[...only].join(', ')} (and the choices leaving them)`)
  } else {
    for (const [slug, file] of fullFiles) files.set(slug, file)
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

  let totalUnchanged = 0
  const plans: FilePlan[] = []

  // 3. Plan every file (diff against the database, three-way check against
  //    git HEAD). Nothing is written until every plan is clean or --force.
  for (const [slug, file] of files) {
    let nicheId: string | null = null
    if (slug !== GENERAL_SLUG) {
      if (!file.niche) throw new Error(`${slug}.json has no niche block`)
      let id = nicheByName.get(file.niche.name.toLowerCase())
      if (!id && createNiches) {
        const meta = file.niche
        if (dryRun) {
          console.log(
            `\n== ${slug}: (dry run) would create niche "${meta.name}" (${meta.sector}, sort_order ${meta.sort_order}); its steps and choices would all be inserts`,
          )
          continue
        }
        const { data, error } = await supabase
          .from('niches')
          .insert({
            name: meta.name,
            sector: meta.sector,
            is_active: meta.is_active,
            sort_order: meta.sort_order,
          })
          .select('id')
          .single()
        if (error || !data) {
          throw new Error(`create niche "${meta.name}": ${error?.message ?? 'no row returned'}`)
        }
        id = data.id as string
        nicheByName.set(meta.name.toLowerCase(), id)
        console.log(`\n== ${slug}: created niche "${meta.name}" (${id})`)
      }
      if (!id) {
        throw new Error(
          `${slug}.json: niche "${file.niche.name}" does not exist in the niches table. ` +
            'Create the niche in the admin first, or re-run with --create-niches.',
        )
      }
      nicheId = id
    }

    console.log(`\n== ${slug} (${nicheId ? `niche ${nicheId}` : 'general'})`)
    const sk = skipped.get(slug)
    if (sk && (sk.steps.length > 0 || sk.choices > 0)) {
      console.log(
        `  skip   ${sk.steps.length} step(s) and ${sk.choices} choice(s) outside --steps: ${sk.steps.join(', ')}`,
      )
    }

    // ---- steps
    const dbSteps = new Map(
      liveSteps.filter((s) => s.niche_id === nicheId).map((s) => [s.step_key, s]),
    )
    const stepUpdates: FilePlan['stepUpdates'] = []
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
    const orphanSteps = [...dbSteps.keys()].filter(
      (k) => !fileStepKeys.has(k) && !(sk && sk.steps.includes(k)),
    )

    for (const u of stepUpdates) {
      const key = file.steps.find((s) => dbSteps.get(s.step_key)?.id === u.id)?.step_key
      console.log(`  update step   ${key}: ${u.why.join('; ')}`)
    }
    for (const s of stepInserts) console.log(`  insert step   ${s.step_key} "${short(s.title, 40)}"`)
    for (const k of orphanSteps) console.log(`  keep   step   ${k} (in database, not in file)`)

    // ---- choices (paired by from+to, in sort_order, so duplicates line up)
    const nicheChoices = liveChoices.filter((c) => c.niche_id === nicheId)
    const dbChoiceGroups = groupChoices(nicheChoices)
    const fileChoiceGroups = groupChoices(file.choices)

    const choiceUpdates: FilePlan['choiceUpdates'] = []
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
      if (fileChoiceGroups.has(key)) continue
      if (sk && sk.steps.includes(dbList[0].from_step_key)) continue
      for (const extra of dbList) {
        console.log(
          `  keep   choice ${extra.from_step_key} -> ${extra.to_step_key} "${short(extra.label, 40)}" (in database, not in file)`,
        )
      }
    }
    for (const u of choiceUpdates) console.log(`  update choice ${u.why}`)
    for (const c of choiceInserts) {
      console.log(`  insert choice ${c.from_step_key} -> ${c.to_step_key} "${short(c.label, 40)}"`)
    }

    // ---- three-way conflict check against git HEAD
    const conflicts =
      stepUpdates.length + choiceUpdates.length > 0
        ? findConflicts(file, readHeadFlowFile(slug), dbSteps, nicheChoices)
        : []
    for (const c of conflicts) {
      console.log(
        `  CONFLICT ${c.where}: database ${c.fields.join('/')} differs from both this file and git HEAD`,
      )
    }

    const changes = stepUpdates.length + stepInserts.length + choiceUpdates.length + choiceInserts.length
    if (changes === 0) {
      console.log('  no changes')
      continue
    }
    if (dryRun) console.log(`  (dry run) ${changes} change(s) not written`)
    plans.push({ slug, nicheId, stepUpdates, stepInserts, choiceUpdates, choiceInserts, conflicts })
  }

  const conflicted = plans.filter((p) => p.conflicts.length > 0)
  if (conflicted.length > 0) {
    const n = conflicted.reduce((sum, p) => sum + p.conflicts.length, 0)
    const list = conflicted
      .map((p) => `${p.slug}: ${p.conflicts.map((c) => c.where).join(', ')}`)
      .join('\n  ')
    if (force) {
      console.log(
        `\nWARNING: --force overwriting ${n} row(s) someone else changed since this branch was cut:\n  ${list}`,
      )
    } else {
      console.error(
        `\n${dryRun ? 'Would refuse' : 'Refusing'} to apply: ${n} row(s) were changed in the database since this branch was cut ` +
          `(database differs from both the file and git HEAD):\n  ${list}\n` +
          'Push only your own steps with --steps <key,key>, adopt the database text into the file (flows:export), ' +
          'or re-run with --force to overwrite it knowingly.',
      )
      process.exit(1)
    }
  }

  if (dryRun) {
    console.log(`\nDry run. 0 updated, 0 inserted, ${totalUnchanged} unchanged.`)
    return
  }

  // 4. Write.
  let totalUpdated = 0
  let totalInserted = 0
  for (const p of plans) {
    const now = new Date().toISOString()
    for (const u of p.stepUpdates) {
      const { error } = await supabase
        .from('script_flow_steps')
        .update({ ...u.patch, updated_at: now })
        .eq('id', u.id)
      if (error) throw new Error(`update step ${u.id}: ${error.message}`)
      totalUpdated++
    }
    if (p.stepInserts.length > 0) {
      const { error } = await supabase
        .from('script_flow_steps')
        .insert(p.stepInserts.map((s) => ({ ...s, niche_id: p.nicheId, updated_at: now })))
      if (error) throw new Error(`insert steps: ${error.message}`)
      totalInserted += p.stepInserts.length
    }
    for (const u of p.choiceUpdates) {
      const { error } = await supabase
        .from('script_flow_choices')
        .update(u.patch)
        .eq('id', u.id)
      if (error) throw new Error(`update choice ${u.id}: ${error.message}`)
      totalUpdated++
    }
    if (p.choiceInserts.length > 0) {
      const { error } = await supabase
        .from('script_flow_choices')
        .insert(p.choiceInserts.map((c) => ({ ...c, niche_id: p.nicheId })))
      if (error) throw new Error(`insert choices: ${error.message}`)
      totalInserted += p.choiceInserts.length
    }
    const changes =
      p.stepUpdates.length + p.stepInserts.length + p.choiceUpdates.length + p.choiceInserts.length
    console.log(`${p.slug}: applied ${changes} change(s)`)
  }

  console.log(`\n${totalUpdated} updated, ${totalInserted} inserted, ${totalUnchanged} unchanged.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
