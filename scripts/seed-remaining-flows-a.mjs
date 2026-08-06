/**
 * Seeds niche-specific script flows (batch A) from the official Script-Only
 * PDFs: Botox, Chiropractic, Decompression, ChiroThin.
 * Same structure/upsert logic as seed-new-niche-flows.mjs.
 */
import pg from 'pg'

const client = new pg.Client({
  connectionString: (process.env.POSTGRES_URL_NON_POOLING ?? '').replace(
    /([?&])sslmode=[^&]*/,
    '$1',
  ),
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const CONFIRM =
  '\n\nConfirm and continue: Does that help put your mind at ease? (Wait for a fast yes.) Do you have any other questions or concerns?'

const NICHES = [
  {
    name: 'Botox',
    openingChoices: [
      '\u201cStill loving how it looks\u201d',
      '\u201cIt\u2019s starting to come back a little\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been looking since your last treatment with us? Are you still loving how smooth and refreshed everything looks, is it starting to come back a little, or are you pretty much back to where you were before you came in?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Loving the Results',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still loving your results. Do you remember how thrilled you were when you first saw how refreshed and smooth everything looked?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Come Back',
        content: `Oh {{contact_first_name}}, I completely understand — that is exactly what happens as the treatment wears off and the movement comes back. I remember how great you looked and how happy you were the last time you were in. Has it pretty much come all the way back at this point?

(Let them answer, be warm, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, I completely understand, that is exactly what happens as the treatment wears off and the movement comes back — it's completely normal. I remember how great you looked and how happy you were the last time you were in.

(Let them answer, be warm, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still loving your results — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the effect does naturally wear off over a few months, and most of our patients like to come back in before the lines fully return so they always look refreshed and never have to start over. Are you starting to notice any little movement or early signs coming back that you'd like to stay ahead of?

(Close toward a regular rhythm:) ...the best way to keep looking as refreshed as you do now is to come back in on a regular schedule so you stay ahead of it instead of waiting for it to fully come back. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing or promising anything.)

— The lines returning: are the lines we treated starting to come back — your frown lines, forehead, or wherever was bothering you most?

— Movement returning: are you noticing more movement again when you frown, squint, or raise your eyebrows?

— Looking tired or older: have you caught yourself in photos or on video calls thinking you look more tired or a little older than you feel?

— Makeup settling in: is your makeup starting to settle into those lines again the way it did before?

— A related area: is there another area you have been thinking about, like crow's feet or forehead lines, now that you have seen what the treatment can do?

— Self-consciousness: have you found yourself feeling a little more self-conscious about it lately?

— Special events: do you have anything coming up — a trip, a wedding, photos, an event — where you'd love to look your best?

— The bigger picture: are you starting to feel like you'd just like to get back to looking as refreshed as you did right after your last treatment?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been coming back? A few weeks, a month or two?

How often — is it something you notice here and there, or pretty much every time you look in the mirror?

How it affects you — when you notice it, how does it make you feel about how you look day to day? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back in is the right move to get you back to looking as refreshed as you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_last_longer',
        label: '\u201cI thought it would last longer\u201d',
        content: `I completely understand, and that's a great thing to bring up. The effect naturally wears off over a few months as the movement comes back, which is completely normal, and that's exactly why most patients come back in on a regular basis — and what {{provider_name}} can map out with you in person.${CONFIRM}`,
      },
      {
        key: 'obj_other_treatment',
        label: '\u201cI\u2019m thinking about fillers or something else\u201d',
        content: `That makes total sense, and that's exactly the kind of thing {{provider_name}} can talk through with you at the appointment to see what fits best.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Chiropractic',
    openingChoices: [
      '\u201cStill feeling great\u201d',
      '\u201cIt\u2019s starting to flare up again\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how has your back been feeling since you finished your care with us? Is it still feeling great, is it starting to flare up again, or are you pretty much back to where you were before you came in?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Feeling Great',
        content: `You know what, {{contact_first_name}}? That's awesome. We're so happy to hear you're still feeling good and staying active. Do you remember how rough it was when you first came in, and how good it felt to finally be out of pain?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Flare Up',
        content: `Oh {{contact_first_name}}, I'm so sorry to hear that. I remember how much better you were moving and feeling the last time we saw you — you were so relieved, weren't you? What happened, did it just gradually come back, or did something set it off?

(Let them answer, be sympathetic, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, I'm so sorry to hear that. I remember how much better you were moving and feeling the last time we saw you — you were so relieved, weren't you? What happened, did it just gradually come back, or did something set it off?

(Let them answer, be sympathetic, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still feeling great — that is fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: when you finished care you were thrilled to be out of pain. Spinal issues do tend to creep back over time, especially once people get busy and stop their exercises, so I'm curious — are you noticing any little twinges, stiffness, or early signs starting to come back that you'd like to stay ahead of?

(Close toward a regular rhythm:) ...the best way to protect how good you feel, since spinal issues tend to creep back, is to get back in for a check and stay on a supportive schedule so you stay ahead of a flare. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing.)

— Original pain returning: is the pain we treated you for coming back — your low back, neck, wherever it was worst?

— Radiating pain: any pain shooting down into your leg or arm again, like before?

— Numbness or tingling: any numbness, tingling, or pins-and-needles coming back?

— Stiffness / range of motion: feeling stiffer, or harder to bend, twist, or turn your head?

— Sleep: is it making it harder to fall asleep, stay asleep, or are you waking up sore?

— Everyday activities: getting in the way of sitting, standing, driving, lifting, or getting up and down?

— Work: affecting you at work or making your job harder than it should be?

— Activities you love: keeping you from exercise, hobbies, or time with your kids or grandkids?

— Pain medication: reaching for ibuprofen or pain relievers again to get through the day?

— The bigger picture: starting to worry about it getting worse, or about needing injections or surgery down the road?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it here and there, or pretty much every day?

How does it interfere — when it's bothering you, how does it affect your work, your sleep, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that is exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back in is the right move to take the pressure off and get you back out of pain like you were before. If {{provider_name}} thinks we can help, we'll let you know and we'd be honored to. And if for some reason it's not the right fit, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_fixed_for_good',
        label: '\u201cI thought I was fixed for good\u201d',
        content: `I completely understand, and that's a great thing to bring up. Spinal issues can flare back up over time, especially with everyday wear and tear, and that's exactly the kind of thing {{provider_name}} will want to look at with you in person.${CONFIRM}`,
      },
      {
        key: 'obj_injections_surgery',
        label: '\u201cI\u2019m considering injections or surgery\u201d',
        content: `That makes total sense, and many people like to see where a conservative option fits before making a bigger decision, which is exactly what the appointment is for.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['Time / number of visits', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Decompression',
    openingChoices: [
      '\u201cStill feeling great and holding up\u201d',
      '\u201cIt\u2019s starting to come back a little\u201d',
      '\u201cPretty much back to where it was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how has your back been doing since you finished care with us? Is it still feeling great and holding up, is it starting to come back a little, or is it pretty much back to where it was before you came in?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Holding Up',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear your back is still holding up and you're feeling great. Do you remember how much relief you felt when you finished and got back to doing the things you couldn't do before?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Come Back',
        content: `Oh {{contact_first_name}}, I'm sorry to hear that, and I understand how discouraging it is when the pain comes back. I remember how much relief you had and how good you were moving when we finished. What do you think brought it back — a specific injury, or did it just gradually return?

(Let them answer, be empathetic, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, I'm sorry to hear that, and I understand how discouraging it is when the pain comes back. I remember how much relief you had and how good you were moving when we finished. What do you think brought it back — a specific injury, or did it just gradually return?

(Let them answer, be empathetic, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad your back is still feeling great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: with the back and neck the goal is always to stay ahead of it, because once things are feeling good, a periodic check and staying on top of your home program is what keeps a flare-up from sneaking back. Are you noticing any little stiffness or early signs you'd like to stay ahead of?

(Close toward a regular rhythm:) ...the best way to protect all the progress you made is to come in for a check and stay on a simple maintenance schedule so you stay ahead of it instead of waiting for it to fully come back. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing or promising anything.)

— The original pain returning: is the pain you originally came in for starting to come back?

— Radiating pain: are you getting any pain that shoots or travels, like down a leg or into an arm?

— Numbness or tingling: any numbness, tingling, or pins-and-needles in your arms, hands, legs, or feet?

— Stiffness and movement: are you feeling stiff, or having trouble bending, turning, or moving the way you'd like?

— Sleep: is the pain affecting your sleep, making it hard to fall asleep or waking you up?

— Everyday activities: is it getting in the way of everyday things — sitting, standing, driving, lifting, or bending?

— Work: is it affecting you at work, or making your workday harder than it should be?

— The things you love: is it keeping you from activities or hobbies you enjoy, or time with family?

— Pain medication: have you found yourself reaching for pain relievers again to get through the day?

— Worry about what's next: are you starting to worry it could head toward injections or surgery if it keeps up?

— The bigger picture: are you starting to wish you could just get back to feeling and moving the way you did when you finished?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been coming back? A few weeks, a month or two?

How often — is it here and there, or is it pretty much every day at this point?

How it affects you — when it's bothering you, how does it affect your day, your work, your sleep, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back in is the right move to get you back to feeling and moving the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_fixed_for_good',
        label: '\u201cI thought it was fixed for good\u201d',
        content: `I completely understand, and that's a fair thing to bring up. The back and neck can flare up again over time, especially with everyday wear and tear, which is completely normal — and that's exactly why a check-in makes sense, so {{provider_name}} can see what's going on before it gets worse.${CONFIRM}`,
      },
      {
        key: 'obj_injections_surgery',
        label: '\u201cI\u2019m thinking about injections or surgery\u201d',
        content: `That makes sense, and that's exactly the kind of thing {{provider_name}} can talk through with you at the appointment, so you have all the information before making a decision like that.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['Time or number of visits', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'ChiroThin',
    openingChoices: [
      '\u201cStill keeping the weight off\u201d',
      '\u201cA little has started to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you finished the program with us? Are you still keeping the weight off and feeling great, has a little started to creep back, or are you pretty much back to where you were before you started?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Keeping It Off',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still doing great and keeping it off. Do you remember how thrilled you were when you finished and saw how far you'd come and how good you felt?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people and it is exactly why we check in. I remember how great you looked and felt and how proud you were when you finished. What do you think has made it creep back — just life getting busy, old habits, a little of everything?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people and it is exactly why we check in. I remember how great you looked and felt and how proud you were when you finished. What do you think has made it creep back — just life getting busy, old habits, a little of everything?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still doing great and keeping it off — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the slow creep back over time. Are you noticing any little habits or a few pounds starting to sneak back that you'd like to stay ahead of before they add up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing or promising anything. Keep it judgment-free.)

— The weight returning: has some of the weight started to come back since you finished?

— Clothes fitting: are your clothes starting to feel tighter again, or have you gone back to the bigger sizes?

— Energy: how's your energy compared to when you finished — are you feeling more sluggish or tired again?

— Old habits: have the old eating habits, the snacking or the cravings, started creeping back in?

— Sleep: is your sleep being affected again the way it was before?

— How you feel in your body: are the aches, the joints, or just feeling uncomfortable in your body starting to come back?

— Confidence: are you feeling a little less confident or frustrated when you look in the mirror or at photos?

— Special events: is there anything coming up — a trip, a wedding, a reunion — where you'd love to feel your best?

— Health reasons: was there a health reason you wanted the weight off in the first place that's on your mind again?

— The bigger picture: are you starting to wish you could just get back to feeling the way you did when you finished?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it here and there, or is it pretty much every day at this point?

How it affects you — when it's on your mind, how does it affect your day, your confidence, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_do_it_myself',
        label: '\u201cI should be able to do it myself this time\u201d',
        content: `I completely understand, and that's a great mindset. A lot of people feel that way, and what the appointment does is simply give you the support and structure that made it work the first time, which is exactly what {{provider_name}} can map out with you.${CONFIRM}`,
      },
      {
        key: 'obj_embarrassed',
        label: '\u201cI\u2019m embarrassed I gained it back\u201d',
        content: `Please don't be — this happens to almost everyone and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get back to where you were.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
]

// ---------------------------------------------------------------------------

const { rows: nicheRows } = await client.query('select id, name from niches')
const nicheIdByName = new Map(nicheRows.map((r) => [r.name, r.id]))

for (const niche of NICHES) {
  const nicheId = nicheIdByName.get(niche.name)
  if (!nicheId) {
    console.error('SKIP — niche not found in DB:', niche.name)
    continue
  }

  await client.query('delete from script_flow_steps where niche_id = $1', [
    nicheId,
  ])
  await client.query('delete from script_flow_choices where niche_id = $1', [
    nicheId,
  ])

  const { rows: generalSteps } = await client.query(
    'select step_key, sort_order from script_flow_steps where niche_id is null',
  )
  const generalOrder = new Map(
    generalSteps.map((r) => [r.step_key, r.sort_order]),
  )

  for (const [key, step] of Object.entries(niche.steps)) {
    await client.query(
      'insert into script_flow_steps (niche_id, step_key, title, content, sort_order) values ($1, $2, $3, $4, $5)',
      [nicheId, key, step.title, step.content, generalOrder.get(key) ?? 99],
    )
  }
  let objSort = 100
  for (const obj of niche.objections) {
    await client.query(
      'insert into script_flow_steps (niche_id, step_key, title, content, sort_order) values ($1, $2, $3, $4, $5)',
      [
        nicheId,
        obj.key,
        `Objection: ${obj.label.replace(/[\u201c\u201d]/g, '')}`,
        obj.content,
        objSort++,
      ],
    )
  }

  const choices = []
  if (niche.openingChoices) {
    choices.push(
      ['opening_question', niche.openingChoices[0], 'resp_doing_great', 'positive'],
      ['opening_question', niche.openingChoices[1], 'resp_coming_back', 'caution'],
      ['opening_question', niche.openingChoices[2], 'resp_fully_back', 'negative'],
    )
  }

  const objectionChoices = [
    ...niche.objections.map((o) => [o.label, o.key]),
    ...(niche.extraObjectionRefs ?? []),
  ]

  choices.push(
    ['recommendation', '\u201cYes, that sounds reasonable\u201d', 'scheduling', 'positive'],
    ['recommendation', 'Hesitant or soft no', 'uncover', 'caution'],
    ...objectionChoices.map(([label, key]) => ['recommendation', label, key, 'objection']),
    ['uncover', 'They\u2019re ready \u2014 schedule', 'scheduling', 'positive'],
    ...objectionChoices.map(([label, key]) => ['uncover', label, key, 'objection']),
    ...niche.objections.map((o) => [o.key, 'Resolved \u2014 re-ask the scheduling question', 'scheduling', 'positive']),
    ...niche.objections.map((o) => [o.key, 'Another concern came up', 'uncover', 'objection']),
  )

  const perStep = {}
  for (const [from, label, to, variant] of choices) {
    perStep[from] = (perStep[from] ?? 0) + 1
    await client.query(
      'insert into script_flow_choices (niche_id, from_step_key, label, to_step_key, variant, sort_order) values ($1, $2, $3, $4, $5, $6)',
      [nicheId, from, label, to, variant, perStep[from] - 1],
    )
  }

  const stepCount = Object.keys(niche.steps).length + niche.objections.length
  console.log(`SEEDED ${niche.name}: ${stepCount} steps, ${choices.length} choices`)
}

await client.end()
