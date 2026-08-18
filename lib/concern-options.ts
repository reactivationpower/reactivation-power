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
  /** ChiroThin only: explicitly false means the concern is NOT weight-related,
   * which swaps the weight-assuming objections on the uncover screen for
   * chiropractic-style handling. Undefined (all other niches, the
   * original-complaint chip, and "Other") keeps the default objection set. */
  weightRelated?: boolean
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
  ChiroThin: [
    {
      label: 'Weight creeping back',
      spoken: 'the weight creeping back',
      weightRelated: true,
    },
    {
      label: 'Eating habits slipping',
      spoken: 'getting your eating habits back on track',
      weightRelated: true,
    },
    { label: 'Energy crashes', spoken: 'the energy crashes', weightRelated: false },
    { label: 'Sleep problems', spoken: 'your sleep', weightRelated: false },
    { label: 'Stress / irritability', spoken: 'the stress', weightRelated: false },
    {
      label: 'Allergy / sinus',
      spoken: 'the allergy and sinus problems',
      weightRelated: false,
    },
    { label: 'Neck or back pain', spoken: 'the back pain', weightRelated: false },
    {
      label: 'Knees, hips, or feet',
      spoken: 'the trouble with your knees and hips',
      weightRelated: false,
    },
    { label: 'Headaches', spoken: 'your headaches', weightRelated: false },
    {
      label: 'Medications',
      spoken: 'your reliance on those medications',
      weightRelated: false,
    },
  ],
  'Skin Tightening': [
    { label: 'Jawline / neck', spoken: 'that jawline and neck area' },
    { label: 'Arms', spoken: 'the crepey skin on your arms' },
    { label: 'Above the knees', spoken: 'that spot above the knees' },
    { label: 'Chest', spoken: 'the chest area' },
    { label: 'Backs of hands', spoken: 'the backs of your hands' },
    {
      label: 'Skin after weight change',
      spoken: 'the areas where the skin didn\u2019t keep up',
    },
  ],
  'Cellulite Reduction': [
    { label: 'Backs of thighs', spoken: 'the backs of your thighs' },
    { label: 'Buttocks', spoken: 'the buttocks area' },
    { label: 'Above the knees', spoken: 'that spot above the knees' },
    {
      label: 'How clothes fit / feel',
      spoken: 'the way your clothes are fitting',
    },
    { label: 'Skin texture / firmness', spoken: 'that skin texture' },
    { label: 'The original area', spoken: 'that original area we treated' },
  ],
  'Red Light / Body Contouring': [
    { label: 'Lower belly', spoken: 'that lower belly' },
    { label: 'Flanks / love handles', spoken: 'those love handles' },
    { label: 'Upper arms', spoken: 'the upper arms' },
    { label: 'Under the chin', spoken: 'that spot under the chin' },
    {
      label: 'How clothes fit',
      spoken: 'the way your clothes are fitting',
    },
    { label: 'Energy / recovery', spoken: 'your energy and recovery' },
  ],
  'Laser Hair Removal': [
    { label: 'The regrowth', spoken: 'the regrowth' },
    {
      label: 'Irritation / ingrowns',
      spoken: 'the irritation and ingrowns',
    },
    { label: 'Underarms', spoken: 'your underarms' },
    { label: 'Legs', spoken: 'your legs' },
    { label: 'Bikini line', spoken: 'the bikini line' },
    { label: 'Face', spoken: 'the facial hair' },
    { label: 'Back', spoken: 'your back' },
    {
      label: 'A treatment they asked about',
      spoken: 'that treatment you\u2019ve been curious about',
    },
  ],
  'Body Waxing': [
    {
      label: 'Routine slipped',
      spoken: 'getting your routine back on track',
    },
    {
      label: 'Irritation / ingrowns',
      spoken: 'the irritation and ingrowns',
    },
    { label: 'Brows', spoken: 'your brows' },
    { label: 'Lip / face', spoken: 'the facial hair' },
    { label: 'Underarms', spoken: 'your underarms' },
    { label: 'Legs', spoken: 'your legs' },
    { label: 'Back', spoken: 'your back' },
    {
      label: 'A service they asked about',
      spoken: 'that service you\u2019ve been curious about',
    },
  ],
  'GLP Patients': [
    { label: 'Weight coming back', spoken: 'the weight coming back' },
    { label: 'Appetite coming back', spoken: 'the appetite coming back' },
    {
      label: 'Old eating habits creeping in',
      spoken: 'getting your eating habits back on track',
    },
    { label: 'Energy dips / fatigue', spoken: 'the energy dips' },
    { label: 'Muscle or strength loss', spoken: 'the muscle and strength loss' },
    { label: 'Sleep trouble', spoken: 'your sleep' },
    { label: 'Joint aches', spoken: 'the joint aches' },
    { label: 'Stress / anxiety', spoken: 'the stress' },
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
