// Relationship tokens: scripts can use {{pt_*}} slots that resolve
// differently when the caller is speaking with a parent/guardian instead of
// the patient. Both tables must define exactly the same keys, otherwise one
// mode renders a raw {{pt_...}} placeholder on the phone. Shared between the
// web player (which substitutes them) and the api-server flow tooling (which
// refuses script content that references a token neither table defines).

export const PATIENT_TOKENS: Record<string, string> = {
  pt_you: 'you',
  pt_you_cap: 'You',
  pt_your: 'your',
  pt_them: 'you',
  pt_they_are: 'you\u2019re',
  pt_get_you_in: 'get you in',
  pt_no_fault: 'it\u2019s not anything you did wrong',
  pt_proud: 'you were so proud of it',
  pt_bite_q:
    'Any changes in the bite? Teeth hitting differently than they used to, or one side doing more of the chewing work?',
  pt_jaw_q:
    'Any jaw soreness, clicking, or tension headaches, especially in the morning?',
  pt_photos_q:
    'And how do you feel about the smile in photos these days? Still showing it off, or any creeping self-consciousness?',
  pt_obj_braces_q: 'Do I have to get braces again?',
  pt_obj_startover_q: 'Do I have to start all over?',
  pt_obj_embarrassed_q: 'I\u2019m embarrassed I stopped wearing my retainer',
  pt_al_photos_q:
    'And how do you feel about your smile in photos and on video calls these days? Be honest, do you still catch yourself doing the closed-lip smile, or angling away from the camera?',
  pt_moved_back_q: 'does it feel like they\u2019ve moved back quite a bit',
  pt_your_file: 'your file',
  pt_smile_bite: 'the smile and the bite',
  pt_mir_q1: 'How long has that been bothering you',
  pt_mir_q2:
    'Is it something you notice here and there, or pretty much every time you see your smile',
  pt_mir_q3:
    'When it\u2019s on your mind, how does it affect your confidence, your photos, the way you feel meeting people',
  pt_floss_q:
    'How about flossing? Any spots where the floss catches, shreds, or just won\u2019t go in? Crowded teeth create tight corners that are almost impossible to keep clean.',
  pt_clean_q:
    'How about cleaning? Any tight spots where the floss catches, shreds, or won\u2019t go in?',
  pt_invested: 'the result you invested in',
  pt_uncover_action:
    'coming in to take care of something you\u2019ve told me is bothering you',
  pt_cost_ask:
    'Can I ask, how much does getting back to feeling the way you did matter to you?',
  pt_bridge_q:
    'you\u2019d really just love to get back to loving your smile again, showing it off without a second thought',
}

export const PARENT_TOKENS: Record<string, string> = {
  pt_you: 'your child',
  pt_you_cap: 'Your child',
  pt_your: 'their',
  pt_them: 'them',
  pt_they_are: 'they\u2019re',
  pt_get_you_in: 'get your child in',
  pt_no_fault: 'it\u2019s not anything you or your child did wrong',
  pt_proud: 'they were so proud of it',
  pt_bite_q:
    'Has your child mentioned any changes in the bite? Teeth hitting differently than they used to, or chewing more on one side?',
  pt_jaw_q:
    'Any complaints of jaw soreness, clicking, or headaches, especially in the morning?',
  pt_photos_q:
    'And how does your child feel about their smile these days? Still showing it off, or any covering the mouth in photos or teasing at school?',
  pt_obj_braces_q: 'Does my child have to get braces again?',
  pt_obj_startover_q: 'Does my child have to start all over?',
  pt_obj_embarrassed_q: 'I feel bad we let the retainer routine slip',
  pt_al_photos_q:
    'And how does your child feel about their smile these days? Still showing it off, or any covering the mouth in photos or teasing at school?',
  pt_moved_back_q: 'are you seeing that they\u2019ve moved back quite a bit',
  pt_your_file: 'your child\u2019s file',
  pt_smile_bite: 'their smile and bite',
  pt_mir_q1: 'How long has this been on your child\u2019s mind',
  pt_mir_q2:
    'Do they notice it here and there, or pretty much every time they see their smile',
  pt_mir_q3:
    'When it\u2019s on their mind, how does it show up in their confidence at school, in photos, around friends',
  pt_floss_q:
    'How about your child\u2019s flossing? Have they mentioned any spots where the floss catches or shreds? Crowded teeth create tight corners that are almost impossible to keep clean.',
  pt_clean_q:
    'How about your child\u2019s cleaning? Have they mentioned any tight spots where the floss catches or shreds?',
  pt_invested: 'the result you\u2019ve both invested in',
  pt_uncover_action:
    'getting them in to take care of something you\u2019ve told me has been bothering them',
  pt_cost_ask:
    'And taking a look is exactly what lets us see what, if anything, is actually needed, so the office can give you a real answer on cost instead of a guess. One thing worth knowing: catching it early usually means a small tweak, and a small tweak is always going to be faster and less expensive than waiting until things have really shifted.',
  pt_bridge_q:
    'you\u2019d really just love to see them loving their smile again, showing it off without a second thought',
}

/** Every pt_* slot the player can fill (union of both tables). */
export const PT_TOKEN_KEYS: readonly string[] = Array.from(
  new Set([...Object.keys(PATIENT_TOKENS), ...Object.keys(PARENT_TOKENS)]),
)

/** Keys present in one table but not the other; empty when the tables agree. */
export function ptTokenKeyMismatches(): { patientOnly: string[]; parentOnly: string[] } {
  const patient = new Set(Object.keys(PATIENT_TOKENS))
  const parent = new Set(Object.keys(PARENT_TOKENS))
  return {
    patientOnly: [...patient].filter((k) => !parent.has(k)).sort(),
    parentOnly: [...parent].filter((k) => !patient.has(k)).sort(),
  }
}
