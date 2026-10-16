// Export the live script flows from Supabase into content/flows/*.json.
//   node scripts/flows/export.ts            # every niche + general
//   node scripts/flows/export.ts skin-tightening general
import { getSupabase, loadLiveFlows, writeFlowFile } from './lib.ts'

async function main() {
  const only = new Set(process.argv.slice(2))
  const live = await loadLiveFlows(getSupabase())

  let written = 0
  for (const [slug, file] of live) {
    if (only.size > 0 && !only.has(slug)) continue
    writeFlowFile(slug, file)
    written++
    console.log(
      `wrote  ${slug}.json  ${file.steps.length} steps, ${file.choices.length} choices`,
    )
  }
  for (const slug of only) {
    if (!live.has(slug)) console.log(`skip   ${slug} (no flow rows)`)
  }
  console.log(`${written} file(s) written`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
