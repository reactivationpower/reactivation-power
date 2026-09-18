/**
 * 009 — Multi-sector build-out.
 *
 * 1. Adds a `sector` column to courses and niches (default 'healthcare').
 * 2. Creates the "Reactivation Power Training - Home Services" course so it
 *    appears in the admin Course Access list with its own toggle.
 * 3. Adds the first Home Services niche: HVAC.
 * 4. Seeds a complete placeholder HVAC interactive script flow (same proven
 *    structure as the healthcare script, adapted to home-services language).
 *    Replace the wording when the real HVAC script is uploaded.
 */
import pg from 'pg'

const client = new pg.Client({
  connectionString: (process.env.POSTGRES_URL_NON_POOLING ?? '').replace(
    /([?&])sslmode=[^&]*/,
    '$1',
  ),
  ssl: { rejectUnauthorized: false },
})

const HVAC_STEPS = [
  {
    key: 'open',
    title: 'The Professional Open',
    sort: 0,
    content: `"Hi, is this {{contact_first_name}}?

Great — this is {{caller_name}} from {{practice_name}}. How are you today?

I'm calling because we were reviewing our service records and noticed it's been a while since we were last out to your home. We wanted to personally check in on you and see how your system has been holding up."

(Warm, unhurried, professional. You are a service company that cares — not a telemarketer.)`,
  },
  {
    key: 'opening_question',
    title: 'The Opening Question',
    sort: 1,
    content: `"Since we were last out there — how has your heating and cooling been treating you? Is everything still running the way it should, or have you started to notice anything?"

(Then be quiet and listen. Their answer tells you which direction to take the call.)`,
  },
  {
    key: 'resp_doing_great',
    title: 'Everything Is Running Fine',
    sort: 2,
    content: `"That's great to hear — that's exactly what we want.

You know, the systems that keep running like that are almost always the ones that get looked at regularly. The seasonal tune-up is what catches the small stuff — a weak capacitor, a dirty coil, low refrigerant — before it turns into a no-heat or no-cool emergency."`,
  },
  {
    key: 'resp_coming_back',
    title: 'Something Is Starting to Act Up',
    sort: 3,
    content: `"I appreciate you telling me that — and honestly, I'm glad we caught it now.

The little things — a noise, a smell, rooms that won't hold temperature, a bill that's creeping up — those are almost always the early warning signs. They're a lot cheaper to fix now than after a breakdown."`,
  },
  {
    key: 'resp_fully_back',
    title: 'It Has Gotten Bad',
    sort: 4,
    content: `"I'm sorry to hear that — nobody should have to live with a system that isn't doing its job.

The good news is you don't have to keep putting up with it. Let's get one of our technicians out there to take a look, figure out exactly what's going on, and give you real options."`,
  },
  {
    key: 'doing_well_variant',
    title: 'Running Fine — Stay Ahead of It',
    sort: 5,
    content: `"Can I ask — when's the last time the system actually had a professional tune-up?

Most manufacturers require annual maintenance just to keep the warranty valid, and a well-maintained system runs cheaper every single month. Staying ahead of it is always less expensive than reacting to a breakdown."`,
  },
  {
    key: 'transition',
    title: 'The Transition',
    sort: 6,
    content: `"Do you mind if I ask you a few quick questions so I can update your file? It helps our technicians know exactly what to look at if we get you on the schedule."

(Almost everyone says yes. This small yes starts the momentum.)`,
  },
  {
    key: 'digging_in',
    title: 'Digging In — Update the File',
    sort: 7,
    content: `Work through these naturally — you're updating their file, not interrogating:

- "How old is the system now, roughly?"
- "Any rooms that never seem to get comfortable?"
- "Have you noticed your utility bills creeping up?"
- "Any noises, smells, or short-cycling when it kicks on?"
- "When it acts up, what does it usually do?"

(Write down their words. Their biggest frustration is what you'll build the visit around.)`,
  },
  {
    key: 'making_it_real',
    title: 'Making It Real',
    sort: 8,
    content: `"Let me ask you this — on the hottest day of the summer, or the coldest night of the winter, how confident are you that this system gets you through it?

And if it did quit on one of those days — what would that mean for your family?"

(Let them sit with it. Comfort failures always happen at the worst possible time, and they know it.)`,
  },
  {
    key: 'review',
    title: 'The Review & Bridge',
    sort: 9,
    content: `"So just to make sure I've got your file right — the system is {{their_details}}, you've been noticing {{their_concern}}, and the last professional service was a while back. Did I get that right?"

(Reflecting their own words back builds trust and confirms the need in their mind.)`,
  },
  {
    key: 'recommendation',
    title: 'The Magic Question & Recommendation',
    sort: 10,
    content: `"Based on everything you just told me — would it be unreasonable to have one of our technicians come out, go through the whole system, and make sure you're not heading toward a breakdown?

Most folks find the peace of mind alone is worth the visit."`,
  },
  {
    key: 'uncover',
    title: 'Uncover the Real Concern',
    sort: 11,
    content: `"I hear you. Can I ask — is it the timing, the cost, or just not sure it's worth a visit yet?

I ask because most of the time there's one real question behind the hesitation, and I'd rather answer that honestly than keep you on the phone."`,
  },
  {
    key: 'obj_taken_care_of',
    title: 'Objection: "It was just serviced / it\'s still new"',
    sort: 12,
    content: `"That's fair — and a newer or recently serviced system is a great position to be in.

The thing is, filters load up, coils get dirty, and parts drift out of spec every season it runs. The tune-up is how you keep a good system good — and how you keep the manufacturer's warranty intact."`,
  },
  {
    key: 'obj_cost',
    title: 'Objection: Cost',
    sort: 13,
    content: `"I completely understand — nobody budgets for their HVAC company calling.

Here's the honest math though: a tune-up costs a fraction of an emergency repair, and a system running at peak efficiency pays part of that back on every utility bill. And if we find something, you get options before it's an emergency — that's when repairs are most expensive."`,
  },
  {
    key: 'obj_other_option',
    title: 'Objection: "I\'m getting other quotes / another company"',
    sort: 14,
    content: `"That's smart — you should feel good about whoever works on your home.

All I'd say is: we already know your system and its history, which means no guesswork and no starting from scratch. Would it be unreasonable to at least let us take a look so you're comparing apples to apples?"`,
  },
  {
    key: 'obj_time',
    title: 'Objection: "I don\'t have time"',
    sort: 15,
    content: `"I get it — that's exactly why we handle it this way.

You don't have to sit home all day. We'll give you a tight arrival window, call ahead when the tech is on the way, and the visit itself usually takes under an hour. What's generally better for you — mornings or afternoons?"`,
  },
  {
    key: 'obj_spouse',
    title: 'Objection: "I need to talk to my spouse"',
    sort: 16,
    content: `"Of course — this affects both of you.

How about this: let's pencil in a time that works, and if it doesn't work for them, you call us and we move it. No obligation. That way you don't lose the spot while you talk it over."`,
  },
  {
    key: 'scheduling',
    title: 'Scheduling — Two Yes-Yes Options',
    sort: 17,
    content: `"Perfect. I've got the schedule right here — I could get a technician out to you {{option_one}} or {{option_two}}. Which one works better for you?"

(Two real options. Never "when would you like to come in?" Confirm the address and phone number, tell them the tech will call ahead, and thank them.)`,
  },
]

const HVAC_CHOICES = [
  ['open', 'Customer is on the line — continue', 'opening_question', 'default', 0],
  ['opening_question', '“Everything is running fine”', 'resp_doing_great', 'positive', 0],
  ['opening_question', '“Something is starting to act up”', 'resp_coming_back', 'caution', 1],
  ['opening_question', '“It has gotten bad / it quit”', 'resp_fully_back', 'negative', 2],
  ['resp_doing_great', 'Continue — stay ahead of it', 'doing_well_variant', 'default', 0],
  ['resp_coming_back', 'Continue to the transition', 'transition', 'default', 0],
  ['resp_fully_back', 'Continue to the transition', 'transition', 'default', 0],
  ['doing_well_variant', 'Overdue for a tune-up — dig in', 'transition', 'caution', 0],
  ['doing_well_variant', 'Recently serviced — make the recommendation', 'recommendation', 'positive', 1],
  ['transition', 'They said okay — dig in', 'digging_in', 'default', 0],
  ['digging_in', 'They named their biggest concern', 'making_it_real', 'default', 0],
  ['making_it_real', 'Continue to the review', 'review', 'default', 0],
  ['review', 'They said yes — magic question', 'recommendation', 'positive', 0],
  ['recommendation', '“Yes, that sounds reasonable”', 'scheduling', 'positive', 0],
  ['recommendation', 'Hesitant or soft no', 'uncover', 'caution', 1],
  ['recommendation', '“It was just serviced / still new”', 'obj_taken_care_of', 'objection', 2],
  ['recommendation', 'Cost concern', 'obj_cost', 'objection', 3],
  ['recommendation', '“Getting other quotes”', 'obj_other_option', 'objection', 4],
  ['recommendation', '“I don\u2019t have time”', 'obj_time', 'objection', 5],
  ['recommendation', '“I need to talk to my spouse”', 'obj_spouse', 'objection', 6],
  ['uncover', 'They\u2019re ready — schedule', 'scheduling', 'positive', 0],
  ['uncover', '“It was just serviced / still new”', 'obj_taken_care_of', 'objection', 1],
  ['uncover', 'Cost concern', 'obj_cost', 'objection', 2],
  ['uncover', '“Getting other quotes”', 'obj_other_option', 'objection', 3],
  ['uncover', '“I don\u2019t have time”', 'obj_time', 'objection', 4],
  ['uncover', '“I need to talk to my spouse”', 'obj_spouse', 'objection', 5],
  ['obj_taken_care_of', 'Resolved — re-ask the scheduling question', 'scheduling', 'positive', 0],
  ['obj_taken_care_of', 'Another concern came up', 'uncover', 'objection', 1],
  ['obj_cost', 'Resolved — re-ask the scheduling question', 'scheduling', 'positive', 0],
  ['obj_cost', 'Another concern came up', 'uncover', 'objection', 1],
  ['obj_other_option', 'Resolved — re-ask the scheduling question', 'scheduling', 'positive', 0],
  ['obj_other_option', 'Another concern came up', 'uncover', 'objection', 1],
  ['obj_time', 'Resolved — re-ask the scheduling question', 'scheduling', 'positive', 0],
  ['obj_time', 'Another concern came up', 'uncover', 'objection', 1],
  ['obj_spouse', 'Resolved — re-ask the scheduling question', 'scheduling', 'positive', 0],
  ['obj_spouse', 'Another concern came up', 'uncover', 'objection', 1],
]

async function main() {
  await client.connect()
  await client.query('begin')
  try {
    // 1. Sector columns
    await client.query(
      `alter table courses add column if not exists sector text not null default 'healthcare'`,
    )
    await client.query(
      `alter table niches add column if not exists sector text not null default 'healthcare'`,
    )
    console.log('[v0] sector columns added')

    // 2. Home Services course
    const { rows: courseRows } = await client.query(
      `insert into courses (title, description, slug, status, sort_order, sector)
       values ($1, $2, $3, 'live', 1, 'home_services')
       on conflict (slug) do update set sector = 'home_services'
       returning id`,
      [
        'Reactivation Power Training - Home Services',
        'Customer reactivation training for home services companies. Turn your list of past customers into booked service calls.',
        'home-services-training',
      ],
    )
    const courseId = courseRows[0].id
    console.log('[v0] Home Services course:', courseId)

    // 3. HVAC niche
    const { rows: maxRows } = await client.query(
      `select coalesce(max(sort_order), 0) + 1 as next from niches`,
    )
    const { rows: nicheRows } = await client.query(
      `insert into niches (name, sort_order, is_active, sector)
       select 'HVAC', $1, true, 'home_services'
       where not exists (select 1 from niches where name = 'HVAC')
       returning id`,
      [maxRows[0].next],
    )
    let nicheId = nicheRows[0]?.id
    if (!nicheId) {
      const { rows } = await client.query(
        `update niches set sector = 'home_services', is_active = true where name = 'HVAC' returning id`,
      )
      nicheId = rows[0].id
    }
    console.log('[v0] HVAC niche:', nicheId)

    // 4. HVAC placeholder flow (full override so no healthcare wording leaks)
    await client.query(`delete from script_flow_choices where niche_id = $1`, [
      nicheId,
    ])
    await client.query(`delete from script_flow_steps where niche_id = $1`, [
      nicheId,
    ])
    for (const s of HVAC_STEPS) {
      await client.query(
        `insert into script_flow_steps (niche_id, step_key, title, content, sort_order)
         values ($1, $2, $3, $4, $5)`,
        [nicheId, s.key, s.title, s.content, s.sort],
      )
    }
    for (const [from, label, to, variant, sort] of HVAC_CHOICES) {
      await client.query(
        `insert into script_flow_choices (niche_id, from_step_key, label, to_step_key, variant, sort_order)
         values ($1, $2, $3, $4, $5, $6)`,
        [nicheId, from, label, to, variant, sort],
      )
    }
    console.log(
      `[v0] HVAC flow seeded: ${HVAC_STEPS.length} steps, ${HVAC_CHOICES.length} choices`,
    )

    await client.query('commit')
    console.log('[v0] migration 009 complete')
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('[v0] migration failed:', err.message)
  process.exit(1)
})
