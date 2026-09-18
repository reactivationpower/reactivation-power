// Shared helpers for the script-flow content tooling (export / apply / lint).
// Run with plain Node (type stripping): `node scripts/flows/<cmd>.ts`.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const CONTENT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../content/flows',
)
export const GENERAL_SLUG = 'general'

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

export function writeFlowFile(slug: string, file: FlowFile): void {
  mkdirSync(CONTENT_DIR, { recursive: true })
  const sorted: FlowFile = {
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
  writeFileSync(fileFor(slug), JSON.stringify(sorted, null, 2) + '\n')
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
 * Keep in sync with script-viewer.tsx / call-screen.tsx / script-flow-player.tsx.
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
  // Patient / parent-mode tokens (dental & ortho flows)
  'pt_you',
  'pt_you_cap',
  'pt_your',
  'pt_them',
  'pt_they_are',
  'pt_get_you_in',
  'pt_no_fault',
  'pt_proud',
  'pt_bite_q',
  'pt_jaw_q',
  'pt_photos_q',
  'pt_obj_braces_q',
  'pt_obj_startover_q',
  'pt_obj_embarrassed_q',
  'pt_al_photos_q',
  'pt_moved_back_q',
  'pt_your_file',
  'pt_smile_bite',
  'pt_floss_q',
  'pt_clean_q',
  'pt_invested',
  'pt_mir_q1',
  'pt_mir_q2',
  'pt_mir_q3',
  'pt_uncover_action',
  'pt_cost_ask',
  'pt_bridge_q',
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

export function printProblems(problems: Problem[]): void {
  for (const p of problems) {
    console.log(`${p.level === 'error' ? 'ERROR' : 'warn '}  ${p.where}: ${p.message}`)
  }
}
