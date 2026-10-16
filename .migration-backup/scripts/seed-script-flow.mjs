import pg from 'pg'

const client = new pg.Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

await client.query(`
  create table if not exists script_flow_steps (
    id uuid primary key default gen_random_uuid(),
    niche_id uuid references niches(id) on delete cascade,
    step_key text not null,
    title text not null,
    content text not null,
    sort_order int not null default 0,
    updated_at timestamptz not null default now()
  )
`)
await client.query(`
  create unique index if not exists script_flow_steps_niche_key
  on script_flow_steps (coalesce(niche_id::text, 'general'), step_key)
`)
await client.query(`
  create table if not exists script_flow_choices (
    id uuid primary key default gen_random_uuid(),
    niche_id uuid references niches(id) on delete cascade,
    from_step_key text not null,
    label text not null,
    to_step_key text,
    variant text not null default 'default',
    sort_order int not null default 0
  )
`)

// Reset general (niche_id null) flow
await client.query('delete from script_flow_steps where niche_id is null')
await client.query('delete from script_flow_choices where niche_id is null')

const CONFIRM =
  '\n\nConfirm and continue: Does that help put your mind at ease? (Wait for a fast yes.) Do you have any other questions or concerns?'

const steps = [
  {
    key: 'open',
    title: 'The Professional Open',
    content: `Hi, this is {{caller_name}} with {{provider_name}}'s office. Is {{contact_first_name}} available, please?

Hi {{contact_first_name}}, the reason I'm calling is that we're doing file updates on our patients we haven't seen in the last few months, and we came across yours. {{provider_name}} specifically asked me to call so we can update your file over the phone. Do you have a quick minute?`,
  },
  {
    key: 'opening_question',
    title: 'The Opening Question',
    content: `So {{contact_first_name}}, how have things been going since you finished with us? Are you still doing great and feeling the way you did when you finished, is it starting to come back a little, or are you pretty much back to where you were before you came in?

(This question has only three possible answers — click the one you hear.)`,
  },
  {
    key: 'resp_doing_great',
    title: 'They\u2019re Still Doing Great',
    content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still doing great. Do you remember how pleased you were when you finished and saw your results?

(Let them respond — always remind them how good they felt.)`,
  },
  {
    key: 'resp_coming_back',
    title: 'It\u2019s Starting to Come Back',
    content: `{{contact_first_name}}, I appreciate you sharing that, and that does happen over time. I remember how well you were doing and how happy you were when we finished — and I'm sure you remember that too?

(Let them confirm.)`,
  },
  {
    key: 'resp_fully_back',
    title: 'It\u2019s Fully Back',
    content: `Oh {{contact_first_name}}, I'm sorry to hear that, and I understand how discouraging that can be. I remember how good you were doing and how happy you were when we finished. What do you think brought it back — just time and life, or something specific?

(Let them answer. Be empathetic, and do NOT try to book yet.)`,
  },
  {
    key: 'doing_well_variant',
    title: 'Doing Well but Lapsed — Stay Ahead of It',
    content: `{{contact_first_name}}, I'm so glad you're still doing great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the goal is always to stay ahead of it, because once things are going well, a periodic check is what keeps a problem from sneaking back. Are you noticing any little early signs you'd like to stay ahead of?

(If no early signs, close toward a regular rhythm:) ...the best way to protect all the progress you made is to come in for a check and stay on a simple maintenance schedule, so you stay ahead of it instead of waiting for it to fully come back.`,
  },
  {
    key: 'transition',
    title: 'The Transition',
    content: `Well, that's exactly why I'm glad we connected today. Let me ask you a few quick questions so I can update your file properly — is that okay?`,
  },
  {
    key: 'digging_in',
    title: 'Digging In — Update the File',
    content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one at a time, acknowledge briefly, and note which are present. Do not dig into any single one yet.)

— Is the concern you originally came in for starting to come back?

— Any related symptoms or issues?

— Is it getting in the way of everyday things you want to do?

— Is it affecting your sleep, energy, or comfort?

— Is it affecting you at work, or making your day harder than it should be?

— Is it keeping you from activities, hobbies, or time with family?

— Are you feeling self-conscious, frustrated, or worried about where it's heading?

— Is there anything coming up where you'd love to feel your best?

— Are you starting to wish you could get back to how you felt when you finished?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
  },
  {
    key: 'making_it_real',
    title: 'Making It Real',
    content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been coming back? A few weeks, a month or two?

How often — is it here and there, or is it pretty much every day at this point?

How it affects you — when it's bothering you, how does it affect your day, your work, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
  },
  {
    key: 'review',
    title: 'The Review & Bridge to Emotion',
    content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to feeling the way you did when you finished — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
  },
  {
    key: 'recommendation',
    title: 'The Magic Question & Recommendation',
    content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back in is the right move to get you back to how you felt before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
  },
  {
    key: 'uncover',
    title: 'Uncover the Real Concern',
    content: `I understand, {{contact_first_name}}. Let me ask — what is it that would keep you from coming in to take care of something you've told me is bothering you?

(Listen. Then click the objection you hear, or re-ask the scheduling question if they're ready.)`,
  },
  {
    key: 'obj_taken_care_of',
    title: 'Objection: \u201cI thought it was taken care of for good\u201d',
    content: `I completely understand, and that's a fair thing to bring up. These things can come back over time, which is completely normal — and that's exactly why a check-in makes sense, so {{provider_name}} can see what's going on before it gets worse.${CONFIRM}`,
  },
  {
    key: 'obj_cost',
    title: 'Objection: Cost or Insurance',
    content: `(Acknowledge it, then reframe gently around how much getting back to how they felt matters to them. You are scheduling an evaluation — not asking them to commit to anything today.)

{{contact_first_name}}, I completely understand. I want to be clear — this first step is simply an appointment so {{provider_name}} can take a look. You're not committing to anything today. Can I ask — how much does getting back to feeling the way you did matter to you?

(Do NOT improvise pricing, packages, or discounts on the call — let the office handle specifics.)${CONFIRM}`,
  },
  {
    key: 'obj_other_option',
    title: 'Objection: \u201cI\u2019m considering another option\u201d',
    content: `That makes sense, and that's exactly the kind of thing {{provider_name}} can talk through with you at the appointment — so you have all the information to make the best decision.${CONFIRM}`,
  },
  {
    key: 'obj_time',
    title: 'Objection: \u201cI don\u2019t have time\u201d',
    content: `I completely understand, {{contact_first_name}} — life gets busy. The first step is simply an appointment and {{provider_name}}'s evaluation, and we'll work around your schedule.${CONFIRM}`,
  },
  {
    key: 'obj_spouse',
    title: 'Objection: \u201cI need to talk to my spouse\u201d',
    content: `That makes complete sense. What most people find helpful is coming in for the evaluation first — that way you'll both have real information to decide with, instead of guessing.${CONFIRM}`,
  },
  {
    key: 'scheduling',
    title: 'Scheduling — Two Yes-Yes Options',
    content: `Wonderful, {{contact_first_name}}. {{provider_name}} has time this week on Tuesday and Wednesday — do mornings or afternoons work better for you?

Perfect, I have a 2:30 and a 5:30 — which is better?

Great, I've got you down for Wednesday at 5:30.

(Always offer two yes-yes options within 48 hours. Once booked, add your notes and press the green "Scheduled" button below to log the call.)`,
  },
]

const OBJECTIONS = [
  ['\u201cI thought it was taken care of for good\u201d', 'obj_taken_care_of'],
  ['Cost or insurance', 'obj_cost'],
  ['\u201cI\u2019m considering another option\u201d', 'obj_other_option'],
  ['\u201cI don\u2019t have time\u201d', 'obj_time'],
  ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
]

const choices = [
  ['open', 'Patient is on the line \u2014 continue', 'opening_question', 'default'],
  ['opening_question', '\u201cStill doing great\u201d', 'resp_doing_great', 'positive'],
  ['opening_question', '\u201cStarting to come back\u201d', 'resp_coming_back', 'caution'],
  ['opening_question', '\u201cFully back\u201d', 'resp_fully_back', 'negative'],
  ['resp_doing_great', 'Continue \u2014 stay ahead of it', 'doing_well_variant', 'default'],
  ['resp_coming_back', 'Continue to the transition', 'transition', 'default'],
  ['resp_fully_back', 'Continue to the transition', 'transition', 'default'],
  ['doing_well_variant', 'Noticing early signs \u2014 dig in', 'transition', 'caution'],
  ['doing_well_variant', 'No signs \u2014 make the recommendation', 'recommendation', 'positive'],
  ['transition', 'They said okay \u2014 dig in', 'digging_in', 'default'],
  ['digging_in', 'They named their biggest concern', 'making_it_real', 'default'],
  ['making_it_real', 'Continue to the review', 'review', 'default'],
  ['review', 'They said yes \u2014 magic question', 'recommendation', 'positive'],
  ['recommendation', '\u201cYes, that sounds reasonable\u201d', 'scheduling', 'positive'],
  ['recommendation', 'Hesitant or soft no', 'uncover', 'caution'],
  ...OBJECTIONS.map(([label, key]) => ['recommendation', label, key, 'objection']),
  ['uncover', 'They\u2019re ready \u2014 schedule', 'scheduling', 'positive'],
  ...OBJECTIONS.map(([label, key]) => ['uncover', label, key, 'objection']),
  ...OBJECTIONS.map(([, key]) => [key, 'Resolved \u2014 re-ask the scheduling question', 'scheduling', 'positive']),
  ...OBJECTIONS.map(([, key]) => [key, 'Another concern came up', 'uncover', 'objection']),
]

for (let i = 0; i < steps.length; i++) {
  await client.query(
    'insert into script_flow_steps (niche_id, step_key, title, content, sort_order) values (null, $1, $2, $3, $4)',
    [steps[i].key, steps[i].title, steps[i].content, i],
  )
}

const perStepCount = {}
for (const [from, label, to, variant] of choices) {
  perStepCount[from] = (perStepCount[from] ?? 0) + 1
  await client.query(
    'insert into script_flow_choices (niche_id, from_step_key, label, to_step_key, variant, sort_order) values (null, $1, $2, $3, $4, $5)',
    [from, label, to, variant, perStepCount[from] - 1],
  )
}

const { rows: s } = await client.query(
  'select count(*)::int c from script_flow_steps where niche_id is null',
)
const { rows: c } = await client.query(
  'select count(*)::int c from script_flow_choices where niche_id is null',
)
console.log('SEEDED steps:', s[0].c, '| choices:', c[0].c)
await client.end()
