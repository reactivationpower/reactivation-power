// Extracted from lib/niche-catalog/src/service-catalog.ts.
export type ServiceGroupId = 'chiropractic' | 'dental' | 'medspa' | 'weight'

export interface ServiceGroup {
  id: ServiceGroupId
  title: string
  audience: string
  services: { label: string; niche: string }[]
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
      { label: 'Fillers', niche: 'Fillers' },
      { label: 'IPL / Photofacial', niche: 'IPL / Photofacial' },
      { label: 'Microneedling & RF Microneedling', niche: 'Microneedling / RF Microneedling' },
      { label: 'Laser Resurfacing', niche: 'Laser Resurfacing' },
      { label: 'Acne & Acne Scarring', niche: 'Acne / Acne Scarring' },
      { label: 'Pigmentation & Sun Damage', niche: 'Pigmentation / Sun Damage' },
      { label: 'Rosacea & Redness', niche: 'Rosacea / Redness' },
      { label: 'Chemical Peels', niche: 'Chemical Peels' },
      { label: 'Facials & HydraFacial', niche: 'Facials / HydraFacial' },
      { label: 'Medical-Grade Skincare', niche: 'Medical-Grade Skincare' },
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