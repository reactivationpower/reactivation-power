// @ts-nocheck
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
  // Clone of ChiroThin for offices running their own weight-loss program
  // (not ChiroThin, not GLP). Same weightRelated flags so the concern-aware
  // step swap (making_it_real_nw) and uncover-objection swap behave identically.
  'Weight Loss (Not ChiroThin)': [
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
    { label: 'Arms', spoken: 'the thin-looking skin on your arms' },
    { label: 'Above the knees', spoken: 'that spot above the knees' },
    { label: 'Chest', spoken: 'the chest area' },
    { label: 'Backs of hands', spoken: 'the backs of your hands' },
    {
      label: 'Skin after weight change',
      spoken: 'the areas where the skin didn\u2019t keep up',
    },
  ],
  // One chip per question on the Botox question screen, in question order.
  Botox: [
    { label: 'Lines coming back', spoken: 'the lines coming back' },
    { label: 'Dryness / sun spots', spoken: 'the dryness and sun spots' },
    {
      label: 'Jaw clenching / headaches',
      spoken: 'the jaw clenching and headaches',
    },
    { label: 'An upcoming event', spoken: 'that event you have coming up' },
    {
      label: 'A treatment they asked about',
      spoken: 'that treatment you\u2019ve been curious about',
    },
  ],
  // Dental niches: one chip per question on the digging_in screens, in
  // question order. Spoken phrases read after "take a look at ...".
  'Teeth Whitening': [
    { label: 'Staining / dulling', spoken: 'the staining' },
    { label: 'Coffee / tea / wine', spoken: 'the staining from coffee and wine' },
    { label: 'Sensitivity', spoken: 'the sensitivity' },
    {
      label: 'Something else about the smile',
      spoken: 'what you\u2019d like changed about your smile',
    },
    { label: 'An upcoming event', spoken: 'your smile before that event' },
  ],
  // Clear Aligners and Orthodontics carry parent mode, so spoken phrases stay
  // pronoun-free: "the shifting" reads the same whether the caller is
  // speaking with the patient or a parent.
  'Clear Aligners': [
    { label: 'Shifting / crowding', spoken: 'the shifting' },
    { label: 'Retainer routine', spoken: 'the retainers' },
    { label: 'Bite changes', spoken: 'the bite' },
    { label: 'Flossing tight spots', spoken: 'those tight spots when flossing' },
    { label: 'Jaw soreness / headaches', spoken: 'the jaw soreness and headaches' },
    { label: 'Smile in photos', spoken: 'how the smile looks in photos' },
    { label: 'Something the dentist flagged', spoken: 'what the dentist flagged' },
  ],
  'Orthodontics / Braces': [
    { label: 'Shifting / crowding', spoken: 'the shifting' },
    { label: 'Retainer routine', spoken: 'the retainers' },
    { label: 'Bite changes', spoken: 'the bite' },
    { label: 'Flossing tight spots', spoken: 'those tight spots when flossing' },
    { label: 'Jaw soreness / headaches', spoken: 'the jaw soreness and headaches' },
    { label: 'Smile in photos', spoken: 'how the smile looks in photos' },
    { label: 'Something the dentist flagged', spoken: 'what the dentist flagged' },
  ],
  'Dental Implants': [
    {
      label: 'Tenderness / swelling',
      spoken: 'the tenderness around the implant',
    },
    { label: 'Food catching', spoken: 'the food catching around it' },
    { label: 'Bite / chewing', spoken: 'how it feels when you chew' },
    {
      label: 'Other teeth / gums',
      spoken: 'the sensitivity and gum bleeding',
    },
    { label: 'Overdue cleaning', spoken: 'how things look since your last cleaning' },
    { label: 'Smile in photos', spoken: 'your smile' },
    {
      label: 'Health / medication changes',
      spoken: 'the implant alongside those health changes',
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
  // Home services: the "patient" is a customer and the chips are the problems
  // a homeowner names on the questions screen, one per focus branch.
  HVAC: [
    { label: 'Not heating or cooling right', spoken: 'the heating and cooling not keeping up' },
    { label: 'Hot or cold rooms', spoken: 'those hot and cold rooms' },
    { label: 'Dust, allergies, or humidity', spoken: 'the dust and the air in the house' },
    { label: 'New noises or smells', spoken: 'that new noise' },
    { label: 'Higher bills', spoken: 'those higher bills' },
    { label: 'Older system', spoken: 'the age of the system' },
    { label: 'Thermostat', spoken: 'the thermostat' },
  ],
  Plumbing: [
    { label: 'Hot water running out', spoken: 'the hot water running out' },
    { label: 'Slow drains or clogs', spoken: 'those slow drains' },
    { label: 'Drips or running toilets', spoken: 'that drip' },
    { label: 'Low water pressure', spoken: 'the water pressure' },
    { label: 'Water taste, smell, or hard water', spoken: 'the water quality' },
    { label: 'Sump pump', spoken: 'the sump pump' },
    { label: 'Disposal, fixtures, or a project', spoken: 'that project' },
  ],
  // ---------- Facial aesthetics ----------
  // Each chip is one question on that niche's Update-the-File screen, in
  // this order. Questions surface other facial services through what the
  // patient reports; nothing is pitched.
  Fillers: [
    { label: 'Lips', spoken: 'your lips' },
    { label: 'Cheeks / volume loss', spoken: 'the volume in your cheeks' },
    { label: 'Smile lines', spoken: 'the smile lines' },
    { label: 'Under-eye hollows', spoken: 'the hollows under your eyes' },
    { label: 'Jawline / chin', spoken: 'your jawline and chin' },
    { label: 'Lines around the mouth', spoken: 'the lines around your mouth' },
    { label: 'Forehead / frown lines', spoken: 'the lines on your forehead' },
    { label: 'Rough / dull skin', spoken: 'the rough, dull skin' },
    { label: 'Sun spots / uneven tone', spoken: 'the sun spots' },
    { label: 'Loosening / sagging', spoken: 'the loosening' },
  ],
  'IPL / Photofacial': [
    { label: 'Sun spots / brown spots', spoken: 'the sun spots' },
    { label: 'Redness / flushing', spoken: 'the redness' },
    { label: 'Small red veins', spoken: 'those little red veins' },
    { label: 'Uneven skin tone', spoken: 'the uneven skin tone' },
    { label: 'Chest / hands', spoken: 'the spots on your chest and hands' },
    { label: 'Fine lines', spoken: 'the fine lines' },
    { label: 'Rough / dull skin', spoken: 'the rough, dull skin' },
    { label: 'Breakouts', spoken: 'the breakouts' },
    {
      label: 'Home skincare routine',
      spoken: 'getting your skincare routine back on track',
    },
  ],
  'Microneedling / RF Microneedling': [
    { label: 'Acne scars', spoken: 'the acne scars' },
    { label: 'Large pores', spoken: 'the pores' },
    { label: 'Rough / uneven skin', spoken: 'the rough, uneven skin' },
    { label: 'Fine lines', spoken: 'the fine lines' },
    { label: 'Loosening / sagging', spoken: 'the loosening' },
    { label: 'Dull / tired-looking skin', spoken: 'the dull, tired-looking skin' },
    { label: 'Sun spots / dark marks', spoken: 'the dark marks' },
    { label: 'Neck / chest', spoken: 'your neck and chest' },
    { label: 'Stretch marks', spoken: 'the stretch marks' },
  ],
  'Laser Resurfacing': [
    { label: 'Fine lines / wrinkles', spoken: 'the fine lines' },
    { label: 'Sun damage / spots', spoken: 'the sun damage' },
    { label: 'Acne scars', spoken: 'the acne scars' },
    { label: 'Rough / uneven skin', spoken: 'the rough, uneven skin' },
    { label: 'Lines around the mouth', spoken: 'the lines around your mouth' },
    { label: 'Around the eyes', spoken: 'the area around your eyes' },
    { label: 'Neck / chest', spoken: 'your neck and chest' },
    { label: 'Loosening / sagging', spoken: 'the loosening' },
    { label: 'Redness', spoken: 'the redness' },
    {
      label: 'Home skincare routine',
      spoken: 'getting your skincare routine back on track',
    },
  ],
  'Acne / Acne Scarring': [
    { label: 'Breakouts', spoken: 'the breakouts' },
    {
      label: 'Jawline / chin breakouts',
      spoken: 'the breakouts along your jawline',
    },
    { label: 'Dark marks after breakouts', spoken: 'the dark marks' },
    { label: 'Scarring / pitting', spoken: 'the scarring' },
    { label: 'Oily skin / large pores', spoken: 'the oily skin and pores' },
    {
      label: 'Back / chest breakouts',
      spoken: 'the breakouts on your back and chest',
    },
    { label: 'Redness', spoken: 'the redness' },
    {
      label: 'Products not working',
      spoken: 'finding products that actually work',
    },
    { label: 'Covering it with makeup', spoken: 'having to cover it up' },
  ],
  'Pigmentation / Sun Damage': [
    { label: 'Sun spots / age spots', spoken: 'the sun spots' },
    { label: 'Melasma / patches', spoken: 'the darker patches' },
    { label: 'Uneven skin tone', spoken: 'the uneven skin tone' },
    { label: 'Dark marks after breakouts', spoken: 'the dark marks' },
    {
      label: 'Chest / hands / arms',
      spoken: 'the spots on your chest and hands',
    },
    { label: 'Dull skin', spoken: 'the dull skin' },
    { label: 'Fine lines', spoken: 'the fine lines' },
    { label: 'Redness', spoken: 'the redness' },
    {
      label: 'Sunscreen / skincare routine',
      spoken: 'getting your skincare routine back on track',
    },
    { label: 'Covering it with makeup', spoken: 'having to cover it up' },
  ],
  'Rosacea / Redness': [
    { label: 'Flushing / redness', spoken: 'the flushing and redness' },
    { label: 'Small red veins', spoken: 'those little red veins' },
    { label: 'Bumps / breakouts', spoken: 'the bumps and breakouts' },
    {
      label: 'Stinging / sensitive skin',
      spoken: 'the stinging and sensitivity',
    },
    { label: 'Flare-ups / triggers', spoken: 'the flare-ups' },
    { label: 'Nose / cheeks', spoken: 'your nose and cheeks' },
    { label: 'Sun spots / uneven tone', spoken: 'the uneven tone' },
    { label: 'Fine lines', spoken: 'the fine lines' },
    {
      label: 'Products that sting',
      spoken: 'finding products that don\u2019t sting',
    },
    { label: 'Covering it with makeup', spoken: 'having to cover it up' },
  ],
  'Chemical Peels': [
    { label: 'Dull / tired-looking skin', spoken: 'the dull, tired-looking skin' },
    { label: 'Rough / uneven skin', spoken: 'the rough, uneven skin' },
    { label: 'Sun spots / dark marks', spoken: 'the dark marks' },
    { label: 'Breakouts', spoken: 'the breakouts' },
    { label: 'Fine lines', spoken: 'the fine lines' },
    { label: 'Large pores', spoken: 'the pores' },
    { label: 'Melasma / patches', spoken: 'the darker patches' },
    { label: 'Acne scars', spoken: 'the acne scars' },
    { label: 'Neck / chest / hands', spoken: 'your neck, chest, and hands' },
    {
      label: 'Home skincare routine',
      spoken: 'getting your skincare routine back on track',
    },
  ],
  'Facials / HydraFacial': [
    { label: 'Dull skin', spoken: 'the dull skin' },
    { label: 'Dryness / flaking', spoken: 'the dryness' },
    { label: 'Clogged pores / blackheads', spoken: 'the clogged pores' },
    { label: 'Breakouts', spoken: 'the breakouts' },
    { label: 'Oily / shiny skin', spoken: 'the oily skin' },
    { label: 'Rough / uneven skin', spoken: 'the rough, uneven skin' },
    { label: 'Fine lines', spoken: 'the fine lines' },
    { label: 'Sun spots / uneven tone', spoken: 'the uneven tone' },
    { label: 'Redness / sensitivity', spoken: 'the redness and sensitivity' },
    {
      label: 'Home skincare routine',
      spoken: 'getting your skincare routine back on track',
    },
    {
      label: 'An event coming up',
      spoken: 'getting your skin ready for that event',
    },
  ],
  'Medical-Grade Skincare': [
    { label: 'Routine slipped', spoken: 'getting your routine back on track' },
    { label: 'Ran out of products', spoken: 'the products you ran out of' },
    { label: 'Dryness / flaking', spoken: 'the dryness' },
    { label: 'Breakouts', spoken: 'the breakouts' },
    { label: 'Dull skin', spoken: 'the dull skin' },
    { label: 'Sun spots / uneven tone', spoken: 'the uneven tone' },
    { label: 'Fine lines', spoken: 'the fine lines' },
    { label: 'Redness / sensitivity', spoken: 'the redness and sensitivity' },
    { label: 'Large pores / rough skin', spoken: 'the pores and rough skin' },
    { label: 'Sunscreen habit', spoken: 'getting your sunscreen habit back' },
    { label: 'Loosening / sagging', spoken: 'the loosening' },
  ],
}

/** Fallback used when the caller never taps a chip — keeps every sentence
 * grammatical and generic, exactly like the script before this feature. */
export const CONCERN_FALLBACK = 'what\u2019s been bothering you the most'
