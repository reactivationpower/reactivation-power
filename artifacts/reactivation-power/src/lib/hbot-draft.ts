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
  S('open_status', 'Opening: Status Check',
`{{contact_first_name}}, how have you been since your last hyperbaric sessions with us?

(Let them answer. Do not assume they improved or completed treatment.)`),
  S('resp_completed_well', 'Completed and Doing Well',
`That's good to hear, {{contact_first_name}}. Finishing a plan is something to be glad about.

(Nothing further is needed unless they bring something up.)

While I have you, can I ask a few quick questions to update your file?

(Wait for the yes.)`),
  S('resp_returning', 'Concern Returning',
`I'm sorry to hear that, {{contact_first_name}}. Thank you for telling me.

(Do not guess why it came back.)

While I have you, can I ask a few quick questions to update your file?

(Wait for the yes.)`),
  S('resp_still_present', 'Still Present / No Improvement',
`Thank you for being straight with me, {{contact_first_name}}. That's useful for us to know.

(Do not suggest more sessions. Do not say improvement is coming.)

While I have you, can I ask a few quick questions to update your file?

(Wait for the yes.)`),
  S('resp_stopped_early', 'Stopped Early',
`Thanks for telling me, {{contact_first_name}}. People stop for all kinds of reasons, and that's your call.

(Do not suggest they should have continued. Listen for any reaction to treatment.)

If you don't mind me asking, what led you to stop?

(Let them answer. Note only what they describe.)`),
  S('permission', 'Permission',
`While I have you, can I ask a few quick questions to update your file?

(Wait for the yes.)`),
  S('digging_in_well', 'Questions: Update the File', `${DIG_INTRO}\n\n${DIG_CLOSE_NEW}`),
  S('digging_in_returning', 'Questions: Update the File (Returning)', `${DIG_INTRO}\n\n${DIG_CLOSE_RET}`),
  S('digging_in_still', 'Questions: Update the File (Still Present)', `${DIG_INTRO}\n\n${DIG_CLOSE_RET}`),
  S('making_it_real', 'Making It Real',
`{{contact_first_name}}, I'd like to ask three quick questions about {{main_concern}}.

Has it been bothering you for a week or two, or longer than that?

(Let them answer.)

Does it bother you once or twice a month, or more often than that?

(Let them answer.)

When it's at its worst, does it interfere with work, home, or your own time?

(Let them answer. Note only what they describe.)`),
  S('review', 'Read-Back',
`{{contact_first_name}}, let me make sure I have this right.

(Read back their answers about how long, how often, and work, home, or their own time.)

Did I get that right?

(Let them answer. Correct the notes if needed.)`),
  S('recommend', 'Permission to Recommend',
`{{contact_first_name}}, I'd like to help you get a clear answer about the next step. Can I make a recommendation?

(Wait for the yes.)

Let's arrange a visit so {{provider_name}} can review {{main_concern}} and any changes in your health.

We'll talk through whether further care here makes sense. That might not mean more hyperbaric sessions.

If another kind of care is needed, we'll explain the next step. Does that sound reasonable?

(Tap their answer. Book a review visit, not a treatment session.)`),
  S('book_review', 'Clinician Review Visit',
`Wonderful. Let's find a time for {{provider_name}} to review things with you.

(Offer review visit times only. Do not book a treatment session, state a session count, or discuss price unless asked.)

Which day tends to work best for you?

(Let them answer. Confirm the day and time, then close.)`),
  S('obj_hub', 'Objection: What Did They Say?',
`(Listen fully. Acknowledge first. Then choose the closest objection below.)`),
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
  S('exit_healthy', 'Healthy Completion: Nothing Bothering Them',
`That's good to hear, {{contact_first_name}}. There's nothing more we need from you.

(No follow-up is implied. Do not suggest ongoing sessions.)

If anything changes, you're always welcome to call us. Take care.`),
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

const URGENT = (f: string) => C(f, 'They report an emergency or sudden change', 'handoff_urgent', 'negative')
const REACT = (f: string) => C(f, 'They mention a reaction to past treatment', 'handoff_reaction', 'caution')
const DECLINE = (f: string) => C(f, 'They decline', 'exit_decline', 'negative')
const OBJ = (f: string) => C(f, 'They raise an objection', 'obj_hub', 'objection')

const digChoices = (f: string) => [
  C(f, 'They named a concern', 'making_it_real', 'positive'),
  C(f, 'Nothing bothers them', 'exit_healthy'),
  REACT(f),
  URGENT(f),
  DECLINE(f),
]
const objChoices = (f: string) => [
  C(f, 'They agree to a review visit', 'book_review', 'positive'),
  C(f, 'They raise a different objection', 'obj_hub', 'objection'),
  REACT(f),
  URGENT(f),
  DECLINE(f),
]

export const hbotDraftChoices: ScriptFlowChoice[] = [
  C('open_status', 'Doing well / finished their sessions', 'resp_completed_well', 'positive'),
  C('open_status', 'The original concern is coming back', 'resp_returning', 'caution'),
  C('open_status', 'Still having it / no improvement', 'resp_still_present', 'caution'),
  C('open_status', 'They stopped early', 'resp_stopped_early', 'caution'),
  C('open_status', 'They mention a reaction to past treatment', 'handoff_reaction', 'caution'),
  URGENT('open_status'),
  DECLINE('open_status'),
  C('resp_completed_well', 'They said yes', 'digging_in_well', 'positive'),
  C('resp_completed_well', 'They have nothing to add', 'exit_healthy'),
  DECLINE('resp_completed_well'),
  URGENT('resp_completed_well'),
  C('resp_returning', 'They said yes', 'digging_in_returning', 'positive'),
  DECLINE('resp_returning'),
  URGENT('resp_returning'),
  C('resp_still_present', 'They said yes', 'digging_in_still', 'positive'),
  DECLINE('resp_still_present'),
  URGENT('resp_still_present'),
  C('resp_stopped_early', 'They shared why', 'permission', 'positive'),
  C('resp_stopped_early', 'They mention a reaction to past treatment', 'handoff_reaction', 'caution'),
  URGENT('resp_stopped_early'),
  DECLINE('resp_stopped_early'),
  C('permission', 'They said yes', 'digging_in_returning', 'positive'),
  DECLINE('permission'),
  URGENT('permission'),
  ...digChoices('digging_in_well'),
  ...digChoices('digging_in_returning'),
  ...digChoices('digging_in_still'),
  C('making_it_real', 'Continue to read-back', 'review', 'positive'),
  REACT('making_it_real'),
  URGENT('making_it_real'),
  DECLINE('making_it_real'),
  C('review', 'They confirmed it', 'recommend', 'positive'),
  C('review', 'They corrected something', 'review', 'caution'),
  URGENT('review'),
  DECLINE('review'),
  C('recommend', 'They said yes to a review visit', 'book_review', 'positive'),
  OBJ('recommend'),
  REACT('recommend'),
  URGENT('recommend'),
  DECLINE('recommend'),
  C('book_review', 'Visit confirmed', 'exit_review', 'positive'),
  OBJ('book_review'),
  DECLINE('book_review'),
  C('obj_hub', 'Cost', 'obj_cost'),
  C('obj_hub', 'Coverage / insurance', 'obj_coverage'),
  C('obj_hub', 'Time', 'obj_time'),
  C('obj_hub', 'Need to ask spouse', 'obj_spouse'),
  C('obj_hub', 'Need to think', 'obj_think'),
  C('obj_hub', 'Send me information', 'obj_send_info'),
  C('obj_hub', 'Seeing another provider', 'obj_other_provider'),
  C('obj_hub', 'Chamber felt closed in', 'obj_chamber_anxiety'),
  REACT('obj_hub'),
  URGENT('obj_hub'),
  DECLINE('obj_hub'),
  ...['obj_cost', 'obj_coverage', 'obj_time', 'obj_chamber_anxiety'].flatMap(objChoices),
  C('obj_cost', 'They want the office to check the cost', 'exit_information'),
  C('obj_coverage', 'They want the office to check billing', 'exit_information'),
  ...['obj_spouse', 'obj_think'].flatMap(f => [
    C(f, 'They ask us to check back', 'exit_follow_up'),
    C(f, 'They want to leave it with them', 'exit_decline'),
    OBJ(f), REACT(f), URGENT(f),
  ]),
  C('obj_send_info', 'They request approved information', 'exit_information'),
  OBJ('obj_send_info'), REACT('obj_send_info'), URGENT('obj_send_info'), DECLINE('obj_send_info'),
  C('obj_other_provider', 'They want to stay with their current provider', 'exit_decline'),
  C('obj_other_provider', 'They request a review here', 'book_review'),
  OBJ('obj_other_provider'), REACT('obj_other_provider'), URGENT('obj_other_provider'), DECLINE('obj_other_provider'),
]

/** Screens reachable via the draft-only reviewer selector. */
export const HBOT_DRAFT_SCREENS = hbotDraftSteps.map((s) => ({ key: s.step_key, title: s.title }))

/** Only an explicit true flag appends the draft niche. */
export function withHbotDraft(niches: Niche[], flag: boolean | undefined | null): Niche[] {
  return flag === true ? [...niches, HBOT_DRAFT_NICHE] : niches
}
