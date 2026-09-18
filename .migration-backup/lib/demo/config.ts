/**
 * Static configuration for the sales demo account (Ridgeline Chiropractic).
 * Safe to import from client code — no secrets, no DB access.
 */

/** All demo identities live under this domain so they can never collide with a real customer. */
export const DEMO_EMAIL_DOMAIN = 'demo.reactivationpower.com'
export const demoEmail = (local: string) => `${local}@${DEMO_EMAIL_DOMAIN}`

export const DEMO_OWNER = {
  first: 'Daniel',
  last: 'Whitaker',
  email: 'dr.whitaker',
  phone: '(303) 555-0142',
  practice: 'Ridgeline Chiropractic & Wellness',
  officePhone: '(303) 555-0100',
} as const

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

/**
 * The story: Sarah is the closer, Marcus is steady, Priya is newer but solid,
 * Tyler is clearly underperforming AND hasn't finished training — so the
 * drill-down's training audit tells a cause-and-effect story.
 */
export const DEMO_CALLERS: Omit<DemoCallerProfile, 'id'>[] = [
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

/** The healthcare niches enabled on the demo account. */
export const DEMO_NICHES = [
  { id: 'a2991531-c84f-4851-b5f5-79e0cb4cc7d4', name: 'Chiropractic' },
  { id: '25d35824-9ccb-4792-8820-3d439eb7143b', name: 'Decompression' },
  { id: '6c23d055-3e82-4f73-b835-7f61f8276a61', name: 'Joint Pain' },
  { id: '5847edee-8fbf-494e-a26f-f5c03007e649', name: 'ChiroThin' },
  { id: '9e6f86fb-f3a9-4cf7-802e-15826e292d66', name: 'Gut Health' },
  { id: '3f538f36-4aff-43a5-b135-5fdb1edbe6e5', name: 'Neuropathy' },
  { id: '645460da-9941-4eff-b209-ec11471ca8e8', name: 'Red Light / Body Contouring' },
] as const

/**
 * Showcase niches: exactly ONE patient each, kept out of the niche cycle.
 * Index N here is assigned to the Nth name of the new (never-called) cohort
 * and stamped created_at 08:0N ET, a few minutes before the rest of that
 * cohort, so the oldest-first batch release always puts these patients in
 * today's first "Calls Due Now" batch and a presenter can open each script
 * straight from the dashboard.
 *   0 Brenda Fairbanks  -> Gut Health
 *   1 Nicholas Sung     -> Neuropathy
 *   2 Pamela Redfield   -> Red Light / Body Contouring
 */
export const DEMO_SHOWCASE_NICHES = [DEMO_NICHES[4], DEMO_NICHES[5], DEMO_NICHES[6]] as const

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
 * demo. Callers keep their own trainingCompleted counts (Sarah 18, Tyler 6).
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

/** 100 distinct fake patients (first, last). Order matters: first 60 are the "worked" cohort. */
export const PATIENT_NAMES: readonly (readonly [string, string])[] = [
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
  // ---- new cohort (never called) ----
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
