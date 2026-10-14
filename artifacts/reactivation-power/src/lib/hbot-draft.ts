// Review-only HBOT caller script draft. Local, practice-only: never saved,
// never merged with live/default step text (every step below is self-contained).
import type { Niche, ScriptFlowChoice, ScriptFlowStep, ScriptFlowVariant } from '@workspace/shared/types'
import type { ConcernOption } from '@workspace/niche-catalog'

export const HBOT_DRAFT_NICHE_ID = 'hbot-draft-review'
export const HBOT_DRAFT_LABEL = 'HBOT \u2014 Draft for Review'

export const HBOT_DRAFT_NICHE: Niche = {
  id: HBOT_DRAFT_NICHE_ID,
  name: HBOT_DRAFT_LABEL,
  sort_order: 9999,
  is_active: true,
  sector: 'healthcare',
  created_at: '1970-01-01T00:00:00.000Z',
}

/** Eight approved topics, one chip each, approved order. */
export const HBOT_CONCERN_OPTIONS: ConcernOption[] = [
  { label: 'Fatigue / low energy', spoken: 'the fatigue or low energy' },
  { label: 'Brain fog / concentration', spoken: 'the brain fog or trouble concentrating' },
  { label: 'Ongoing pain / discomfort', spoken: 'the ongoing pain or discomfort' },
  { label: 'Sleep problems', spoken: 'the trouble with sleep' },
  { label: 'Slow healing / lingering injury', spoken: 'the healing or injury concern' },
  { label: 'Headaches / migraines', spoken: 'the headaches or migraines' },
  { label: 'Numbness / tingling', spoken: 'the numbness or tingling' },
  { label: 'Recovery after activity', spoken: 'the trouble recovering after activity' },
]

const DIG_INTRO = `(Write down every concern they name.)

{{contact_first_name}}, I'm going to run through a few things people often notice. Just say yes if you get them at all, even if they're mild or come and go.

Have you noticed fatigue or low energy?

Any brain fog or trouble concentrating?

Are you having any ongoing pain or discomfort?

How's your sleep been?

Any lingering injuries or concerns about slow healing?

Have you been getting headaches or migraines?

Any numbness, tingling, or burning sensations?

Are you having trouble recovering after physical activity?`

const DIG_CLOSE_NEW = `Of those, which one bothers you the most?

(Tap their answer below.)`
const DIG_CLOSE_RET = `Between {{complaint_reference}} and these concerns, which one bothers you the most?

(Tap their answer below.)`

let order = 0
const S = (step_key: string, title: string, content: string): ScriptFlowStep => ({
  id: `hbot-step-${step_key}`,
  niche_id: HBOT_DRAFT_NICHE_ID,
  step_key,
  title,
  content,
  sort_order: order++,
  updated_at: '1970-01-01T00:00:00.000Z',
})

export const hbotDraftSteps: ScriptFlowStep[] = [
  S('open', 'The Open',
`Hi, this is {{caller_name}} with {{provider_name}}'s office. Is {{contact_first_name}} available, please?

Hi {{contact_first_name}}. We're updating files for patients we haven't seen in a while, and yours came up. {{asked_by_provider}} Do you have a quick minute?`),
  S('open_status', 'Opening Question',
`So {{contact_first_name}}, how have you felt since your hyperbaric care with us? I usually hear one of three things. Still feeling great, starting to come back a little, or pretty much back to where you started. Which one is closest for you?

(Only three answers. Tap the one you hear.)`),
  S('resp_completed_well', 'Still Feeling Great',
`That's great to hear, {{contact_first_name}}. That's exactly what we hope for when someone finishes care with us. {{provider_name}} will be glad to know you're still doing well.

(Let them respond, then continue.)`),
  S('resp_returning', 'Starting to Come Back',
`Thanks for telling me, {{contact_first_name}}. What have you noticed coming back?

(Let them answer. Stay warm. Do not book yet.)`),
  S('resp_still_present', 'Fully Back',
`I'm sorry to hear that, {{contact_first_name}}. What has changed since we last saw you?

(Let them answer. Stay warm. Do not book yet.)`),
  S('resp_no_improvement', 'No Improvement',
`I'm sorry to hear that, {{contact_first_name}}. What were you hoping would change?

(Let them answer. Do not assume more sessions would help.)`),
  S('resp_stopped_early', 'Stopped Early',
`Thanks for telling me, {{contact_first_name}}. What led you to stop?

(Let them answer. Stay warm. Listen for any reaction to treatment. Do not suggest they should have continued.)`),
  S('permission_well', 'Ask Permission',
`While I have you, can I ask you a few quick questions so I can complete your file update?

(Wait for the yes.)`),
  S('permission_returning', 'Transition: Ask Permission',
`{{contact_first_name}}, we'll come back to the concern you mentioned. First, can I ask a few quick questions so your file is up to date?

(Wait for the yes.)`),
  S('permission', 'Transition: Ask Permission',
`{{contact_first_name}}, we'll come back to what you mentioned. First, can I ask a few quick questions so your file is up to date?

(Wait for the yes.)`),
  S('digging_in_well', 'Questions: Update the File', `${DIG_INTRO}\n\n${DIG_CLOSE_NEW}`),
  S('digging_in_returning', 'Questions: Update the File (Returning)', `${DIG_INTRO}\n\n${DIG_CLOSE_RET}`),
  S('digging_in_still', 'Questions: Update the File (Still Present)', `${DIG_INTRO}\n\n${DIG_CLOSE_RET}`),
  S('making_it_real', 'Making It Real',
`{{contact_first_name}}, I'd like to ask three quick questions about {{main_concern}}. This will help us update your file.

How long has it been bothering you, like a week or two, or longer than that?

(Let them answer. If it fits, you can say "Got it.")

Is it something you experience like 1 to 2 times a month, or is it more often than that?

(Let them answer. If it fits, you can say "I see." or "I understand.")

When it's at its worst, does it ever interfere with work, at home, or relaxing and doing your own thing?

(Let them answer. If they name an impact, reflect only what they said about work, home, or their own time. If not, you can say "Got it, thank you.")`),
  S('review', 'The Review',
`{{contact_first_name}}, let me make sure I have this right.

(Read back their three answers: how long, how often, what it gets in the way of. Use only what they said.)

Did I get that right?

(Let them answer. If they correct you, take the correction and move on.)`),
  S('recommend', 'The Recommendation',
`{{contact_first_name}}, that's worth getting looked at instead of just dealing with it. Can I make a recommendation?

(Wait for the yes.)

Let's get you in so {{provider_name}} can take a look at {{main_concern}}. We'll talk through whether further care here makes sense. If it's not the right fit, we'll say so. Either way you'll know where you stand. Does that sound reasonable?

(Tap what you hear. A review visit is not clearance for hyperbaric treatment.)`),
  S('book_review', 'Scheduling: Review Visit',
`Wonderful. Let's find a time for {{provider_name}} to review things with you.

(Offer review visit times only. Do not book a treatment session, state a session count, or discuss price unless asked.)

Which day tends to work best for you?

(Let them answer. Confirm the day and time, then close.)`),
  S('bridge_no', 'Not Quite / They Hesitate',
`{{contact_first_name}}, I don't want to assume anything. Is it the timing, or is something else holding you back?

(Stay easy about it. Let them answer.)`),
  S('obj_hub', 'Uncover the Real Concern',
`I understand, {{contact_first_name}}. What would keep you from coming in for a review visit?

(Let them answer. Then tap what you hear.)`),
  S('obj_cost', 'Objection: Cost',
`I understand, {{contact_first_name}}. Cost matters.

What part of the cost are you most concerned about?

(Let them answer.)

The visit is with {{provider_name}}, to review where things stand. I can only share prices the office has confirmed, and I don't want to guess about anything.

Would you like me to check on that for you, or would you rather leave it for now?

(Tap their answer.)`),
  S('obj_coverage', 'Objection: Coverage',
`That's a fair question, {{contact_first_name}}.

What have you been told about coverage so far?

(Let them answer.)

I can't promise what any plan will pay. The office can tell you what it has confirmed about billing for the review visit.

Would you like the office to go over that with you?

(Tap their answer.)`),
  S('obj_time', 'Objection: Time',
`I hear you, {{contact_first_name}}. Your time matters.

What does your week usually look like?

(Let them answer.)

The visit is a review with {{provider_name}}. I can't say in advance what, if anything, would come after it.

Would you like to look at a time that fits around your schedule?

(Tap their answer.)`),
  S('obj_spouse', 'Objection: Spouse / Family',
`That makes sense, {{contact_first_name}}. It's good to talk it over.

Is there anything you'd like me to be ready to answer for them?

(Let them answer.)

I won't claim a review will change anything. It's simply a chance to go over where things stand.

Would it help if I called back after you've had a chance to talk?

(Tap their answer.)`),
  S('obj_think', 'Objection: Need to Think',
`Of course, {{contact_first_name}}. No rush.

Is there something specific you'd like to think through?

(Let them answer.)

I'll note that you're thinking it over. Nothing is decided on this call.

Would you like us to check back in a while, or leave it with you?

(Tap their answer.)`),
  S('obj_send_info', 'Objection: Send Information',
`Happy to, {{contact_first_name}}.

What would you most like to see in it?

(Let them answer.)

I can pass along only what the office has approved to share.

Would you like me to note your preferred way to receive it, and check back afterward?

(Tap their answer.)`),
  S('obj_other_provider', 'Objection: Other Provider',
`That's completely fine, {{contact_first_name}}, and your current care matters.

Are you happy with how that care is going?

(Let them answer.)

Nothing here replaces what another provider has advised. A review would simply be an extra set of eyes, only if you want it.

Would you like to leave it with your current provider for now?

(Tap their answer.)`),
  S('obj_chamber_anxiety', 'Objection: Chamber Felt Closed In',
`Thank you for telling me, {{contact_first_name}}. That's a real experience and a common one to mention.

(Do not promise a different chamber or setup exists.)

Would you like to talk that over with {{provider_name}}, or would you rather not?

(Let them answer.)

Either answer is fine. Which would you prefer?

(Tap their answer.)`),
  S('handoff_reaction', 'Clinical Handoff: Prior Reaction',
`(Caller instruction, not for reading aloud: pause any treatment booking. Do not say it is normal or harmless. Do not advise on medication or next steps.)

Thank you for telling me that, {{contact_first_name}}. I want to make sure {{provider_name}} hears about it directly.

I'm going to pass this to the clinical team, and someone will follow up with you.

(Write down exactly what they described, in their words. Log it for clinical review per office policy.)`),
  S('handoff_urgent', 'Clinical Handoff: Urgent Concern',
`(Caller instruction, not for reading aloud: stop the ordinary script. If it sounds like an emergency, follow the office's clinician-approved urgent guidance. Do not judge urgency yourself. Do not book treatment.)

{{contact_first_name}}, thank you for telling me. I want you to get the right help for this.

(Follow the office's approved urgent and emergency guidance now. Notify the clinical team.)`),
  S('exit_decline', 'Respectful Decline',
`Understood, {{contact_first_name}}. I appreciate your time, and I'll respect that.

(Note their preference. Do not push.)

If anything changes, you're always welcome to call us. Take care.`),
  // Retain the existing key so an open review session can display the corrected screen.
  S('exit_healthy', 'Nothing Found: Why Did They Stop?',
`{{contact_first_name}}, I'm glad you're still feeling good.

Can I ask what changed that led you to stop coming in?

(Let them answer. Do not argue with it.)

(Tap the reason they give.)`),
  S('lapsed_felt_fine', 'Reason: Feeling Fine',
`That makes sense, {{contact_first_name}}. When you feel good, coming in stops feeling urgent. A check-in lets {{provider_name}} review how you've been doing.

Would you like to keep feeling this way?

(Let them answer.)

Was anything else holding you back?

(If they share another reason, tap that reason. Otherwise, continue.)

Can I make a recommendation?

(Wait for the yes.)

Let's get a check-in on the schedule. Does that sound reasonable?`),
  S('lapsed_cost', 'Reason: Cost or Insurance',
`I understand, {{contact_first_name}}. A check-in is one visit, and you aren't committing to more care. We can explain the cost before you decide anything.

Would that help?

(Let them answer.)

(Do not quote prices, packages, or discounts.)

Was anything else holding you back?

(If they share another reason, tap that reason. Otherwise, continue.)

Can I make a recommendation?

(Wait for the yes.)

Let's get a check-in on the schedule. Does that sound reasonable?`),
  S('lapsed_busy', 'Reason: Life Got Busy',
`I hear you, {{contact_first_name}}. Life fills up fast, and appointments get pushed down the list. We can find a time that works around your schedule.

Would that work?

(Let them answer.)

Was anything else holding you back?

(If they share another reason, tap that reason. Otherwise, continue.)

Can I make a recommendation?

(Wait for the yes.)

Let's find an easy time for a check-in. Does that sound reasonable?`),
  S('lapsed_wait_pain', 'Reason: Waiting for Pain',
`That's fair, {{contact_first_name}}. You don't have to wait until something bothers you to ask {{provider_name}} about how you've been doing.

Would a check-in be helpful?

(Let them answer.)

Was anything else holding you back?

(If they share another reason, tap that reason. Otherwise, continue.)

Can I make a recommendation?

(Wait for the yes.)

Let's get a check-in on the schedule. Does that sound reasonable?`),
  S('lapsed_moved', 'Reason: Moved or Changed Offices',
`That's understandable, {{contact_first_name}}. Things change. If you're still nearby, we'd be glad to see you again. Your history is already in your file.

Would coming back here be easier?

(Let them answer.)

Was anything else holding you back?

(If they share another reason, tap that reason. Otherwise, continue.)

Can I make a recommendation?

(Wait for the yes.)

Let's get a check-in on the schedule. Does that sound reasonable?`),
  S('exit_review', 'Review Visit: Closing',
`Thank you, {{contact_first_name}}. We'll see you for the review visit at the time we confirmed.

(Repeat the agreed day and time. This preview does not book an appointment.)

Take care.`),
  S('exit_follow_up', 'Requested Follow-Up: Closing',
`Of course, {{contact_first_name}}. When would you prefer us to check back?

(Let them answer. Note only the follow-up they requested. This preview does not save or schedule anything.)

Thank you for your time. Take care.`),
  S('exit_information', 'Requested Information: Closing',
`Thank you, {{contact_first_name}}. I'll note what you'd like the office to check or send.

(Confirm their preferred contact method. Use only office-approved information. This preview does not send anything.)

Take care.`),
]

let cid = 0
const C = (from: string, label: string, to: string | null, variant: ScriptFlowVariant = 'default'): ScriptFlowChoice => ({
  id: `hbot-choice-${cid++}`,
  niche_id: HBOT_DRAFT_NICHE_ID,
  from_step_key: from,
  label,
  to_step_key: to,
  variant,
  sort_order: cid,
})

// Former-patient reactivation follows the approved Chiro-family button pattern.
// These supplemental drafts remain available only through Jump to screen.
export const HBOT_REVIEW_ONLY_SCREEN_KEYS = [
  'resp_no_improvement', 'resp_stopped_early', 'handoff_reaction', 'handoff_urgent',
]
const objectionChoices = (f: string) => [
  C(f, '“It’s the cost or insurance”', 'obj_cost', 'objection'),
  C(f, '“I’m worried about the time”', 'obj_time', 'objection'),
  C(f, '“I need to talk to my spouse”', 'obj_spouse', 'objection'),
  C(f, '“I need to think about it”', 'obj_think', 'objection'),
  C(f, '“Just send me some info”', 'obj_send_info', 'objection'),
  C(f, '“I’m considering another option”', 'obj_other_provider', 'objection'),
  C(f, '“What about coverage?”', 'obj_coverage', 'objection'),
  C(f, '“The chamber felt closed in”', 'obj_chamber_anxiety', 'objection'),
]
const objChoices = (f: string) => [
  C(f, 'Resolved: back to scheduling', 'book_review', 'positive'),
  C(f, 'Another concern came up', 'obj_hub', 'objection'),
]

export const hbotDraftChoices: ScriptFlowChoice[] = [
  C('open', 'Patient is on the line: continue', 'open_status'),
  C('open_status', '“Still feeling great”', 'resp_completed_well', 'positive'),
  C('open_status', '“It’s starting to come back again”', 'resp_returning', 'caution'),
  C('open_status', '“Pretty much back to where I was”', 'resp_still_present', 'negative'),
  C('resp_completed_well', 'They confirmed it still feels good', 'permission_well'),
  C('resp_returning', 'They explained what changed', 'permission_returning'),
  C('resp_still_present', 'They explained what changed', 'permission'),
  C('resp_stopped_early', 'They shared why', 'permission'),
  C('resp_no_improvement', 'They explained what they hoped for', 'permission'),
  C('permission_well', '“Yes, that’s okay”', 'digging_in_well'),
  C('permission_returning', '“Yes, that’s okay”', 'digging_in_returning'),
  C('permission', '“Yes, that’s okay”', 'digging_in_still'),
  C('digging_in_well', 'They named their biggest concern', 'making_it_real', 'caution'),
  C('digging_in_well', 'Nothing is bothering them', 'exit_healthy', 'positive'),
  C('exit_healthy', '"I was feeling fine. Didn\'t think I needed it"', 'lapsed_felt_fine'),
  C('exit_healthy', '“It was the cost or insurance”', 'lapsed_cost'),
  C('exit_healthy', '“Life got busy”', 'lapsed_busy'),
  C('exit_healthy', '"I\'ll come back if it hurts again"', 'lapsed_wait_pain'),
  C('exit_healthy', '“I moved or tried another office”', 'lapsed_moved'),
  ...['lapsed_felt_fine', 'lapsed_cost', 'lapsed_busy', 'lapsed_wait_pain', 'lapsed_moved'].flatMap(f => [
    C(f, '“Yes, that sounds reasonable”', 'book_review', 'positive'),
    C(f, 'Another reason came up', 'exit_healthy'),
  ]),
  C('digging_in_returning', 'They named their biggest concern', 'making_it_real', 'caution'),
  C('digging_in_still', 'They named their biggest concern', 'making_it_real'),
  C('making_it_real', 'Continue to the review', 'review'),
  C('review', 'They agreed with the recap', 'recommend', 'positive'),
  C('review', 'Not quite / they hesitate', 'bridge_no', 'negative'),
  C('bridge_no', 'They’re ready to move forward', 'recommend', 'positive'),
  ...objectionChoices('bridge_no'),
  C('recommend', '“Yes, that sounds reasonable”', 'book_review', 'positive'),
  C('recommend', 'Hesitant or soft no', 'obj_hub', 'caution'),
  ...objectionChoices('recommend'),
  C('book_review', 'Visit confirmed', 'exit_review', 'positive'),
  C('obj_hub', 'They’re ready: schedule', 'book_review', 'positive'),
  ...objectionChoices('obj_hub'),
  ...['obj_cost', 'obj_coverage', 'obj_time', 'obj_chamber_anxiety'].flatMap(objChoices),
  C('obj_cost', 'They want the office to check the cost', 'exit_information'),
  C('obj_cost', 'They want to leave it for now', 'exit_decline'),
  C('obj_coverage', 'They want the office to check billing', 'exit_information'),
  C('obj_chamber_anxiety', 'They would rather not', 'exit_decline'),
  ...['obj_spouse', 'obj_think'].flatMap(f => [
    C(f, 'They ask us to check back', 'exit_follow_up'),
    C(f, 'They want to leave it with them', 'exit_decline'),
    C(f, 'Another concern came up', 'obj_hub', 'objection'),
  ]),
  C('obj_send_info', 'They request approved information', 'exit_information'),
  ...objChoices('obj_send_info'),
  C('obj_other_provider', 'They want to stay with their current provider', 'exit_decline'),
  C('obj_other_provider', 'They request a review here', 'book_review'),
  C('obj_other_provider', 'Another concern came up', 'obj_hub', 'objection'),
]

/** Screens reachable via the draft-only reviewer selector. */
export const HBOT_DRAFT_SCREENS = hbotDraftSteps.map((s) => ({ key: s.step_key, title: s.title }))

/** Only an explicit true flag appends the draft niche. */
export function withHbotDraft(niches: Niche[], flag: boolean | undefined | null): Niche[] {
  return flag === true ? [...niches, HBOT_DRAFT_NICHE] : niches
}
