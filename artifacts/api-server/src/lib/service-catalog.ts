/**
 * The single public catalog of services Reactivation Power has scripts for.
 *
 * Every marketing surface that lists services reads from here: the homepage
 * "services we support" section, the How It Works page, and the lead-form
 * checkboxes. Adding a niche is one entry in the right group below.
 *
 * `label` is the public name a visitor sees. `niche` is the exact
 * `niches.name` in the database and is what the lead form submits, so
 * GoHighLevel notes and `landing_leads.services` keep the internal name.
 */

export type ServiceGroupId = 'chiropractic' | 'dental' | 'medspa' | 'weight'

export interface CatalogService {
  label: string
  niche: string
}

export interface ServiceGroup {
  id: ServiceGroupId
  title: string
  audience: string
  services: CatalogService[]
  /**
   * Display-only lines appended to the card so a buyer sees every service
   * they typically offer on their own card, even when the underlying niches
   * live in another group. Never rendered as lead-form checkboxes.
   */
  alsoOffered?: string[]
}

export const PRACTICE_TYPES_LINE =
  'For chiropractic, acupuncture, dental, med spa & weight-loss practices'

export const SERVICE_GROUPS: ServiceGroup[] = [
  {
    id: 'chiropractic',
    title: 'Chiropractic, Acupuncture & Wellness',
    audience: 'Chiropractic, acupuncture, and integrated wellness offices',
    services: [
      { label: 'Chiropractic', niche: 'Chiropractic' },
      { label: 'Spinal Decompression', niche: 'Decompression' },
      { label: 'Neuropathy', niche: 'Neuropathy' },
      { label: 'Joint Pain', niche: 'Joint Pain' },
      { label: 'Softwave / Shockwave', niche: 'Acoustic Wave Therapy' },
      { label: 'Acupuncture', niche: 'Acupuncture' },
      { label: 'Massage Therapy', niche: 'Massage Therapy' },
      { label: 'Gut Health', niche: 'Gut Health' },
    ],
    alsoOffered: ['ChiroThin & Weight Loss Programs'],
  },
  {
    id: 'medspa',
    title: 'Med Spa & Aesthetics',
    audience: 'Med spas, aesthetic clinics, and cosmetic add-ons',
    services: [
      { label: 'Botox', niche: 'Botox' },
      { label: 'Skin Tightening', niche: 'Skin Tightening' },
      { label: 'Cellulite Reduction', niche: 'Cellulite Reduction' },
      { label: 'Red Light Body Contouring', niche: 'Red Light / Body Contouring' },
      { label: 'Laser Hair Removal', niche: 'Laser Hair Removal' },
      { label: 'Body Waxing', niche: 'Body Waxing' },
    ],
    alsoOffered: ['GLP-1 & Weight Loss Programs'],
  },
  {
    id: 'dental',
    title: 'Dental & Orthodontic',
    audience: 'General, cosmetic, and orthodontic practices',
    services: [
      { label: 'Clear Aligners', niche: 'Clear Aligners' },
      { label: 'Braces / Orthodontics', niche: 'Orthodontics / Braces' },
      { label: 'Dental Implants', niche: 'Dental Implants' },
      { label: 'Teeth Whitening', niche: 'Teeth Whitening' },
    ],
  },
  {
    id: 'weight',
    title: 'Weight Loss',
    audience: 'Chiropractic offices, med spas, and clinics',
    services: [
      { label: 'ChiroThin', niche: 'ChiroThin' },
      {
        label: 'In-Office Weight Loss Programs',
        niche: 'Weight Loss (Not ChiroThin)',
      },
      { label: 'GLP-1 Patients', niche: 'GLP Patients' },
    ],
  },
]

export const ALL_SERVICES: CatalogService[] = SERVICE_GROUPS.flatMap(
  (group) => group.services,
)

const LABEL_BY_NICHE = new Map(ALL_SERVICES.map((s) => [s.niche, s.label]))

/** Public label for an internal niche name; falls back to the input. */
export function publicServiceName(niche: string): string {
  return LABEL_BY_NICHE.get(niche) ?? niche
}
