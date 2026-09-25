// @ts-nocheck

/**
 * Static configuration for the sales demo accounts.
 *
 * There are two demo practices, built the same way (owner, four callers with
 * the same performance story, 100 patients, showcase patients in today's
 * first batch, training progress): a chiropractic family practice and a med
 * spa. The presenter enters the shared demo password and picks one.
 *
 * Safe to import from client code — no secrets, no DB access. A copy of this
 * file lives in the web app (src/lib/demo/config.ts); keep both identical.
 */

/** All demo identities live under this domain so they can never collide with a real customer. */
export const DEMO_EMAIL_DOMAIN = 'demo.reactivationpower.com'
export const demoEmail = (local: string) => `${local}@${DEMO_EMAIL_DOMAIN}`

export type DemoPracticeKey = 'chiro' | 'aesthetics'

export interface DemoOwnerProfile {
  first: string
  last: string
  /** Local part of the owner's demo e-mail address */
  email: string
  phone: string
  practice: string
  officePhone: string
}

export interface DemoCallerProfile {
  key: string
  id: string
  first: string
  last: string
  email: string
  phone: string
  /** Probability a dial is answered (team avg ≈ 0.30) */
  answerRate: number
  /** Probability a reached patient books (team avg ≈ 0.30) */
  closeRate: number
  /** Probability a reached patient asks not to be called */
  dncRate: number
  /** Probability a reached-but-not-booked patient asks for a callback */
  callbackShare: number
  /** Relative share of dials this caller makes */
  volumeWeight: number
  /** Training videos completed out of 18 */
  trainingCompleted: number
  /** Portal logins per week */
  loginsPerWeek: number
}

export interface DemoPractice {
  key: DemoPracticeKey
  /** Short label for the practice picker on /demo */
  label: string
  /** One line under the label on /demo */
  description: string
  owner: DemoOwnerProfile
  callers: Omit<DemoCallerProfile, 'id'>[]
  /**
   * Niches enabled on the account, by exact `niches.name`. The seeder looks
   * the ids up in the niches table and refuses to build if a name is missing.
   */
  niches: readonly string[]
  /** The niche new contacts default to; must be one of `niches`. */
  defaultNiche: string
  /**
   * Showcase niches: exactly ONE patient each, kept out of the niche cycle.
   * Index N here is assigned to the Nth name of the new (never-called) cohort
   * and stamped created_at 08:0N ET, ahead of the rest of that cohort (which
   * the seeder stamps from 08:(N+1) onward), so the oldest-first batch release
   * always puts these patients in today's first "Calls Due Now" batch and a
   * presenter can open each script straight from the dashboard.
   * Must be no longer than `callBatchSize` (guarded below).
   */
  showcaseNiches: readonly string[]
  /**
   * The niche mix of ordinary (non-showcase) patients, cycled in order. Names
   * must be in `niches`.
   */
  nicheCycle: readonly string[]
  /** The owner's cold-call batch size; every showcase patient must fit in it. */
  callBatchSize: number
  /** Local area codes for the fake patient phone numbers. */
  areaCodes: readonly string[]
  /** Seed for the deterministic story; change it only to reshuffle a demo on purpose. */
  rngSeed: string
  /** 100 distinct fake patients (first, last). Order matters: first 60 are the "worked" cohort. */
  patientNames: readonly (readonly [string, string])[]
}

// ---------------------------------------------------------------------------
// Chiro: Ridgeline Chiropractic & Wellness (the original demo account)
// ---------------------------------------------------------------------------

/**
 * The story: Sarah is the closer, Marcus is steady, Priya is newer but solid,
 * Tyler is clearly underperforming AND hasn't finished training — so the
 * drill-down's training audit tells a cause-and-effect story.
 */
const CHIRO_CALLERS: Omit<DemoCallerProfile, 'id'>[] = [
  {
    key: 'sarah',
    first: 'Sarah',
    last: 'Mitchell',
    email: 'sarah.mitchell',
    phone: '(303) 555-0117',
    answerRate: 0.34,
    closeRate: 0.4,
    dncRate: 0.03,
    callbackShare: 0.35,
    volumeWeight: 4,
    trainingCompleted: 18,
    loginsPerWeek: 4,
  },
  {
    key: 'marcus',
    first: 'Marcus',
    last: 'Reyes',
    email: 'marcus.reyes',
    phone: '(720) 555-0163',
    answerRate: 0.31,
    closeRate: 0.31,
    dncRate: 0.04,
    callbackShare: 0.3,
    volumeWeight: 3,
    trainingCompleted: 18,
    loginsPerWeek: 3,
  },
  {
    key: 'priya',
    first: 'Priya',
    last: 'Nair',
    email: 'priya.nair',
    phone: '(303) 555-0188',
    answerRate: 0.29,
    closeRate: 0.28,
    dncRate: 0.04,
    callbackShare: 0.3,
    volumeWeight: 3,
    trainingCompleted: 15,
    loginsPerWeek: 3,
  },
  {
    key: 'tyler',
    first: 'Tyler',
    last: 'Brooks',
    email: 'tyler.brooks',
    phone: '(970) 555-0121',
    answerRate: 0.24,
    closeRate: 0.12,
    dncRate: 0.09,
    callbackShare: 0.2,
    volumeWeight: 2,
    trainingCompleted: 6,
    loginsPerWeek: 1,
  },
]

const CHIRO_PATIENT_NAMES: readonly (readonly [string, string])[] = [
  ['Margaret', 'Holloway'], ['James', 'Whitfield'], ['Linda', 'Castellano'], ['Robert', 'Pruitt'],
  ['Patricia', 'Delgado'], ['Michael', 'Ashford'], ['Barbara', 'Nakamura'], ['William', 'Greer'],
  ['Elizabeth', 'Sandoval'], ['David', 'Lindqvist'], ['Jennifer', 'Okafor'], ['Richard', 'Beaumont'],
  ['Maria', 'Thibodeaux'], ['Charles', 'Wexler'], ['Susan', 'Ferreira'], ['Joseph', 'Kowalczyk'],
  ['Karen', 'Blackwood'], ['Thomas', 'Ruiz'], ['Nancy', 'Everett'], ['Christopher', 'Malone'],
  ['Lisa', 'Vandenberg'], ['Daniel', 'Osei'], ['Betty', 'Harrington'], ['Matthew', 'Kessler'],
  ['Sandra', 'Alvarado'], ['Anthony', 'Fitzgerald'], ['Ashley', 'Tanaka'], ['Mark', 'Duquesne'],
  ['Donna', 'Petrakis'], ['Steven', 'Calloway'], ['Carol', 'Mbeki'], ['Paul', 'Strickland'],
  ['Michelle', 'Ramos'], ['Andrew', 'Halvorsen'], ['Emily', 'Oyelaran'], ['Joshua', 'Pembroke'],
  ['Amanda', 'Villanueva'], ['Kenneth', 'Brannigan'], ['Melissa', 'Sorensen'], ['Kevin', 'Ashby'],
  ['Deborah', 'Quintero'], ['Brian', 'Lockhart'], ['Stephanie', 'Ibarra'], ['George', 'Weatherby'],
  ['Rebecca', 'Sato'], ['Timothy', 'Culpepper'], ['Sharon', 'Dominguez'], ['Ronald', 'Hargrove'],
  ['Laura', 'Mancini'], ['Edward', 'Okonkwo'], ['Cynthia', 'Pham'], ['Jason', 'Radcliffe'],
  ['Kathleen', 'Escobar'], ['Jeffrey', 'Thornbury'], ['Amy', 'Lindgren'], ['Ryan', 'Castañeda'],
  ['Angela', 'Whitlock'], ['Jacob', 'Merriweather'], ['Shirley', 'Navarro'], ['Gary', 'Stellhorn'],
  // ---- new cohort (never called); the first names carry the showcase niches ----
  ['Brenda', 'Fairbanks'], ['Nicholas', 'Sung'], ['Pamela', 'Redfield'], ['Eric', 'Albrecht'],
  ['Emma', 'Castillo'], ['Jonathan', 'Prescott'], ['Nicole', 'Haddad'], ['Stephen', 'Vasquez'],
  ['Helen', 'Marchetti'], ['Larry', 'Dunmore'], ['Samantha', 'Iverson'], ['Justin', 'Oduya'],
  ['Katherine', 'Bellamy'], ['Scott', 'Ferrante'], ['Christine', 'Lugo'], ['Brandon', 'Whitaker'],
  ['Debra', 'Kaminski'], ['Benjamin', 'Ortega'], ['Rachel', 'Stroud'], ['Samuel', 'Nkemelu'],
  ['Carolyn', 'Pickering'], ['Gregory', 'Salinas'], ['Janet', 'Torvald'], ['Alexander', 'Rowe'],
  ['Catherine', 'Bautista'], ['Patrick', 'Ellington'], ['Maria', 'Kovac'], ['Frank', 'Delacroix'],
  ['Heather', 'Yamamoto'], ['Raymond', 'Silverman'], ['Diane', 'Achebe'], ['Jack', 'Montague'],
  ['Olivia', 'Ferris'], ['Dennis', 'Zapata'], ['Julie', 'Hollister'], ['Jerry', 'Bankole'],
  ['Joyce', 'Crandall'], ['Tyler', 'Espinosa'], ['Victoria', 'Lamont'], ['Aaron', 'Sheffield'],
]

export const CHIRO_DEMO: DemoPractice = {
  key: 'chiro',
  label: 'Chiropractic',
  description: 'Ridgeline Chiropractic & Wellness — adjustments, decompression, neuropathy, weight loss and more.',
  owner: {
    first: 'Daniel',
    last: 'Whitaker',
    email: 'dr.whitaker',
    phone: '(303) 555-0142',
    practice: 'Ridgeline Chiropractic & Wellness',
    officePhone: '(303) 555-0100',
  },
  callers: CHIRO_CALLERS,
  niches: [
    'Chiropractic',
    'Decompression',
    'Joint Pain',
    'Neuropathy',
    'Acupuncture',
    'Massage Therapy',
    'Acoustic Wave Therapy',
    'Red Light / Body Contouring',
    'Gut Health',
    'ChiroThin',
    'Weight Loss (Not ChiroThin)',
    'GLP Patients',
  ],
  defaultNiche: 'Chiropractic',
  /*
   *   0 Brenda Fairbanks  -> Gut Health
   *   1 Nicholas Sung     -> Neuropathy
   *   2 Pamela Redfield   -> Decompression
   *   3 Eric Albrecht     -> Acupuncture
   *   4 Emma Castillo     -> Massage Therapy
   *   5 Jonathan Prescott -> Acoustic Wave Therapy
   *   6 Nicole Haddad     -> Weight Loss (Not ChiroThin)
   *   7 Stephen Vasquez   -> GLP Patients
   *   8 Helen Marchetti   -> Joint Pain
   *   9 Larry Dunmore     -> ChiroThin
   * Chiropractic itself is half of the ordinary cycle, so the worked cohort's
   * follow-ups due today already put several Chiropractic patients on the
   * dashboard without a showcase slot.
   */
  showcaseNiches: [
    'Gut Health',
    'Neuropathy',
    'Decompression',
    'Acupuncture',
    'Massage Therapy',
    'Acoustic Wave Therapy',
    'Weight Loss (Not ChiroThin)',
    'GLP Patients',
    'Joint Pain',
    'ChiroThin',
  ],
  // Chiro-heavy mix
  nicheCycle: [
    'Chiropractic', 'Chiropractic', 'Chiropractic', 'Chiropractic',
    'Decompression', 'Decompression', 'Joint Pain', 'Joint Pain', 'ChiroThin', 'Chiropractic',
  ],
  callBatchSize: 10,
  areaCodes: ['303', '720', '970', '719'], // Colorado, matches the clinic
  rngSeed: 'ridgeline-chiro-demo-v1',
  patientNames: CHIRO_PATIENT_NAMES,
}

// ---------------------------------------------------------------------------
// Aesthetics: Solstice Aesthetics & Med Spa
// ---------------------------------------------------------------------------

/** Same four-caller story as the chiro demo, with the med spa's own staff. */
const AESTHETICS_CALLERS: Omit<DemoCallerProfile, 'id'>[] = [
  {
    key: 'jasmine',
    first: 'Jasmine',
    last: 'Okoro',
    email: 'jasmine.okoro',
    phone: '(480) 555-0117',
    answerRate: 0.34,
    closeRate: 0.4,
    dncRate: 0.03,
    callbackShare: 0.35,
    volumeWeight: 4,
    trainingCompleted: 18,
    loginsPerWeek: 4,
  },
  {
    key: 'carlos',
    first: 'Carlos',
    last: 'Medina',
    email: 'carlos.medina',
    phone: '(602) 555-0163',
    answerRate: 0.31,
    closeRate: 0.31,
    dncRate: 0.04,
    callbackShare: 0.3,
    volumeWeight: 3,
    trainingCompleted: 18,
    loginsPerWeek: 3,
  },
  {
    key: 'olivia',
    first: 'Olivia',
    last: 'Bennett',
    email: 'olivia.bennett',
    phone: '(480) 555-0188',
    answerRate: 0.29,
    closeRate: 0.28,
    dncRate: 0.04,
    callbackShare: 0.3,
    volumeWeight: 3,
    trainingCompleted: 15,
    loginsPerWeek: 3,
  },
  {
    key: 'brooke',
    first: 'Brooke',
    last: 'Lawson',
    email: 'brooke.lawson',
    phone: '(623) 555-0121',
    answerRate: 0.24,
    closeRate: 0.12,
    dncRate: 0.09,
    callbackShare: 0.2,
    volumeWeight: 2,
    trainingCompleted: 6,
    loginsPerWeek: 1,
  },
]

const AESTHETICS_PATIENT_NAMES: readonly (readonly [string, string])[] = [
  ['Vanessa', 'Caldwell'], ['Renee', 'Abernathy'], ['Monica', 'Sturgis'], ['Alicia', 'Devereaux'],
  ['Tanya', 'Whitmore'], ['Brianna', 'Kowalski'], ['Lauren', 'Pettigrew'], ['Natalie', 'Rosenberg'],
  ['Jessica', 'Okonjo'], ['Kimberly', 'Farrow'], ['Danielle', 'Sutherland'], ['Erica', 'Villareal'],
  ['Courtney', 'Blanchard'], ['Whitney', 'Adeyemi'], ['Megan', 'Castleberry'], ['Tiffany', 'Nguyen'],
  ['Marcus', 'Dahlgren'], ['Andrea', 'Fontenot'], ['Simone', 'Radovich'], ['Crystal', 'Hensley'],
  ['Allison', 'McBride'], ['Gabriela', 'Espinoza'], ['Leslie', 'Thornton'], ['Rachel', 'Ambrose'],
  ['Priscilla', 'Yoon'], ['Dana', 'Kirkpatrick'], ['Jocelyn', 'Marchand'], ['Heidi', 'Lindahl'],
  ['Bianca', 'Serrano'], ['Nathan', 'Holbrook'], ['Sabrina', 'Whitcomb'], ['Kristen', 'Oduya'],
  ['Adriana', 'Petrov'], ['Chelsea', 'Bannister'], ['Yvonne', 'Drummond'], ['Teresa', 'Galloway'],
  ['Felicia', 'Ramsey'], ['Nadia', 'Castellanos'], ['Robin', 'Hargreaves'], ['Camille', 'Beaulieu'],
  ['Shannon', 'Ferraro'], ['Jasmine', 'Tolliver'], ['Elaine', 'Sandberg'], ['Derek', 'Anand'],
  ['Kendra', 'Lockwood'], ['Marisol', 'Ibanez'], ['Paige', 'Weatherford'], ['Lorraine', 'Baptiste'],
  ['Aisha', 'Mensah'], ['Colleen', 'Radcliffe'], ['Trisha', 'Nakagawa'], ['Valerie', 'Strand'],
  ['Gina', 'Palumbo'], ['Rosalind', 'Fairchild'], ['Meredith', 'Cho'], ['Jill', 'Ostrowski'],
  ['Carla', 'Benavides'], ['Wendy', 'Halloran'], ['Denise', 'Morrow'], ['Tara', 'Kinsley'],
  // ---- new cohort (never called); the first names carry the showcase niches ----
  ['Sophia', 'Larkin'], ['Isabel', 'Moreno'], ['Hannah', 'Stroud'], ['Grace', 'Winslow'],
  ['Chloe', 'Bergstrom'], ['Ava', 'Santangelo'], ['Lily', 'Achterberg'], ['Zoe', 'Prentiss'],
  ['Mia', 'Corrigan'], ['Ella', 'Vanterpool'], ['Naomi', 'Kessling'], ['Audrey', 'Falk'],
  ['Claire', 'Beckford'], ['Stella', 'Ramirez'], ['Ruby', 'Ashcroft'], ['Julia', 'Templeton'],
  ['Evan', 'Brightwood'], ['Nora', 'Hjelm'], ['Leah', 'Greenwood'], ['Ivy', 'Takahashi'],
  ['Maya', 'Ferrell'], ['Sienna', 'Adebayo'], ['Aubrey', 'Penrose'], ['Brooklyn', 'Sandoval'],
  ['Savannah', 'Quiroga'], ['Lucy', 'Marlowe'], ['Anna', 'Steinberg'], ['Caroline', 'Izquierdo'],
  ['Madison', 'Crowley'], ['Kayla', 'Duarte'], ['Alexis', 'Manzella'], ['Jordan', 'Thackery'],
  ['Morgan', 'Estrada'], ['Taylor', 'Lindell'], ['Sydney', 'Navarrete'], ['Peyton', 'Villalobos'],
  ['Kennedy', 'Brannon'], ['Reagan', 'Ashworth'], ['Skylar', 'Lockridge'], ['Harper', 'Wetherell'],
]

export const AESTHETICS_DEMO: DemoPractice = {
  key: 'aesthetics',
  label: 'Aesthetics / Med Spa',
  description: 'Solstice Aesthetics & Med Spa — injectables, lasers, skin treatments, body contouring and hair removal.',
  owner: {
    first: 'Elena',
    last: 'Marsh',
    email: 'dr.marsh',
    phone: '(480) 555-0142',
    practice: 'Solstice Aesthetics & Med Spa',
    officePhone: '(480) 555-0100',
  },
  callers: AESTHETICS_CALLERS,
  niches: [
    'Botox',
    'Fillers',
    'IPL / Photofacial',
    'Microneedling / RF Microneedling',
    'Laser Resurfacing',
    'Acne / Acne Scarring',
    'Pigmentation / Sun Damage',
    'Rosacea / Redness',
    'Chemical Peels',
    'Facials / HydraFacial',
    'Medical-Grade Skincare',
    'Skin Tightening',
    'Cellulite Reduction',
    'Red Light / Body Contouring',
    'Laser Hair Removal',
    'Body Waxing',
  ],
  defaultNiche: 'Botox',
  /*
   * Every aesthetic niche gets a showcase patient (16), so the owner's batch
   * size is raised to 16 to keep all of them in today's first batch.
   *   0 Sophia Larkin     -> Botox
   *   1 Isabel Moreno     -> Fillers
   *   2 Hannah Stroud     -> IPL / Photofacial
   *   3 Grace Winslow     -> Microneedling / RF Microneedling
   *   4 Chloe Bergstrom   -> Laser Resurfacing
   *   5 Ava Santangelo    -> Acne / Acne Scarring
   *   6 Lily Achterberg   -> Pigmentation / Sun Damage
   *   7 Zoe Prentiss      -> Rosacea / Redness
   *   8 Mia Corrigan      -> Chemical Peels
   *   9 Ella Vanterpool   -> Facials / HydraFacial
   *  10 Naomi Kessling    -> Medical-Grade Skincare
   *  11 Audrey Falk       -> Skin Tightening
   *  12 Claire Beckford   -> Cellulite Reduction
   *  13 Stella Ramirez    -> Red Light / Body Contouring
   *  14 Ruby Ashcroft     -> Laser Hair Removal
   *  15 Julia Templeton   -> Body Waxing
   */
  showcaseNiches: [
    'Botox',
    'Fillers',
    'IPL / Photofacial',
    'Microneedling / RF Microneedling',
    'Laser Resurfacing',
    'Acne / Acne Scarring',
    'Pigmentation / Sun Damage',
    'Rosacea / Redness',
    'Chemical Peels',
    'Facials / HydraFacial',
    'Medical-Grade Skincare',
    'Skin Tightening',
    'Cellulite Reduction',
    'Red Light / Body Contouring',
    'Laser Hair Removal',
    'Body Waxing',
  ],
  // Injectables-heavy mix, the way a med spa's list usually runs
  nicheCycle: [
    'Botox', 'Botox', 'Botox', 'Fillers', 'Fillers',
    'Facials / HydraFacial', 'IPL / Photofacial', 'Laser Hair Removal', 'Microneedling / RF Microneedling', 'Botox',
  ],
  callBatchSize: 16,
  areaCodes: ['480', '602', '623'], // Phoenix / Scottsdale, matches the spa
  rngSeed: 'solstice-aesthetics-demo-v1',
  patientNames: AESTHETICS_PATIENT_NAMES,
}

export const DEMO_PRACTICES: readonly DemoPractice[] = [CHIRO_DEMO, AESTHETICS_DEMO]

export function isDemoPracticeKey(value: unknown): value is DemoPracticeKey {
  return DEMO_PRACTICES.some((p) => p.key === value)
}

export function getDemoPractice(key: DemoPracticeKey): DemoPractice {
  const practice = DEMO_PRACTICES.find((p) => p.key === key)
  if (!practice) throw new Error(`unknown demo practice: ${key}`)
  return practice
}

/** The practice whose owner signs in with this e-mail, if it is a demo owner. */
export function demoPracticeByOwnerEmail(email: string | null | undefined): DemoPractice | null {
  if (!email) return null
  const lower = email.toLowerCase()
  return DEMO_PRACTICES.find((p) => demoEmail(p.owner.email).toLowerCase() === lower) ?? null
}

/**
 * Every rule the seeder relies on, checked once so a bad edit fails at import
 * time instead of producing a demo whose showcase patients are missing from
 * the dashboard. Returns the problems instead of throwing so tests can assert
 * on them; the module-level check below turns any problem into a throw.
 */
export function demoPracticeProblems(practice: DemoPractice): string[] {
  const problems: string[] = []
  const niches = new Set(practice.niches)
  if (niches.size !== practice.niches.length) problems.push(`${practice.key}: duplicate niche in niches`)
  if (!niches.has(practice.defaultNiche)) problems.push(`${practice.key}: defaultNiche "${practice.defaultNiche}" is not an enabled niche`)
  for (const n of practice.showcaseNiches) {
    if (!niches.has(n)) problems.push(`${practice.key}: showcase niche "${n}" is not an enabled niche`)
  }
  if (new Set(practice.showcaseNiches).size !== practice.showcaseNiches.length) {
    problems.push(`${practice.key}: duplicate showcase niche`)
  }
  for (const n of practice.nicheCycle) {
    if (!niches.has(n)) problems.push(`${practice.key}: cycle niche "${n}" is not an enabled niche`)
  }
  if (practice.showcaseNiches.length > practice.callBatchSize) {
    problems.push(
      `${practice.key}: ${practice.showcaseNiches.length} showcase niches but the batch size is ${practice.callBatchSize}; ` +
        'not every showcase patient would land in the first Calls Due Now batch',
    )
  }
  if (practice.patientNames.length !== 100) problems.push(`${practice.key}: expected 100 patient names, got ${practice.patientNames.length}`)
  const fullNames = new Set(practice.patientNames.map(([f, l]) => `${f} ${l}`))
  if (fullNames.size !== practice.patientNames.length) problems.push(`${practice.key}: duplicate patient name`)
  if (practice.callers.length !== 4) problems.push(`${practice.key}: expected 4 callers, got ${practice.callers.length}`)
  return problems
}

/** Problems that span practices: identities must never collide. */
export function demoConfigProblems(practices: readonly DemoPractice[] = DEMO_PRACTICES): string[] {
  const problems = practices.flatMap(demoPracticeProblems)
  const emails = new Map<string, string>()
  for (const p of practices) {
    for (const local of [p.owner.email, ...p.callers.map((c) => c.email)]) {
      const seen = emails.get(local)
      if (seen) problems.push(`demo e-mail "${local}" is used by both ${seen} and ${p.key}`)
      emails.set(local, p.key)
    }
  }
  if (new Set(practices.map((p) => p.key)).size !== practices.length) problems.push('duplicate demo practice key')
  return problems
}

{
  const problems = demoConfigProblems()
  if (problems.length > 0) throw new Error(`demo config: ${problems.join('; ')}`)
}

/** Default (owner_id null) pipeline stages */
export const DEMO_STAGE_IDS = {
  new: 'f00fc694-f71f-4000-93ef-a96962252075',
  contacting: 'd00fbf2a-4239-4caa-8647-7d5a3dbf75fb',
  spoke_to: 'e027b872-4e3d-4d49-8aa9-74bab84f933d',
  scheduled: 'fdac9153-7c2f-4354-bf47-55e12ee290d1',
} as const

export const DEMO_COURSE_ID = 'bf6544e1-9e9e-4c6b-b722-4a40b239f533'

/**
 * How far the owner — the identity the presenter lands as — has gotten in the
 * course: the first two videos complete, the third in progress. Videos unlock
 * one at a time, so this leaves the LAST video of Module 1 and every later
 * module locked, which is the "your callers can't skip ahead" moment in the
 * demo. Callers keep their own trainingCompleted counts (closer 18, laggard 6).
 */
export const DEMO_OWNER_TRAINING_COMPLETED = 2

/** Live videos of the healthcare course, in course order. */
export const DEMO_VIDEO_IDS: { id: string; module_id: string; duration_seconds: number }[] = [
  { id: 'f9af12a6-3bf8-45a6-a8df-6f12bc701e75', module_id: '4777b06a-0636-4740-9a25-006cb8222aac', duration_seconds: 248 },
  { id: '54bfc849-0bba-4e3e-b168-cb90355431d8', module_id: '4777b06a-0636-4740-9a25-006cb8222aac', duration_seconds: 268 },
  { id: 'bbdad260-fd64-49de-9c3c-34767505c372', module_id: '4777b06a-0636-4740-9a25-006cb8222aac', duration_seconds: 238 },
  { id: 'c25f2838-8f8d-4a67-bcce-b5726404f7e7', module_id: '4777b06a-0636-4740-9a25-006cb8222aac', duration_seconds: 78 },
  { id: 'f5c90360-03fb-4ea9-8070-acf541b3ec5c', module_id: '8a9d55a1-1bdc-43cb-b0b7-f7486df7bffe', duration_seconds: 255 },
  { id: 'd7a592cb-5145-4ac5-a779-e1d12ebf6a7d', module_id: '8a9d55a1-1bdc-43cb-b0b7-f7486df7bffe', duration_seconds: 205 },
  { id: '40188dfc-0a27-4647-aad6-92e5a5901410', module_id: '8a9d55a1-1bdc-43cb-b0b7-f7486df7bffe', duration_seconds: 166 },
  { id: 'db6d674a-43f2-48d1-9eca-0854b98de336', module_id: '8a9d55a1-1bdc-43cb-b0b7-f7486df7bffe', duration_seconds: 156 },
  { id: '41c63c3b-4893-4ef4-b6c1-7c9dbee477df', module_id: '3c6cd985-864a-42b9-ad11-8d51aa5b37ea', duration_seconds: 297 },
  { id: '1d8bcf86-d9d1-4895-8fc3-5bdd07c0cdff', module_id: '3c6cd985-864a-42b9-ad11-8d51aa5b37ea', duration_seconds: 289 },
  { id: 'bb985d3c-f91c-4ac9-bc3b-efa5cb589329', module_id: '3c6cd985-864a-42b9-ad11-8d51aa5b37ea', duration_seconds: 211 },
  { id: 'be8b53cd-4518-4996-a28d-e2ad1a6c1682', module_id: 'f2649377-6d13-4cb3-bfdb-162b73939908', duration_seconds: 189 },
  { id: 'f8fdf089-e44e-400c-a265-1100441a5c14', module_id: 'f2649377-6d13-4cb3-bfdb-162b73939908', duration_seconds: 297 },
  { id: '95135d9e-c887-4584-9170-537e7b46f2f5', module_id: 'f2649377-6d13-4cb3-bfdb-162b73939908', duration_seconds: 293 },
  { id: '6c147b5e-0587-484f-aafb-6af019a2bb1c', module_id: 'f2649377-6d13-4cb3-bfdb-162b73939908', duration_seconds: 346 },
  { id: '8d853e61-bd69-4eb0-b7c0-491e7c15bd81', module_id: '07614a05-e52c-49b6-80ed-f405b7e92f3b', duration_seconds: 189 },
  { id: '63be83c1-ed7c-4ea1-9864-b5ff55db8de5', module_id: '07614a05-e52c-49b6-80ed-f405b7e92f3b', duration_seconds: 163 },
  { id: '89105b76-fc5d-4fb0-9ae7-4b8a1836fa84', module_id: '07614a05-e52c-49b6-80ed-f405b7e92f3b', duration_seconds: 154 },
]
