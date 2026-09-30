import type { DemoPracticeKey } from './config'

/**
 * The words each demo practice's seeded data is written in: the chief
 * complaint and service label on every contact, and the notes a caller would
 * have typed. Kept per practice so the med spa's records read like a med
 * spa's and the chiropractor's like a chiropractor's.
 *
 * Server-only (the seeder is the only reader); no need to mirror it in the
 * web app.
 */
export interface DemoPracticeCopy {
  /** Chief complaint written on the contact, keyed by niche name. */
  complaints: Record<string, string[]>
  /** The "service" column of the office's export, keyed by niche name. */
  serviceLabels: Record<string, string[]>
  /** Contact-level notes after a warm conversation. */
  notesReceptive: string[]
  /** Contact-level notes after a polite but non-committal conversation. */
  notesNeutral: string[]
  /** Contact-level notes after a no; the LAST entry is the DNC note. */
  notesCold: string[]
  /** Contact-level notes when nobody ever picked up ('' = no note). */
  notesNeverReached: string[]
  /** Per-call note when the patient booked. */
  bookedNotes: string[]
  /** Per-call note when the patient asked to be called back. */
  callbackNotes: string[]
  /** Per-call note when the patient spoke but did not schedule. */
  noScheduleNotes: string[]
}

const CHIRO_COPY: DemoPracticeCopy = {
  complaints: {
    Chiropractic: ['Lower back pain', 'Neck pain', 'Headaches', 'Sciatica', 'Mid-back tightness', 'Shoulder pain'],
    Decompression: ['Herniated disc L4-L5', 'Sciatica', 'Degenerative disc disease', 'Lower back pain', 'Spinal stenosis'],
    'Joint Pain': ['Knee pain', 'Shoulder pain', 'Hip pain', 'Elbow tendonitis', 'Ankle pain'],
    ChiroThin: ['Weight loss', 'Weight management'],
    'Gut Health': ['Bloating', 'Acid reflux', 'IBS symptoms', 'Constipation', 'Food sensitivities'],
    Neuropathy: ['Peripheral neuropathy', 'Numbness in both feet', 'Burning feet', 'Tingling in hands and feet'],
    Acupuncture: ['Chronic neck and shoulder pain', 'Migraines', 'Stress and poor sleep', 'Low energy'],
    'Massage Therapy': ['Neck and shoulder tension', 'Low back tightness', 'Tension headaches'],
    'Acoustic Wave Therapy': ['Plantar fasciitis', 'Achilles tendonitis', 'Chronic shoulder pain', 'Old knee injury'],
    'Red Light / Body Contouring': ['Red light body contouring', 'Body contouring series'],
    // Weight niches: name the program, never a number or body area.
    'Weight Loss (Not ChiroThin)': ['Weight loss program', 'Medical weight loss'],
    'GLP Patients': ['GLP-1 weight loss program', 'Semaglutide program'],
  },
  serviceLabels: {
    Chiropractic: ['Chiropractic Adjustment', 'Adjustment', 'Chiro Wellness Visit'],
    Decompression: ['Spinal Decompression', 'DTS Therapy'],
    'Joint Pain': ['Joint Pain Program', 'Knee Program'],
    ChiroThin: ['ChiroThin Weight Loss', 'ChiroThin'],
    'Gut Health': ['Gut Health Program', 'Digestive Health Consult'],
    Neuropathy: ['Neuropathy Program', 'Neuropathy Treatment'],
    Acupuncture: ['Acupuncture Session', 'Acupuncture Series'],
    'Massage Therapy': ['Therapeutic Massage', 'Deep Tissue Massage'],
    'Acoustic Wave Therapy': ['SoftWave/shock wave', 'Shock wave session'],
    'Red Light / Body Contouring': ['Red Light Body Contouring', 'Red Light Sessions'],
    'Weight Loss (Not ChiroThin)': ['Weight Loss Program', 'Medical Weight Loss'],
    'GLP Patients': ['GLP-1 Program', 'Semaglutide Weight Loss'],
  },
  // Notes are written the way a real caller would type them, so they read
  // naturally in the contact drawer and the call history.
  notesReceptive: [
    '<p>Very friendly. Said the back has been acting up again since starting a new desk job. Open to coming back in.</p>',
    '<p>Remembered Dr. Whitaker by name. Asked whether we still do Saturday hours.</p>',
    '<p>Receptive — knee has been bothering her on stairs. Wants to talk to her husband first.</p>',
    '<p>Warm call. He said the last round of care "worked great" and he just got busy.</p>',
    '<p>Interested, but recovering from a cold this week. Wants a callback next week.</p>',
    '<p>Said she\u2019s been thinking about coming back. Best time to reach is early morning.</p>',
  ],
  notesNeutral: [
    '<p>Polite but short. Said things are "fine for now." Left the door open.</p>',
    '<p>Asked about insurance changes — told him we\u2019d have the front desk confirm.</p>',
    '<p>Busy at work, asked us to try again in the afternoon.</p>',
    '<p>Moved across town but still within driving distance. Not a hard no.</p>',
  ],
  notesCold: [
    '<p>Not interested right now. Said to check back in a few months.</p>',
    '<p>Seeing a PT through work insurance. Wished us well.</p>',
    '<p>Asked not to be called again. Marked DNC.</p>',
  ],
  notesNeverReached: [
    '<p>Straight to voicemail both times. Number appears active.</p>',
    '<p>No answer. Mobile number from the 2024 intake form.</p>',
    '',
    '',
  ],
  bookedNotes: [
    'Booked. Wants to see Dr. Whitaker specifically.',
    'Scheduled — reminded her to bring the updated insurance card.',
    'Booked for a re-eval. Very glad we called.',
    'Scheduled. Said the timing was perfect.',
  ],
  callbackNotes: [
    'Asked us to call back — better time is after 3pm.',
    'In the middle of something, asked for a callback next week.',
    'Wants to check her schedule first. Call back Thursday.',
  ],
  noScheduleNotes: [
    'Not right now — doing okay. Said to check back in a few months.',
    'Feeling fine lately. Keep him on the list.',
    'Interested but money is tight this quarter.',
  ],
}

/**
 * Chief complaints for the facial niches are the chip labels from that
 * niche's concern options, so the record reads the way the script's
 * Update-the-File screen does (a test checks this). The two body-contouring
 * niches name the service instead of a body area, so the contact record can
 * never read as a judgment (the script never speaks this field).
 */
export const AESTHETIC_SERVICE_NAMED_NICHES = ['Cellulite Reduction', 'Red Light / Body Contouring'] as const

const AESTHETICS_COPY: DemoPracticeCopy = {
  complaints: {
    Botox: ['Lines coming back', 'Jaw clenching / headaches', 'An upcoming event', 'Dryness / sun spots'],
    Fillers: ['Lips', 'Cheeks / volume loss', 'Smile lines', 'Under-eye hollows', 'Lines around the mouth'],
    'IPL / Photofacial': ['Sun spots / brown spots', 'Redness / flushing', 'Small red veins', 'Uneven skin tone'],
    'Microneedling / RF Microneedling': ['Acne scars', 'Large pores', 'Fine lines', 'Rough / uneven skin'],
    'Laser Resurfacing': ['Fine lines / wrinkles', 'Sun damage / spots', 'Acne scars', 'Lines around the mouth'],
    'Acne / Acne Scarring': ['Breakouts', 'Dark marks after breakouts', 'Scarring / pitting', 'Oily skin / large pores'],
    'Pigmentation / Sun Damage': ['Sun spots / age spots', 'Melasma / patches', 'Uneven skin tone', 'Dark marks after breakouts'],
    'Rosacea / Redness': ['Flushing / redness', 'Small red veins', 'Bumps / breakouts', 'Stinging / sensitive skin'],
    'Chemical Peels': ['Dull / tired-looking skin', 'Rough / uneven skin', 'Sun spots / dark marks', 'Fine lines'],
    'Facials / HydraFacial': ['Dull skin', 'Clogged pores / blackheads', 'Dryness / flaking', 'An event coming up'],
    'Medical-Grade Skincare': ['Routine slipped', 'Ran out of products', 'Dryness / flaking', 'Sun spots / uneven tone'],
    'Skin Tightening': ['Jawline / neck', 'Skin after weight change', 'Chest', 'Backs of hands'],
    'Cellulite Reduction': ['Cellulite reduction series', 'Cellulite treatment package'],
    'Red Light / Body Contouring': ['Red light body contouring', 'Body contouring series'],
    'Laser Hair Removal': ['The regrowth', 'Irritation / ingrowns', 'Underarms', 'Legs'],
    'Body Waxing': ['Routine slipped', 'Irritation / ingrowns', 'Brows', 'Legs'],
  },
  serviceLabels: {
    Botox: ['Botox', 'Neurotoxin Touch-Up', 'Botox 40 Units'],
    Fillers: ['Dermal Filler', 'Lip Filler', 'Cheek Filler'],
    'IPL / Photofacial': ['IPL Photofacial', 'Photofacial Series'],
    'Microneedling / RF Microneedling': ['RF Microneedling', 'Microneedling Series'],
    'Laser Resurfacing': ['Laser Resurfacing', 'Fractional Laser'],
    'Acne / Acne Scarring': ['Acne Program', 'Acne Scar Treatment'],
    'Pigmentation / Sun Damage': ['Pigmentation Treatment', 'Sun Damage Series'],
    'Rosacea / Redness': ['Rosacea Treatment', 'Redness Laser'],
    'Chemical Peels': ['Chemical Peel', 'Peel Series'],
    'Facials / HydraFacial': ['HydraFacial', 'Signature Facial'],
    'Medical-Grade Skincare': ['Skincare Consult', 'Medical-Grade Skincare'],
    'Skin Tightening': ['Skin Tightening', 'RF Skin Tightening'],
    'Cellulite Reduction': ['Cellulite Reduction Series', 'Cellulite Treatment'],
    'Red Light / Body Contouring': ['Red Light Body Contouring', 'Red Light Sessions'],
    'Laser Hair Removal': ['Laser Hair Removal', 'LHR Package of 6'],
    'Body Waxing': ['Body Waxing', 'Brow & Lip Wax'],
  },
  notesReceptive: [
    '<p>Very friendly. Said her lines have crept back since her last visit and she has been meaning to book.</p>',
    '<p>Remembered Dr. Marsh by name. Asked whether we still have evening appointments.</p>',
    '<p>Receptive — has a wedding in the spring and wants to plan ahead. Wants to check dates first.</p>',
    '<p>Warm call. Said the last series "made a real difference" and she just got busy.</p>',
    '<p>Interested, but travelling this week. Wants a callback when she is back.</p>',
    '<p>Said she\u2019s been thinking about coming back. Best time to reach is early morning.</p>',
  ],
  notesNeutral: [
    '<p>Polite but short. Said her routine is "fine for now." Left the door open.</p>',
    '<p>Asked about current pricing — told her the front desk would send the menu.</p>',
    '<p>Busy at work, asked us to try again in the afternoon.</p>',
    '<p>Moved across town but still within driving distance. Not a hard no.</p>',
  ],
  notesCold: [
    '<p>Not interested right now. Said to check back in a few months.</p>',
    '<p>Going to a spa closer to her office now. Wished us well.</p>',
    '<p>Asked not to be called again. Marked DNC.</p>',
  ],
  notesNeverReached: [
    '<p>Straight to voicemail both times. Number appears active.</p>',
    '<p>No answer. Mobile number from the 2024 intake form.</p>',
    '',
    '',
  ],
  bookedNotes: [
    'Booked. Wants Dr. Marsh to do the consult herself.',
    'Scheduled — reminded her to come in without makeup.',
    'Booked a touch-up. Very glad we called.',
    'Scheduled. Said the timing was perfect.',
  ],
  callbackNotes: [
    'Asked us to call back — better time is after 3pm.',
    'In the middle of something, asked for a callback next week.',
    'Wants to check her calendar first. Call back Thursday.',
  ],
  noScheduleNotes: [
    'Not right now — happy with how things look. Said to check back in a few months.',
    'Skin has been behaving lately. Keep her on the list.',
    'Interested but money is tight this quarter.',
  ],
}

export const DEMO_PRACTICE_COPY: Record<DemoPracticeKey, DemoPracticeCopy> = {
  chiro: CHIRO_COPY,
  aesthetics: AESTHETICS_COPY,
}
