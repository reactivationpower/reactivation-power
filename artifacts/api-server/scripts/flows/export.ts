// Export the live script flows from Supabase into content/flows/*.json.
//   node scripts/flows/export.ts            # every niche + general
//   node scripts/flows/export.ts skin-tightening general
import {
  GENERAL_SLUG,
  fetchAll,
  getSupabase,
  slugify,
  writeFlowFile,
  type FlowChoice,
  type FlowFile,
  type FlowStep,
} from './lib.ts'

interface NicheRow {
  id: string
  name: string
  sector: 'healthcare' | 'home_services'
  is_active: boolean
  sort_order: number
}
interface StepRow extends FlowStep {
  niche_id: string | null
}
interface ChoiceRow extends FlowChoice {
  niche_id: string | null
}

async function main() {
  const only = new Set(process.argv.slice(2))
  const supabase = getSupabase()
  const [niches, steps, choices] = await Promise.all([
    fetchAll<NicheRow>(supabase, 'niches', 'id,name,sector,is_active,sort_order'),
    fetchAll<StepRow>(
      supabase,
      'script_flow_steps',
      'niche_id,step_key,title,content,sort_order',
    ),
    fetchAll<ChoiceRow>(
      supabase,
      'script_flow_choices',
      'niche_id,from_step_key,label,to_step_key,variant,sort_order',
    ),
  ])

  const strip = <T extends { niche_id: string | null }>(r: T) => {
    const { niche_id: _omit, ...rest } = r
    return rest
  }

  const targets: Array<{ slug: string; nicheId: string | null; meta: FlowFile['niche'] }> = [
    { slug: GENERAL_SLUG, nicheId: null, meta: null },
    ...niches.map((n) => ({
      slug: slugify(n.name),
      nicheId: n.id,
      meta: {
        name: n.name,
        sector: n.sector,
        is_active: n.is_active,
        sort_order: n.sort_order,
      },
    })),
  ]

  let written = 0
  for (const t of targets) {
    if (only.size > 0 && !only.has(t.slug)) continue
    const file: FlowFile = {
      niche: t.meta,
      steps: steps.filter((s) => s.niche_id === t.nicheId).map(strip),
      choices: choices.filter((c) => c.niche_id === t.nicheId).map(strip),
    }
    if (t.nicheId && file.steps.length === 0 && file.choices.length === 0) {
      console.log(`skip   ${t.slug} (no flow rows)`)
      continue
    }
    writeFlowFile(t.slug, file)
    written++
    console.log(
      `wrote  ${t.slug}.json  ${file.steps.length} steps, ${file.choices.length} choices`,
    )
  }
  console.log(`${written} file(s) written`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
