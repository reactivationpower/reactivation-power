import type { Niche } from '@/lib/types'

/**
 * Keyword -> niche name matcher for service/appointment types found in a
 * practice's CSV export (e.g. "Botox 50u", "60-min Deep Tissue",
 * "Spinal Decompression Session 8").
 *
 * Order matters: more specific niches are checked before broader ones so
 * "ChiroThin" wins over "Chiropractic" and "Laser Hair Removal" wins over
 * generic "laser".
 */
const KEYWORD_RULES: Array<{ niche: string; keywords: string[] }> = [
  { niche: 'ChiroThin', keywords: ['chirothin', 'chiro thin', 'chiro-thin'] },
  {
    niche: 'GLP Patients',
    keywords: [
      'glp',
      'semaglutide',
      'tirzepatide',
      'ozempic',
      'wegovy',
      'mounjaro',
      'zepbound',
      'weight loss injection',
      'weight-loss injection',
    ],
  },
  {
    // Generic in-office weight-loss program — NOT ChiroThin, NOT GLP.
    // Listed after GLP so injection/medication labels resolve to GLP first,
    // and ChiroThin's own rule (above) still wins for "chirothin".
    niche: 'Weight Loss (Not ChiroThin)',
    keywords: [
      'weight loss',
      'weight-loss',
      'weightloss',
      'weight management',
      'weight program',
      'medical weight',
      'fat loss',
      'slim',
    ],
  },
  {
    niche: 'Decompression',
    keywords: ['decompression', 'decomp', 'dts', 'traction', 'disc therapy'],
  },
  {
    niche: 'Neuropathy',
    keywords: ['neuropathy', 'nerve pain', 'peripheral nerve', 'numbness'],
  },
  {
    niche: 'Laser Hair Removal',
    keywords: ['laser hair', 'hair removal', 'lhr'],
  },
  {
    niche: 'Body Waxing',
    keywords: ['wax', 'brazilian', 'bikini', 'brow shaping'],
  },
  {
    niche: 'Skin Tightening',
    keywords: [
      'skin tightening',
      'tightening',
      'ultherapy',
      'thermage',
      'rf skin',
      'radiofrequency',
      'microneedling',
      'morpheus',
    ],
  },
  {
    niche: 'Cellulite Reduction',
    keywords: ['cellulite'],
  },
  {
    niche: 'Red Light / Body Contouring',
    keywords: [
      'red light',
      'redlight',
      'body contour',
      'contouring',
      'sculpt',
      'coolsculpt',
      'cryoskin',
      'lipo laser',
      'lipo-laser',
      'laser lipo',
      'emsculpt',
      'body sculpting',
      'fat reduction',
      'inch loss',
    ],
  },
  {
    niche: 'Botox',
    keywords: [
      'botox',
      'dysport',
      'xeomin',
      'jeuveau',
      'daxxify',
      'neurotoxin',
      'wrinkle relaxer',
    ],
  },
  {
    niche: 'Teeth Whitening',
    keywords: ['whitening', 'zoom whitening', 'bleaching'],
  },
  {
    niche: 'Clear Aligners',
    keywords: [
      'invisalign',
      'clear aligner',
      'aligner',
      'clearcorrect',
      'clear correct',
      'spark aligner',
    ],
  },
  {
    niche: 'Orthodontics / Braces',
    keywords: ['braces', 'orthodont', 'bracket', 'ortho consult', 'ortho eval'],
  },
  {
    niche: 'Dental Implants',
    keywords: [
      'implant',
      'all-on-4',
      'all on 4',
      'denture',
      'missing tooth',
      'missing teeth',
      'dental',
      'crown',
      'extraction',
      'root canal',
    ],
  },
  {
    niche: 'Acoustic Wave Therapy',
    keywords: [
      'acoustic wave',
      'acoustic',
      // Popular device/brand names offices use instead of the niche name
      'shockwave',
      'shock wave',
      'softwave',
      'soft wave',
      'soundwave',
      'sound wave',
      'gainswave',
      'pulse wave',
      'swt',
    ],
  },
  {
    niche: 'Acupuncture',
    keywords: ['acupuncture', 'dry needling', 'cupping', 'needling'],
  },
  {
    niche: 'Massage Therapy',
    keywords: [
      'massage',
      'deep tissue',
      'swedish',
      'hot stone',
      'prenatal massage',
      'sports massage',
      'myofascial',
      'reflexology',
    ],
  },
  {
    niche: 'Gut Health',
    keywords: [
      'gut',
      'digest',
      'ibs',
      'food sensitivity',
      'probiotic',
      'microbiome',
      'detox',
    ],
  },
  {
    niche: 'Joint Pain',
    keywords: [
      'joint',
      'knee pain',
      'knee injection',
      'shoulder pain',
      'hip pain',
      'arthritis',
      'trigger point',
      'prp joint',
    ],
  },
  {
    niche: 'Chiropractic',
    keywords: [
      'chiro',
      'adjustment',
      'spinal',
      'manipulation',
      'subluxation',
      'back pain',
      'neck pain',
      'low back',
      'x-ray',
      'exam & adjust',
    ],
  },
  // ---------- Home Services ----------
  {
    niche: 'HVAC',
    keywords: [
      'hvac',
      'furnace',
      'air condition',
      'a/c',
      'ac repair',
      'ac tune',
      'heat pump',
      'heating',
      'cooling',
      'tune-up',
      'tune up',
      'duct',
      'thermostat',
      'refrigerant',
      'condenser',
      'mini split',
      'mini-split',
    ],
  },
  {
    niche: 'Plumbing',
    keywords: [
      'plumb',
      'drain',
      'water heater',
      'tankless',
      'sewer',
      'faucet',
      'toilet',
      'repipe',
      're-pipe',
      'clog',
      'garbage disposal',
      'sump pump',
      'backflow',
      'water softener',
      'pipe leak',
    ],
  },
]

/** Normalize a raw service label for matching and storage keys */
export function normalizeServiceLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Normalize a label for keyword matching by flattening ALL punctuation to
 * single spaces. Practices write the same service a dozen ways —
 * "Red-Light", "Red Light", "Red/Light", "RED_LIGHT" — and every one of
 * those must land on the same niche.
 */
function matchKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Does `text` contain `keyword`?
 *
 * Keywords are normalized the same way as the text, so a keyword written
 * with punctuation ("a/c", "all-on-4", "x-ray") still matches. Very short
 * keywords and those containing a single-letter word ("dts", "glp", "a c")
 * require whole-word matches so they can't fire inside an unrelated word —
 * longer keywords stay substring-based so "chiro" still finds
 * "chiropractic".
 */
function keywordMatches(text: string, keyword: string): boolean {
  const kw = matchKey(keyword)
  if (!kw) return false

  const needsWholeWord = kw.length <= 3 || /(^| )[a-z0-9]( |$)/.test(kw)
  if (!needsWholeWord) return text.includes(kw)

  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^| )${escaped}( |$)`).test(text)
}

/**
 * Loose comparison key for niche names typed by hand into a CSV, so
 * "Red Light / Body Contouring", "red light body contouring" and
 * "Red Light/Body Contouring" all collapse to the same thing.
 */
function nicheKey(raw: string): string {
  return matchKey(raw)
}

/**
 * Resolve a value from an explicit "Niche" column on the import file.
 *
 * Tries an exact niche-name match first (punctuation and case are
 * ignored), then falls back to the same keyword rules used for service
 * labels — so "Ortho", "Invisalign" or "shockwave" still land on the
 * right niche. Returns null when nothing matches, which lets the caller
 * fall back to the service column or the account default.
 */
export function matchNicheByName(
  value: string,
  niches: Niche[],
): Niche | null {
  const key = nicheKey(value)
  if (!key) return null
  for (const niche of niches) {
    if (nicheKey(niche.name) === key) return niche
  }
  return suggestNicheForService(value, niches)
}

/**
 * Suggest a niche for a raw service/appointment-type string.
 * Returns the matched Niche or null when nothing matches confidently.
 */
export function suggestNicheForService(
  service: string,
  niches: Niche[],
): Niche | null {
  const text = matchKey(service)
  if (!text) return null

  const byName = new Map(niches.map((n) => [matchKey(n.name), n]))

  // Exact niche-name match first (e.g. a column literally says "Chiropractic")
  const exact = byName.get(text)
  if (exact) return exact

  for (const rule of KEYWORD_RULES) {
    const niche = byName.get(matchKey(rule.niche))
    if (!niche) continue
    for (const kw of rule.keywords) {
      if (keywordMatches(text, kw)) return niche
    }
  }
  return null
}
