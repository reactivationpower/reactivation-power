// Check that the live script flows in Supabase still match content/flows/*.json.
//   node scripts/flows/check.ts                      # every file + every live niche
//   node scripts/flows/check.ts skin-tightening general
//   node scripts/flows/check.ts --quiet              # one line per drifted flow
//
// Callers read scripts from the database, but only the JSON files are linted
// (flows:lint runs as the `flows-lint` validation step). A flow edited in the
// database (admin UI, SQL) or a file that was linted but never applied means
// the phones run text the lint never saw. This is the same comparison
// `flows:export` followed by `git diff content/flows` would show, without
// touching the working tree, and it fails the other way too: a file with rows
// the database does not have yet.
//
// Exit code 1 when any flow's steps or choices differ, or when a slug exists
// on only one side. Niche-row attributes (is_active, sector, sort_order) are
// printed as notes and never fail the check: the owner toggles those from the
// admin UI and they are not script text.
import { pathToFileURL } from 'node:url'
import {
  diffFlowFile,
  getSupabase,
  listSlugs,
  loadLiveFlows,
  normalizeFlowFile,
  readFlowFile,
  type FlowDrift,
  type FlowFile,
} from './lib.ts'

/** Pure core of the check, so a test can feed it fixtures. */
export function checkFlows(
  inRepo: Map<string, FlowFile>,
  inDatabase: Map<string, FlowFile>,
  only: Set<string> = new Set(),
): FlowDrift[] {
  const slugs = [...new Set([...inRepo.keys(), ...inDatabase.keys()])]
    .filter((s) => only.size === 0 || only.has(s))
    .sort()
  return slugs.flatMap((slug) =>
    diffFlowFile(slug, inRepo.get(slug) ?? null, inDatabase.get(slug) ?? null),
  )
}

async function main() {
  const args = process.argv.slice(2)
  const quiet = args.includes('--quiet')
  const only = new Set(args.filter((a) => !a.startsWith('--')))

  const inRepo = new Map(listSlugs().map((slug) => [slug, normalizeFlowFile(readFlowFile(slug))]))
  const inDatabase = await loadLiveFlows(getSupabase())
  for (const slug of only) {
    if (!inRepo.has(slug) && !inDatabase.has(slug)) {
      console.error(`unknown flow "${slug}": no content/flows/${slug}.json and no live niche with that slug`)
      process.exit(2)
    }
  }

  const drift = checkFlows(inRepo, inDatabase, only)
  const bySlug = new Map<string, FlowDrift[]>()
  for (const d of drift) bySlug.set(d.slug, [...(bySlug.get(d.slug) ?? []), d])

  const checked = [...new Set([...inRepo.keys(), ...inDatabase.keys()])].filter(
    (s) => only.size === 0 || only.has(s),
  )
  const failing = new Set(drift.filter((d) => d.kind === 'text').map((d) => d.slug))

  for (const [slug, list] of [...bySlug].sort(([a], [b]) => a.localeCompare(b))) {
    const textCount = list.filter((d) => d.kind === 'text').length
    const noteCount = list.length - textCount
    const summary = [
      textCount > 0 ? `${textCount} difference(s)` : null,
      noteCount > 0 ? `${noteCount} niche note(s)` : null,
    ]
      .filter(Boolean)
      .join(', ')
    console.log(`${failing.has(slug) ? 'DRIFT ' : 'note  '}${slug}: ${summary}`)
    if (quiet) continue
    for (const d of list) console.log(`  ${d.kind === 'text' ? '-' : '(note)'} ${d.message}`)
  }

  if (failing.size > 0) {
    console.log(
      `\n${failing.size} of ${checked.length} flow(s) differ between content/flows and the database.`,
    )
    console.log(
      'If the file is right: flows:lint then flows:apply <slug>. If the database is right: flows:export <slug>, flows:lint, and commit the file.',
    )
    process.exit(1)
  }
  console.log(`${checked.length} flow(s) match the database.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
