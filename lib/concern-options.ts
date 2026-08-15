// Main-concern capture lists for the clinical niches.
//
// On the "Questions — Update the File" screen, the caller taps the concern
// the patient names as their answer to the magic question ("if you could get
// rid of one of these..."). The tapped concern carries forward into every
// later screen through the {{main_concern}} token, so the recommendation
// speaks to the patient's actual issue ("help you with your headaches")
// instead of a generic phrase. Last tap wins; if nothing is tapped, the
// {{main_concern}} token falls back to a generic phrase and the script reads
// exactly like it did before.
//
// Each option pairs a short chip label (what the caller sees) with a spoken
// phrase (what gets injected into the script sentences). Spoken phrases are
// written to read naturally after "help you with ...".
//
// Keyed by niche name. Niches not listed here get no capture chips and are
// completely unaffected.

export interface ConcernOption {
  label: string
  spoken: string
}

export const CONCERN_OPTIONS: Record<string, ConcernOption[]> = {
  Chiropractic: [
    { label: 'Headaches', spoken: 'your headaches' },
    { label: 'Fatigue / low energy', spoken: 'the fatigue' },
    { label: 'Sleep problems', spoken: 'your sleep' },
    { label: 'Allergy / sinus', spoken: 'the allergy and sinus problems' },
    { label: 'Stress / irritability', spoken: 'the stress' },
    { label: 'Tension, pain, or soreness', spoken: 'the pain and soreness' },
    { label: 'Medications', spoken: 'your reliance on those medications' },
  ],
  Acupuncture: [
    { label: 'Pain / stiffness', spoken: 'the pain and stiffness' },
    { label: 'Headaches / migraines', spoken: 'your headaches' },
    { label: 'Stress / anxiety', spoken: 'the stress and anxiety' },
    { label: 'Sleep issues', spoken: 'your sleep' },
    { label: 'Fatigue / low energy', spoken: 'the fatigue' },
    { label: 'Digestive issues', spoken: 'the digestive issues' },
    { label: 'Allergies / sinus', spoken: 'the allergy and sinus problems' },
    { label: 'Numbness / tingling', spoken: 'the numbness and tingling' },
    { label: 'Women\u2019s health', spoken: 'those symptoms' },
  ],
  Decompression: [
    { label: 'Neck pain', spoken: 'the neck pain' },
    { label: 'Back pain', spoken: 'the back pain' },
    { label: 'Trouble sitting', spoken: 'the trouble sitting' },
    { label: 'Pain traveling down leg / arm', spoken: 'that traveling pain' },
    { label: 'Morning stiffness', spoken: 'the morning stiffness' },
    {
      label: 'Trouble bending / lifting',
      spoken: 'the trouble bending and lifting',
    },
    { label: 'Flare-ups', spoken: 'the flare-ups' },
    {
      label: 'Activities given up',
      spoken: 'getting back to the things you\u2019ve given up',
    },
  ],
  Neuropathy: [
    { label: 'Burning / tingling', spoken: 'the burning and tingling' },
    { label: 'Numbness', spoken: 'the numbness' },
    { label: 'Balance problems', spoken: 'your balance' },
    { label: 'Sleep disruption', spoken: 'your sleep' },
    { label: 'Cramping / weakness', spoken: 'the cramping and weakness' },
    { label: 'Medications', spoken: 'your reliance on those medications' },
  ],
  'Joint Pain': [
    { label: 'Knee', spoken: 'that knee' },
    { label: 'Hip', spoken: 'that hip' },
    { label: 'Shoulder', spoken: 'that shoulder' },
    { label: 'Hands / grip', spoken: 'the trouble with your hands' },
    { label: 'Neck or back pain', spoken: 'the back and neck pain' },
    { label: 'Morning stiffness', spoken: 'the morning stiffness' },
    { label: 'Swelling after activity', spoken: 'the swelling' },
    { label: 'Medications', spoken: 'your reliance on those medications' },
  ],
  'Acoustic Wave Therapy': [
    { label: 'Nagging joint pain', spoken: 'that nagging pain' },
    { label: 'Heel / foot pain', spoken: 'the foot pain' },
    { label: 'Tendon trouble', spoken: 'the tendon pain' },
    { label: 'Old injury', spoken: 'that old injury' },
    { label: 'Muscle knots', spoken: 'those stubborn knots' },
    { label: 'Neck / back soreness', spoken: 'the back and neck soreness' },
    {
      label: 'Activities cut back',
      spoken: 'getting back to the activities you\u2019ve cut back on',
    },
  ],
  'Massage Therapy': [
    {
      label: 'Neck / shoulder tension',
      spoken: 'the neck and shoulder tension',
    },
    { label: 'Low back tension', spoken: 'the low back tension' },
    { label: 'Headaches', spoken: 'your headaches' },
    { label: 'Sleep', spoken: 'your sleep' },
    { label: 'Stress', spoken: 'the stress' },
  ],
  'Gut Health': [
    { label: 'Bloating', spoken: 'the bloating' },
    { label: 'Energy crashes', spoken: 'the energy crashes' },
    { label: 'Heartburn / reflux', spoken: 'the reflux' },
    { label: 'Irregularity', spoken: 'the irregularity' },
    {
      label: 'Foods they avoid',
      spoken: 'the growing list of foods you avoid',
    },
    { label: 'Brain fog', spoken: 'the brain fog' },
    { label: 'Mood / stress', spoken: 'the stress and mood swings' },
    { label: 'Headaches', spoken: 'your headaches' },
    { label: 'Medications', spoken: 'your reliance on all those pills' },
  ],
}

/** Fallback used when the caller never taps a chip — keeps every sentence
 * grammatical and generic, exactly like the script before this feature. */
export const CONCERN_FALLBACK = 'what\u2019s been bothering you the most'
