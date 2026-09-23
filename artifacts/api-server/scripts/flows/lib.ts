// Shared helpers for the script-flow content tooling (export / apply / lint).
// Run with plain Node (type stripping): `node scripts/flows/<cmd>.ts`.
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { PT_TOKEN_KEYS } from '@workspace/script-tokens'
import { CAMPAIGN_TOKEN_KEYS } from '@workspace/shared/campaign-tokens'

export const CONTENT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../content/flows',
)
export const GENERAL_SLUG = 'general'

/**
 * Script families. Every niche may carry one flow per family; the two are
 * kept apart in the database by the `flow_kind` column, and in this folder
 * by the file suffix: `chiropractic.json` is the reactivation flow,
 * `chiropractic.lead.json` the lead flow. Each family has its own general
 * file (`general.json` / `general.lead.json`) that niche files inherit from.
 */
export const FLOW_KINDS = ['reactivation', 'lead'] as const
export type FlowKind = (typeof FLOW_KINDS)[number]
export const DEFAULT_FLOW_KIND: FlowKind = 'reactivation'
const LEAD_SUFFIX = '.lead'

/** `chiropractic.lead` -> lead; `chiropractic` -> reactivation. */
export function flowKindOf(slug: string): FlowKind {
  return slug.endsWith(LEAD_SUFFIX) ? 'lead' : 'reactivation'
}

/** `chiropractic.lead` -> `chiropractic` (the niche part of a slug). */
export function baseSlugOf(slug: string): string {
  return slug.endsWith(LEAD_SUFFIX) ? slug.slice(0, -LEAD_SUFFIX.length) : slug
}

export function slugFor(baseSlug: string, kind: FlowKind): string {
  return kind === 'lead' ? `${baseSlug}${LEAD_SUFFIX}` : baseSlug
}

/** The general file a slug inherits from: `general` or `general.lead`. */
export function generalSlugFor(slug: string): string {
  return slugFor(GENERAL_SLUG, flowKindOf(slug))
}

export function isGeneralSlug(slug: string): boolean {
  return baseSlugOf(slug) === GENERAL_SLUG
}

export interface FlowStep {
  step_key: string
  title: string
  content: string
  sort_order: number
}

export interface FlowChoice {
  from_step_key: string
  label: string
  to_step_key: string | null
  variant: 'default' | 'positive' | 'caution' | 'negative' | 'objection'
  sort_order: number
}

export interface FlowNicheMeta {
  name: string
  sector: 'healthcare' | 'home_services'
  is_active: boolean
  sort_order: number
}

/** One content file: a niche's overrides, or the shared general steps. */
export interface FlowFile {
  /** null for the general (niche_id null) file */
  niche: FlowNicheMeta | null
  steps: FlowStep[]
  choices: FlowChoice[]
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function fileFor(slug: string): string {
  return path.join(CONTENT_DIR, `${slug}.json`)
}

export function listSlugs(): string[] {
  mkdirSync(CONTENT_DIR, { recursive: true })
  return readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()
}

export function readFlowFile(slug: string): FlowFile {
  const raw = readFileSync(fileFor(slug), 'utf8')
  const parsed = JSON.parse(raw) as FlowFile
  if (!Array.isArray(parsed.steps) || !Array.isArray(parsed.choices)) {
    throw new Error(`${slug}.json: expected { niche, steps[], choices[] }`)
  }
  return parsed
}

/** The canonical row order a flow file is written in (export) and compared in (check). */
export function normalizeFlowFile(file: FlowFile): FlowFile {
  return {
    niche: file.niche,
    steps: [...file.steps].sort(
      (a, b) => a.sort_order - b.sort_order || a.step_key.localeCompare(b.step_key),
    ),
    choices: [...file.choices].sort(
      (a, b) =>
        a.from_step_key.localeCompare(b.from_step_key) ||
        a.sort_order - b.sort_order ||
        a.label.localeCompare(b.label),
    ),
  }
}

export function writeFlowFile(slug: string, file: FlowFile): void {
  mkdirSync(CONTENT_DIR, { recursive: true })
  writeFileSync(fileFor(slug), JSON.stringify(normalizeFlowFile(file), null, 2) + '\n')
}

/**
 * The committed (git HEAD) version of a flow file, or null when the file is
 * not tracked yet (a brand-new niche) or the checkout has no git history.
 * `flows:apply` uses it to tell "this branch changed the step" apart from
 * "someone else changed the step in the database since this branch was cut".
 */
export function readHeadFlowFile(slug: string): FlowFile | null {
  const abs = fileFor(slug)
  let root: string
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: path.dirname(abs),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
  const rel = path.relative(root, abs).split(path.sep).join('/')
  let raw: string
  try {
    raw = execFileSync('git', ['show', `HEAD:${rel}`], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch {
    return null
  }
  const parsed = JSON.parse(raw) as FlowFile
  if (!Array.isArray(parsed.steps) || !Array.isArray(parsed.choices)) return null
  return parsed
}

/**
 * Every flow the database currently holds, keyed by file slug, in the exact
 * shape `flows:export` writes. Niches with no rows of their own are omitted
 * (the player falls through to general for them), matching export's skip.
 */
export async function loadLiveFlows(supabase: SupabaseClient): Promise<Map<string, FlowFile>> {
  interface NicheRow {
    id: string
    name: string
    sector: FlowNicheMeta['sector']
    is_active: boolean
    sort_order: number
  }
  type StepRow = FlowStep & { niche_id: string | null; flow_kind: FlowKind }
  type ChoiceRow = FlowChoice & { niche_id: string | null; flow_kind: FlowKind }

  const [niches, steps, choices] = await Promise.all([
    fetchAll<NicheRow>(supabase, 'niches', 'id,name,sector,is_active,sort_order'),
    fetchAll<StepRow>(
      supabase,
      'script_flow_steps',
      'niche_id,flow_kind,step_key,title,content,sort_order',
    ),
    fetchAll<ChoiceRow>(
      supabase,
      'script_flow_choices',
      'niche_id,flow_kind,from_step_key,label,to_step_key,variant,sort_order',
    ),
  ])

  const strip = <T extends { niche_id: string | null; flow_kind: FlowKind }>(r: T) => {
    const { niche_id: _omit, flow_kind: _kind, ...rest } = r
    return rest
  }

  const bases: Array<{ slug: string; nicheId: string | null; meta: FlowFile['niche'] }> = [
    { slug: GENERAL_SLUG, nicheId: null, meta: null },
    ...niches.map((n) => ({
      slug: slugify(n.name),
      nicheId: n.id,
      meta: { name: n.name, sector: n.sector, is_active: n.is_active, sort_order: n.sort_order },
    })),
  ]

  const out = new Map<string, FlowFile>()
  for (const kind of FLOW_KINDS) {
    for (const t of bases) {
      const file: FlowFile = {
        niche: t.meta,
        steps: steps.filter((s) => s.niche_id === t.nicheId && s.flow_kind === kind).map(strip),
        choices: choices
          .filter((c) => c.niche_id === t.nicheId && c.flow_kind === kind)
          .map(strip),
      }
      // Reactivation general always exists; every other (niche, kind) pair
      // only when it has rows, so an empty lead family never exports files.
      const isReactivationGeneral = kind === DEFAULT_FLOW_KIND && t.nicheId === null
      if (!isReactivationGeneral && file.steps.length === 0 && file.choices.length === 0) continue
      out.set(slugFor(t.slug, kind), normalizeFlowFile(file))
    }
  }
  return out
}

/** One way the live database and a checked-in flow file disagree. */
export interface FlowDrift {
  slug: string
  /** `text` fails the check; `meta` is a niche-row attribute (is_active, sector, sort_order) that only export would rewrite */
  kind: 'text' | 'meta'
  message: string
}

function shortText(s: string, n = 60): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '\u2026' : one
}

/**
 * Compare a checked-in flow file with what the database holds for the same
 * slug, using apply's matching rules (steps by step_key; choices by
 * from+to, paired in sort_order). Either side may be missing: a file with
 * no live rows, or live rows with no file. Returns an empty list when the
 * two are identical, i.e. when `flows:export` would be a no-op and
 * `flows:apply` would find nothing to write.
 */
export function diffFlowFile(
  slug: string,
  inRepo: FlowFile | null,
  inDatabase: FlowFile | null,
): FlowDrift[] {
  const out: FlowDrift[] = []
  const text = (message: string) => out.push({ slug, kind: 'text', message })
  const meta = (message: string) => out.push({ slug, kind: 'meta', message })

  if (!inRepo && !inDatabase) return out
  if (!inRepo) {
    text(
      `database has ${inDatabase!.steps.length} step(s) and ${inDatabase!.choices.length} choice(s) but content/flows/${slug}.json does not exist (run flows:export ${slug})`,
    )
    return out
  }
  if (!inDatabase) {
    text(
      `content/flows/${slug}.json exists but the database has no rows for it (run flows:apply ${slug}, or delete the file)`,
    )
    return out
  }

  if (inRepo.niche && inDatabase.niche) {
    for (const k of ['sector', 'is_active', 'sort_order'] as const) {
      if (inRepo.niche[k] !== inDatabase.niche[k]) {
        meta(`niche ${k}: file ${String(inRepo.niche[k])}, database ${String(inDatabase.niche[k])}`)
      }
    }
  }

  const dbSteps = new Map(inDatabase.steps.map((s) => [s.step_key, s]))
  const fileSteps = new Map(inRepo.steps.map((s) => [s.step_key, s]))
  for (const [key, f] of fileSteps) {
    const d = dbSteps.get(key)
    if (!d) {
      text(`step ${key}: in file, not in database`)
      continue
    }
    if (d.title !== f.title) {
      text(`step ${key}: title differs (file "${shortText(f.title, 40)}", database "${shortText(d.title, 40)}")`)
    }
    if (d.content !== f.content) {
      text(`step ${key}: content differs (file ${f.content.length} chars, database ${d.content.length} chars)`)
    }
    if (d.sort_order !== f.sort_order) {
      text(`step ${key}: sort_order differs (file ${f.sort_order}, database ${d.sort_order})`)
    }
  }
  for (const key of dbSteps.keys()) {
    if (!fileSteps.has(key)) text(`step ${key}: in database, not in file`)
  }

  const choiceKey = (c: FlowChoice) => `${c.from_step_key}\u0000${c.to_step_key ?? ''}`
  const group = (list: FlowChoice[]) => {
    const groups = new Map<string, FlowChoice[]>()
    for (const c of list) {
      const g = groups.get(choiceKey(c)) ?? []
      g.push(c)
      groups.set(choiceKey(c), g)
    }
    for (const g of groups.values()) g.sort((a, b) => a.sort_order - b.sort_order)
    return groups
  }
  const dbChoices = group(inDatabase.choices)
  const fileChoices = group(inRepo.choices)
  const route = (c: FlowChoice) => `choice ${c.from_step_key} -> ${c.to_step_key ?? '(none)'}`
  for (const [key, fList] of fileChoices) {
    const dList = dbChoices.get(key) ?? []
    fList.forEach((f, i) => {
      const d = dList[i]
      if (!d) {
        text(`${route(f)} "${shortText(f.label, 40)}": in file, not in database`)
        return
      }
      if (d.label !== f.label) {
        text(`${route(f)}: label differs (file "${shortText(f.label, 40)}", database "${shortText(d.label, 40)}")`)
      }
      if (d.variant !== f.variant) {
        text(`${route(f)}: variant differs (file ${f.variant}, database ${d.variant})`)
      }
      if (d.sort_order !== f.sort_order) {
        text(`${route(f)}: sort_order differs (file ${f.sort_order}, database ${d.sort_order})`)
      }
    })
    for (const extra of dList.slice(fList.length)) {
      text(`${route(extra)} "${shortText(extra.label, 40)}": in database, not in file`)
    }
  }
  for (const [key, dList] of dbChoices) {
    if (fileChoices.has(key)) continue
    for (const extra of dList) {
      text(`${route(extra)} "${shortText(extra.label, 40)}": in database, not in file`)
    }
  }
  return out
}

export function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** PostgREST caps responses at 1000 rows; page through everything. */
export async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  select = '*',
): Promise<T[]> {
  const out: T[] = []
  const page = 1000
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('id')
      .range(from, from + page - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < page) break
  }
  return out
}

/**
 * Tokens the script player can fill. Anything else renders as a raw
 * [BRACKETED PLACEHOLDER] on the call screen, so apply refuses it.
 * Keep the non-pt_ entries in sync with script-viewer.tsx / call-screen.tsx / script-flow-player.tsx.
 */
export const KNOWN_TOKENS = new Set([
  'contact_first_name',
  'contact_full_name',
  'caller_name',
  'your_name',
  'practice_name',
  'provider_name',
  'complaint_reference',
  'main_concern',
  'asked_by_provider',
  // Legacy role pronouns: still substituted by the player, but banned by the
  // style guide (lint flags them). Allowed here so un-rewritten niches apply.
  'rec_pronoun',
  'rec_pronoun_cap',
  'rec_obj',
  'rec_poss',
  // Patient / parent-mode tokens (dental & ortho flows) come from the
  // shared tables the player substitutes, so a slot neither table defines
  // can never be applied.
  ...PT_TOKEN_KEYS,
  // Campaign tokens (lead flows): filled from the campaign the lead answered.
  // Keep in sync with lib/shared/src/campaign-tokens.ts (CAMPAIGN_TOKEN_KEYS).
  ...CAMPAIGN_TOKEN_KEYS,
])

export function tokensIn(text: string): string[] {
  const found: string[] = []
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (!found.includes(m[1])) found.push(m[1])
  }
  return found
}

export interface Problem {
  level: 'error' | 'warn'
  where: string
  message: string
}

/**
 * Structural validation shared by apply and lint: unique step keys, every
 * choice routes to a step that exists (in the niche or in general), and
 * every token is one the player can fill.
 */
export function validateStructure(
  slug: string,
  file: FlowFile,
  generalStepKeys: Set<string>,
): Problem[] {
  const problems: Problem[] = []
  const keys = new Set<string>()
  for (const s of file.steps) {
    if (keys.has(s.step_key)) {
      problems.push({
        level: 'error',
        where: `${slug}:${s.step_key}`,
        message: 'duplicate step_key',
      })
    }
    keys.add(s.step_key)
    if (!s.title?.trim() || !s.content?.trim()) {
      problems.push({
        level: 'error',
        where: `${slug}:${s.step_key}`,
        message: 'empty title or content',
      })
    }
    for (const t of tokensIn(`${s.title}\n${s.content}`)) {
      if (!KNOWN_TOKENS.has(t)) {
        problems.push({
          level: 'error',
          where: `${slug}:${s.step_key}`,
          message: `unknown token {{${t}}} (player would show a raw placeholder)`,
        })
      }
    }
  }
  const known = (k: string) => keys.has(k) || generalStepKeys.has(k)
  for (const c of file.choices) {
    if (!known(c.from_step_key)) {
      problems.push({
        level: 'error',
        where: `${slug}:${c.from_step_key} → "${c.label}"`,
        message: 'choice hangs off a step_key that does not exist',
      })
    }
    if (c.to_step_key && !known(c.to_step_key)) {
      problems.push({
        level: 'error',
        where: `${slug}:${c.from_step_key} → "${c.label}"`,
        message: `routes to missing step_key "${c.to_step_key}"`,
      })
    }
    if (!c.label?.trim()) {
      problems.push({
        level: 'error',
        where: `${slug}:${c.from_step_key}`,
        message: 'choice with empty label',
      })
    }
    for (const t of tokensIn(c.label)) {
      if (!KNOWN_TOKENS.has(t)) {
        problems.push({
          level: 'error',
          where: `${slug}:${c.from_step_key} → "${c.label}"`,
          message: `unknown token {{${t}}} in button label`,
        })
      }
    }
  }
  return problems
}

/**
 * Step keys that are meant to end the script. The player shows "End of
 * script" under them and the caller logs the call with the buttons below the
 * script, so no outgoing choice is expected.
 */
export const TERMINAL_STEP_PATTERNS: RegExp[] = [
  /^scheduling$/, // booked; notes + "Scheduled" button live below the script
  /^close_/, // home services: close_appt / close_callback / close_no
  /^booked_wrap$/, // weight-loss niches: confirm and hang up
  /_bonus$/, // "one more thing" add-on question after booking
  /^(voicemail|wrong_number|dnc)$/,
  /^(end|wrap_up|wrapup)(_|$)/,
]

export function isTerminalStep(stepKey: string): boolean {
  return TERMINAL_STEP_PATTERNS.some((re) => re.test(stepKey))
}

/**
 * Screens the caller lands on without pressing a button: the player starts
 * on `open` (lowest sort_order) and the call screen's outcome buttons jump
 * straight to voicemail / wrong number / do-not-call. Everything else must
 * be the target of some choice (R15).
 */
export const ENTRY_STEP_PATTERNS: RegExp[] = [
  /^open$/,
  /^(voicemail|wrong_number|dnc)$/,
]

/**
 * Screens the player swaps in by step_key instead of by a choice. Keep in
 * sync with script-flow-player.tsx.
 */
export const PLAYER_ROUTED_STEP_PATTERNS: RegExp[] = [
  /^making_it_real_nw$/, // shown in place of making_it_real for a non-weight concern
]

export function isEntryStep(stepKey: string): boolean {
  return ENTRY_STEP_PATTERNS.some((re) => re.test(stepKey))
}

function isPlayerRoutedStep(stepKey: string): boolean {
  return PLAYER_ROUTED_STEP_PATTERNS.some((re) => re.test(stepKey))
}

/**
 * R15: every step that is not an entry screen must be the target of at
 * least one choice, in its own file or in general.json (a niche step with
 * the same key as a general step is reached through general's buttons).
 * Otherwise it is a typo in a to_step_key or dead content nobody will ever
 * see. Reported as a warning.
 *
 * For general.json the check also counts choices from every niche file
 * passed in `referrers`, since a shared step may only be reached from a
 * niche's own buttons.
 */
export function findUnreachableSteps(
  slug: string,
  file: FlowFile,
  general: FlowFile,
  referrers: FlowFile[] = [],
): Problem[] {
  const targets = new Set<string>()
  const addTargets = (f: FlowFile) => {
    for (const c of f.choices) if (c.to_step_key) targets.add(c.to_step_key)
  }
  addTargets(file)
  if (!isGeneralSlug(slug)) addTargets(general)
  for (const f of referrers) addTargets(f)

  const problems: Problem[] = []
  for (const s of file.steps) {
    if (targets.has(s.step_key) || isEntryStep(s.step_key) || isPlayerRoutedStep(s.step_key)) continue
    problems.push({
      level: 'warn',
      where: `${slug}:${s.step_key}`,
      message:
        'R15 unreachable: no choice in this file or general.json routes here and it is not an entry screen (fix the to_step_key typo, or delete the step)',
    })
  }
  return problems
}

/**
 * Screens that are known to strand the caller (no outgoing choice) and are
 * deliberately left that way until a routing decision is made. Lint reports
 * them as warnings instead of errors. Remove an entry once the screen gets
 * its buttons; lint warns when an entry is stale.
 */
export const KNOWN_DEAD_ENDS: Record<string, string[]> = {}

/**
 * R12: every non-terminal step must have at least one outgoing choice, in
 * its own file or in general.json (a niche with no choices for a step falls
 * through to general's set). Otherwise the player shows "End of script"
 * mid-call. Known, tracked dead ends downgrade to warnings.
 */
export function findDeadEnds(
  slug: string,
  file: FlowFile,
  general: FlowFile,
  allowList: Record<string, string[]> = KNOWN_DEAD_ENDS,
): Problem[] {
  const problems: Problem[] = []
  const hasChoices = new Set<string>()
  for (const c of file.choices) hasChoices.add(c.from_step_key)
  if (!isGeneralSlug(slug)) {
    for (const c of general.choices) hasChoices.add(c.from_step_key)
  }
  const allowed = new Set(allowList[slug] ?? [])
  const stepKeys = new Set(file.steps.map((s) => s.step_key))

  for (const s of file.steps) {
    if (hasChoices.has(s.step_key) || isTerminalStep(s.step_key)) continue
    const where = `${slug}:${s.step_key}`
    if (allowed.has(s.step_key)) {
      problems.push({
        level: 'warn',
        where,
        message: 'R12 known dead end: no outgoing choice, player shows "End of script" (allow-listed in KNOWN_DEAD_ENDS)',
      })
    } else {
      problems.push({
        level: 'error',
        where,
        message: 'R12 dead end: no outgoing choice in this file or general.json, player shows "End of script" mid-call (add choices, or list it in KNOWN_DEAD_ENDS if intentional)',
      })
    }
  }
  for (const key of allowed) {
    if (!stepKeys.has(key)) {
      problems.push({
        level: 'warn',
        where: `${slug}:${key}`,
        message: 'R12 stale KNOWN_DEAD_ENDS entry: step does not exist in this file',
      })
    } else if (hasChoices.has(key)) {
      problems.push({
        level: 'warn',
        where: `${slug}:${key}`,
        message: 'R12 stale KNOWN_DEAD_ENDS entry: step now has outgoing choices, remove it from the list',
      })
    }
  }
  return problems
}

export function printProblems(problems: Problem[]): void {
  for (const p of problems) {
    console.log(`${p.level === 'error' ? 'ERROR' : 'warn '}  ${p.where}: ${p.message}`)
  }
}

/**
 * The two buttons every objection screen ends on. The first sends the caller
 * back to scheduling once the concern is handled; the second re-opens the
 * concern picker. They are copied into every niche file rather than shared,
 * so R19 pins the label, target, variant and sort_order of both, in every
 * file, to this one definition. Change the wording here and in the JSON
 * together; a rename that lands in only one niche fails lint.
 */
export const OBJECTION_EXIT_CHOICES: ReadonlyArray<Omit<FlowChoice, 'from_step_key'>> = [
  { sort_order: 0, label: 'Resolved: back to scheduling', to_step_key: 'scheduling', variant: 'positive' },
  { sort_order: 1, label: 'Another concern came up', to_step_key: 'uncover', variant: 'objection' },
]

/**
 * Where an objection screen may route besides the standard pair: straight
 * into another objection (hvac/plumbing "I'll think about it" → cost or
 * spouse) or to a home-services close screen ("Genuinely can't now: set a
 * callback"). Anything else is a mistyped target or a third scheduling button.
 */
export const OBJECTION_EXTRA_ROUTE_PATTERNS: RegExp[] = [/^obj_/, /^close_/]

function describeChoice(c: Omit<FlowChoice, 'from_step_key'>): string {
  return `[${c.sort_order}] "${c.label}" → ${c.to_step_key} (${c.variant})`
}

/**
 * R19: every obj_* step's outgoing buttons start with OBJECTION_EXIT_CHOICES
 * exactly (same labels, targets, variants, sort_order 0 and 1). Any further
 * button must sit at sort_order 2+ and route to another objection screen or
 * a close screen, never to scheduling or uncover again.
 *
 * A niche obj_* step with no choices of its own falls through to general's
 * buttons for that key in the player, so those are the ones checked; a niche
 * that overrides the buttons of a general obj_* step it does not carry is
 * checked on that override.
 */
export function findObjectionExitDrift(slug: string, file: FlowFile, general: FlowFile): Problem[] {
  const problems: Problem[] = []
  const own = new Map<string, FlowChoice[]>()
  for (const c of file.choices) {
    if (!own.has(c.from_step_key)) own.set(c.from_step_key, [])
    own.get(c.from_step_key)!.push(c)
  }
  const inherited = new Map<string, FlowChoice[]>()
  if (!isGeneralSlug(slug)) {
    for (const c of general.choices) {
      if (!inherited.has(c.from_step_key)) inherited.set(c.from_step_key, [])
      inherited.get(c.from_step_key)!.push(c)
    }
  }

  // Every objection screen this file puts in front of the caller: its own
  // obj_* steps, plus any general obj_* step whose buttons it overrides
  // without carrying the step itself (validateStructure allows that).
  const screens = new Set<string>()
  for (const s of file.steps) if (s.step_key.startsWith('obj_')) screens.add(s.step_key)
  for (const key of own.keys()) if (key.startsWith('obj_')) screens.add(key)

  for (const key of [...screens].sort()) {
    const where = `${slug}:${key}`
    const push = (message: string) => problems.push({ level: 'error', where, message })
    const choices = [...(own.get(key) ?? inherited.get(key) ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    if (choices.length === 0) continue // R12 already reports the dead end

    OBJECTION_EXIT_CHOICES.forEach((want, i) => {
      const got = choices[i]
      if (!got) {
        push(`R19 missing objection button ${describeChoice(want)}`)
        return
      }
      const diffs: string[] = []
      if (got.sort_order !== want.sort_order) diffs.push(`sort_order ${got.sort_order} (want ${want.sort_order})`)
      if (got.label !== want.label) diffs.push(`label "${got.label}" (want "${want.label}")`)
      if (got.to_step_key !== want.to_step_key) diffs.push(`target ${got.to_step_key} (want ${want.to_step_key})`)
      if (got.variant !== want.variant) diffs.push(`variant ${got.variant} (want ${want.variant})`)
      if (diffs.length > 0) {
        push(`R19 objection button ${i + 1} differs from the shared pair: ${diffs.join(', ')}; expected ${describeChoice(want)}`)
      }
    })

    for (const extra of choices.slice(OBJECTION_EXIT_CHOICES.length)) {
      const target = extra.to_step_key ?? ''
      const standardTargets = OBJECTION_EXIT_CHOICES.map((c) => c.to_step_key)
      if (standardTargets.includes(target)) {
        push(`R19 duplicate route ${describeChoice(extra)}: the shared pair already covers ${target}`)
      } else if (!OBJECTION_EXTRA_ROUTE_PATTERNS.some((re) => re.test(target))) {
        push(`R19 extra objection button ${describeChoice(extra)} routes somewhere other than another obj_* or close_* screen`)
      }
      if (extra.sort_order < OBJECTION_EXIT_CHOICES.length) {
        push(`R19 extra objection button ${describeChoice(extra)} must sort after the shared pair (sort_order 2+)`)
      }
    }
  }
  return problems
}
