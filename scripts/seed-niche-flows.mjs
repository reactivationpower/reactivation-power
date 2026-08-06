/**
 * Seeds niche-specific overrides for the interactive script flow.
 *
 * For each niche: override steps (same step_key as the general flow) replace
 * the general step when that niche is selected; niche choice sets replace the
 * general choice set for a step. Shared steps (open, transition, uncover,
 * scheduling) stay general. Common objections (cost, time, spouse) reuse the
 * general obj_* steps unless the niche guide provides unique wording.
 */
import pg from 'pg'

const client = new pg.Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
})
await client.connect()

const CONFIRM =
  '\n\nConfirm and continue: Does that help put your mind at ease? (Wait for a fast yes.) Do you have any other questions or concerns?'

/**
 * Each entry:
 *  name        — must match niches.name in the database
 *  steps       — { step_key: { title, content } } overrides
 *  openingChoices — labels for the three opening-question answers
 *  objections  — [{ key, label, content }] niche-specific objection steps
 *  extraObjectionRefs — [[label, general_step_key]] general objections to include
 */
const NICHES = [
  {
    name: 'Massage Therapy',
    openingChoices: [
      '\u201cStill feeling loose and relaxed\u201d',
      '\u201cTension is starting to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since your last massage with us? Are you still feeling loose and relaxed and staying in your regular rhythm, has it been a little while and the tension started to creep back, or are you pretty much back to where you were before you started coming in?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Feeling Great',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still feeling loose and relaxed. Do you remember how great it felt to have that tension melt away and to move and sleep so much better?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'The Tension Is Creeping Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — it's easy to fall out of the rhythm and then the tension and tightness start creeping back in. I remember how relaxed and good you were feeling, and I'm sure you remember that feeling too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they fall out of the routine. The tension builds right back up and you end up stiff and stressed again, and it is exactly why we check in. I remember how good you were feeling. What do you think got you out of the rhythm — was it just life getting busy, scheduling, cost?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay in the Rhythm',
        content: `{{contact_first_name}}, I'm so glad you're still feeling loose and relaxed, that's fantastic. Let me ask you this — the hardest part for most people is staying in a regular rhythm so the tension never gets a chance to build back up into knots and stiffness. Are you finding it's been stretching a little longer between visits than you'd like, or a bit of tightness starting to creep back that you'd like to stay ahead of?

(Close toward a regular rhythm:) ...the best way to keep feeling loose and relaxed is to stay on a simple regular schedule so you stay ahead of the tension instead of letting it build back up. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so we have an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present. You are updating the file, not diagnosing or giving medical advice.)

— Tension returning: has the tightness or tension started to build back up since your last massage?

— Which areas: is it the same spots as before — the neck, shoulders, upper or lower back, or wherever you tend to hold it?

— Knots and soreness: are you noticing the knots, soreness, or that stiff, tight feeling coming back?

— Stress levels: are you feeling more stressed, wound up, or run-down again lately?

— Sleep: is the tension affecting your sleep the way it did before?

— Range of motion: is your neck or back feeling tighter or less mobile again — harder to turn or reach?

— Headaches: are the tension headaches starting to come back, if those were something you dealt with?

— Everyday life and posture: is sitting at a desk, working, or your posture leaving you achy and tight again?

— Special events: is there anything coming up — a trip, an event, or a busy stretch — you'd love to feel relaxed and loose for?

— The reason you started: was there a reason you first started coming in for massage that's back on your mind?

— The bigger picture: are you starting to wish you could just get back to that loose, relaxed, low-stress feeling and your regular rhythm the way you had it before?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has it been since you've been in? A few weeks, a couple months?

How often — is it something you notice here and there, or pretty much every day at this point?

How it affects you — when it's acting up, how does it affect your day, your stress, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing we help people with every single day.`,
      },
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to that loose, relaxed, low-stress feeling and your regular rhythm like you had it before — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so we can get you back on track and back into your relaxed, low-tension rhythm. If it's a good fit we'd be honored to help, and if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_fell_out_habit',
        label: '\u201cI fell out of the habit / it\u2019s been too long\u201d',
        content: `I completely understand, and that's actually really common — life gets busy and it's easy to fall out of the rhythm. That's exactly why coming in makes sense: we'll get you right back to feeling loose and relaxed, and the more regular you are, the easier it is to stay ahead of the tension.${CONFIRM}`,
      },
      {
        key: 'obj_luxury',
        label: '\u201cIt\u2019s kind of a luxury / I feel guilty spending on it\u201d',
        content: `I hear that a lot, and I'd gently say taking care of your stress and tension isn't a luxury — it's part of feeling and functioning your best. And you told me how much better you felt when you were coming in.${CONFIRM}`,
      },
      {
        key: 'obj_living_with_it',
        label: '\u201cI\u2019ve just been living with the tension\u201d',
        content: `I understand, and you can get used to it — but I know how much better you felt when that tension was gone. Coming back in is the easiest way to get back to feeling loose again.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Botox',
    openingChoices: [
      '\u201cStill loving how it looks\u201d',
      '\u201cStarting to come back a little\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been looking since your last treatment with us? Are you still loving how smooth and refreshed everything looks, is it starting to come back a little, or are you pretty much back to where you were before you came in?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Looking Great',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still loving your results. Do you remember how thrilled you were when you first saw how refreshed and smooth everything looked?

(Let them respond — always remind them how great they looked.)`,
      },
      resp_coming_back: {
        title: 'Starting to Come Back',
        content: `{{contact_first_name}}, that makes sense, because the effect does gradually wear off over time — and I remember how happy you were with how smooth and refreshed you looked when we last saw you.

(Let them confirm.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, I completely understand — that is exactly what happens as the treatment wears off and the movement comes back. I remember how great you looked and how happy you were the last time you were in. Has it pretty much come all the way back at this point?

(Let them answer. Be warm, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still loving your results — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the effect does naturally wear off over a few months, and most of our patients like to come back in before the lines fully return so they always look refreshed and never have to start over. Are you starting to notice any little movement or early signs coming back that you'd like to stay ahead of?

(Close toward a regular rhythm:) ...the best way to keep looking as refreshed as you do now is to come back in on a regular schedule so you stay ahead of it instead of waiting for it to fully come back. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. You are updating the file, not diagnosing or promising anything.)

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
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it makes them feel.) Did I get that right?

And it sounds like you'd really just love to get back to feeling refreshed and confident when you look in the mirror — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back in is the right move to get you back to looking as refreshed as you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_last_longer',
        label: '\u201cI thought it would last longer\u201d',
        content: `I completely understand, and that's a great thing to bring up. The effect naturally wears off over a few months as the movement comes back, which is completely normal — and that's exactly why most patients come back in on a regular basis, and what {{provider_name}} can map out with you in person.${CONFIRM}`,
      },
      {
        key: 'obj_fillers',
        label: '\u201cI\u2019m thinking about fillers or something else\u201d',
        content: `That makes total sense, and that's exactly the kind of thing {{provider_name}} can talk through with you at the appointment to see what fits best.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['A spouse or someone else weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'Acoustic Wave Therapy',
    openingChoices: [
      '\u201cStill feeling good and moving well\u201d',
      '\u201cA little has started to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you finished your acoustic wave therapy with us? Are you still feeling good and moving well with the pain staying away, has a little of it started to creep back, or are you pretty much back to where you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Feeling Good',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still feeling good and moving well. Do you remember how great it felt to get that relief and be able to do the things you'd been missing without that pain holding you back?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — especially once you're off your sessions, the discomfort can slowly start creeping back in. I remember how much better you were feeling and how happy you were, and I'm sure you remember that relief too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because these things can gradually flare back up over time, and it is exactly why we check in. I remember how much relief you had and how good you were feeling. What do you think brought it back — was it just the discomfort gradually returning after you stopped, cost, just life getting busy?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still feeling good and moving well — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the slow creep back before a little stiffness or discomfort turns into a full flare-up again. Are you noticing any little twinges or tightness starting to sneak back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the progress you made is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. Never discuss specific treatment plans, session counts, settings, or pricing.)

— Pain returning: has the pain or discomfort started to creep back in the area we were treating since you finished?

— Which area: is it the same spot as before — the foot, heel, knee, hip, shoulder, back, or wherever we were working on you?

— Stiffness and mobility: are you noticing the stiffness, tightness, or reduced range of motion coming back the way it was before?

— Everyday activities: is the discomfort starting to get in the way of walking, standing, exercising, working, or the things you like to do again?

— Sleep: is it affecting your sleep or waking you up the way it used to?

— Flare-ups: are you having flare-ups or bad days more often again?

— Leaning on other things: are you finding yourself back to relying on pain relievers, ice, braces, or just pushing through the way you were before?

— Doing less: are you holding back from activities or hobbies again because of how it feels?

— Special events or goals: is there anything coming up — a trip, an event, or an activity — you'd love to feel good for?

— The reason you started: was there a goal or a reason you came in for this in the first place that's back on your mind?

— The bigger picture: are you starting to wish you could just get back to feeling and moving the way you did at your best after your sessions?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it something you notice here and there, or pretty much every day at this point?

How it affects you — when it's flaring up, how does it affect your day, your activities, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to feeling good, moving well, and doing the things you enjoy without that pain like you did at your best after your sessions — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling and moving the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_came_back',
        label: '\u201cIt came back after I stopped\u201d',
        content: `I completely understand, and that's actually really common, because these things can gradually flare back up once you're off your sessions. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you hold your progress.${CONFIRM}`,
      },
      {
        key: 'obj_embarrassed',
        label: '\u201cI\u2019m embarrassed it came back\u201d',
        content: `Please don't be — this happens to almost everyone once the sessions stop, and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get back to where you were.${CONFIRM}`,
      },
      {
        key: 'obj_did_it_work',
        label: '\u201cDid it even work last time / not sure it lasts\u201d',
        content: `(Acknowledge it warmly.) That's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and what would help it hold.

(Never make guaranteed-results claims on the call.)${CONFIRM}`,
      },
      {
        key: 'obj_managing',
        label: '\u201cI\u2019ve just been managing it / pushing through\u201d',
        content: `I understand, and that can get you by — but I know how much better you felt when you weren't having to rely on that. Coming in is the best way to get {{provider_name}}'s eyes on it and get you back to real relief.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['A spouse or someone else weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'Teeth Whitening',
    openingChoices: [
      '\u201cSmile is still bright \u2014 loving it\u201d',
      '\u201cA little staining is creeping back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you had your teeth whitening done with us? Is your smile still looking bright and white and you're loving it, has a little staining started to creep back, or are you pretty much back to where you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Bright',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear your smile is still looking bright and you're feeling great. Do you remember how thrilled you were when you saw how much whiter and brighter your smile looked and how confident it made you feel?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Staining Is Creeping Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — especially with coffee, tea, wine, and everyday foods, the staining slowly starts to creep back in. I remember how bright your smile was and how happy you were with it, and I'm sure you remember that feeling too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people, because teeth naturally restain over time with the things we eat and drink, and it is exactly why we check in. I remember how bright and confident your smile was. What do you think brought the staining back — was it coffee or wine, everyday foods, cost, just life getting busy?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of the Staining',
        content: `{{contact_first_name}}, I'm so glad your smile is still looking bright and you're feeling great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the everyday staining from coffee, wine, and food that slowly builds back up over time. Are you noticing any little bit of dullness or staining starting to sneak back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect that bright smile is to come in for a quick check and stay on a simple maintenance or touch-up rhythm so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. Never discuss specific products, strengths, or pricing.)

— Brightness fading: has your smile started to look a little less bright or white than it did right after your whitening?

— Staining returning: are you noticing yellowing or staining creeping back the way it was before?

— Coffee, tea, wine: are the everyday coffee, tea, wine, or other staining foods and drinks starting to show on your teeth again?

— Specific spots: are there certain teeth or spots that are staining or looking dull faster than others?

— In photos: are you noticing your teeth looking less bright in photos or on video calls again?

— Smiling confidence: are you feeling a little less confident smiling big or in close-up photos the way you were before?

— Comparing to how it was: are you catching yourself missing how bright it looked right after you had it done?

— Upkeep: has the at-home upkeep, like whitening toothpaste or touch-ups, slipped or stopped keeping up with it?

— Special events: is there anything coming up — a trip, a wedding, a reunion — where you'd love your smile to look its brightest?

— The reason you started: was there a goal or a reason you wanted your smile brightened in the first place that's back on your mind?

— The bigger picture: are you starting to wish you could just get back to that bright, confident smile the way you had it at your best?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it something you notice here and there, or pretty much every time you look in the mirror or see a photo at this point?

How it affects you — when it's on your mind, how does it affect your confidence, your smile, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to that bright, white, confident smile like you had at your best after your whitening — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if a touch-up or getting you back on track is the right move to get your smile back to the way it looked before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_last_longer',
        label: '\u201cI thought it would last longer\u201d',
        content: `I completely understand, and that's a great point — whitening looks amazing but teeth naturally restain over time with coffee, wine, and everyday foods. That's exactly why coming in makes sense, so {{provider_name}} can take a look and talk through the best way to get your smile bright again and help it last.${CONFIRM}`,
      },
      {
        key: 'obj_embarrassed',
        label: '\u201cI\u2019m embarrassed it stained back up\u201d',
        content: `Please don't be — this happens to almost everyone over time, and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get your smile back to where it was.${CONFIRM}`,
      },
      {
        key: 'obj_sensitivity',
        label: 'Sensitivity or a bad experience before',
        content: `(Acknowledge it warmly.) That's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and make it comfortable.

(Never give dental advice on the call.)${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['A spouse or someone else weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'GLP Patients',
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
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still doing great and keeping it off. Do you remember how thrilled you were when you saw how far you'd come and how good you felt?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — especially once you're off the program, the appetite tends to come back and it starts creeping on. I remember how great you were doing and how happy you were, and I'm sure you remember that feeling too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because the appetite comes right back, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — was it the appetite returning after you stopped, cost, just life getting busy?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still doing great and keeping it off — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the appetite and the slow creep back over time. Are you noticing any little habits or a few pounds starting to sneak back that you'd like to stay ahead of before they add up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. Never discuss specific medication or doses.)

— The weight returning: has some of the weight started to come back since you stopped the program?

— Appetite and cravings: has your appetite come back stronger, or are the cravings and snacking returning the way they were before?

— Clothes fitting: are your clothes starting to feel tighter again, or have you gone back to the bigger sizes?

— Energy: how's your energy compared to when you were on the program — are you feeling more sluggish or tired again?

— Old habits: have the old eating habits started creeping back in?

— Sleep: is your sleep being affected again the way it was before?

— How you feel in your body: are the aches, the joints, or just feeling uncomfortable in your body starting to come back?

— Confidence: are you feeling a little less confident or frustrated when you look in the mirror or at photos?

— Special events: is there anything coming up — a trip, a wedding, a reunion — where you'd love to feel your best?

— Health reasons: was there a health reason you wanted the weight off in the first place that's on your mind again?

— The bigger picture: are you starting to wish you could just get back to feeling the way you did at your best on the program?

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
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to feeling healthy and confident like you did at your best — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_gained_back',
        label: '\u201cI gained it back as soon as I stopped\u201d',
        content: `I completely understand, and that's actually really common, because the appetite tends to come right back when you stop. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and keep it off.${CONFIRM}`,
      },
      {
        key: 'obj_embarrassed',
        label: '\u201cI\u2019m embarrassed I gained it back\u201d',
        content: `Please don't be — this happens to almost everyone who stops, and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get back to where you were.${CONFIRM}`,
      },
      {
        key: 'obj_side_effects',
        label: 'Side effects or a bad experience before',
        content: `(Acknowledge it warmly.) That's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture.

(Never give medical advice on the call.)${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['A spouse or someone else weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'Gut Health',
    openingChoices: [
      '\u201cDigestion still feeling good and settled\u201d',
      '\u201cA little has started to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you finished the gut health program with us? Is your digestion still feeling good and settled and you're feeling great, has a little started to creep back, or are you pretty much back to where you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Doing Well',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still doing great and feeling settled. Do you remember how much of a relief it was when the bloating and discomfort calmed down and you had your energy back and felt like yourself again?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — especially once you're off the program, the old symptoms can slowly start creeping back in. I remember how much better you were feeling and how happy you were, and I'm sure you remember that relief too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because the gut can slip back into old patterns, and it is exactly why we check in. I remember how much better you felt and how relieved you were. What do you think brought it back — was it the symptoms slowly returning after you stopped, diet slipping back, cost, just life getting busy?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still doing great and feeling settled — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the old symptoms and the slow creep back over time. Are you noticing any little signs — a bit of bloating, some irregularity, or a food starting to bother you again — that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. Never discuss specific treatments, supplements, or doses.)

— Bloating: has the bloating or that uncomfortable full, distended feeling started to come back since you finished the program?

— Gas and discomfort: are the gas, cramping, or stomach discomfort creeping back in the way they were before?

— Bathroom regularity: has your regularity slipped again — more constipation, loose stools, or just feeling off and unpredictable?

— Food sensitivities: are foods that had started sitting well beginning to bother you again, or are you back to feeling like you can't eat certain things?

— Energy: how's your energy compared to when you were on the program — are you feeling more sluggish, foggy, or tired again?

— Sleep: is your sleep being affected again the way it was before?

— Skin: are skin issues like breakouts, rashes, or irritation starting to come back?

— Mood: are you noticing more of the irritability, anxiousness, or that run-down feeling that can come with gut issues?

— Old habits: have the old eating habits or trigger foods started creeping back in?

— How you feel day to day: is the discomfort starting to get in the way of the things you like to do or how you feel in your body?

— Health reasons: was there a health reason you wanted your gut sorted out in the first place that's on your mind again?

— The bigger picture: are you starting to wish you could just get back to feeling settled and like yourself the way you did at your best on the program?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it here and there, or is it pretty much every day at this point?

How it affects you — when it's acting up, how does it affect your day, your energy, your confidence, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to feeling settled, comfortable, and like yourself again like you did at your best on the program — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_came_back',
        label: '\u201cSymptoms came back when I went back to my old way of eating\u201d',
        content: `I completely understand, and that's actually really common, because the gut tends to slip back into old patterns once you're off the program. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you keep it settled.${CONFIRM}`,
      },
      {
        key: 'obj_embarrassed',
        label: '\u201cI\u2019m embarrassed I let it slip back\u201d',
        content: `Please don't be — this happens to almost everyone who stops, and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get back to where you were.${CONFIRM}`,
      },
      {
        key: 'obj_didnt_work',
        label: 'Bad experience or it didn\u2019t fully work before',
        content: `(Acknowledge it warmly.) That's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture.

(Never give medical advice on the call.)${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['A spouse or someone else weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'Decompression',
    openingChoices: [
      '\u201cStill feeling great and holding up\u201d',
      '\u201cStarting to come back a little\u201d',
      '\u201cPretty much back to where it was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how has your back been doing since you finished care with us? Is it still feeling great and holding up, is it starting to come back a little, or is it pretty much back to where it was before you came in?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Feeling Great',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear your back is still holding up and you're feeling great. Do you remember how much relief you felt when you finished and got back to doing the things you couldn't do before?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Come Back',
        content: `{{contact_first_name}}, I'm sorry to hear it's creeping back, and that does happen with the back and neck. I remember how much better you were doing and how relieved you were when we finished, and I'm sure you remember that too?

(Let them confirm.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, I'm sorry to hear that, and I understand how discouraging it is when the pain comes back. I remember how much relief you had and how good you were moving when we finished. What do you think brought it back — a specific injury, or did it just gradually return?

(Let them answer. Be empathetic, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad your back is still feeling great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: with the back and neck the goal is always to stay ahead of it, because once things are feeling good, a periodic check and staying on top of your home program is what keeps a flare-up from sneaking back. Are you noticing any little stiffness or early signs you'd like to stay ahead of?

(Close toward a regular rhythm:) ...the best way to protect all the progress you made is to come in for a check and stay on a simple maintenance schedule so you stay ahead of it instead of waiting for it to fully come back. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present.)

— The original pain returning: is the pain you originally came in for starting to come back?

— Radiating pain: are you getting any pain that shoots or travels, like down a leg or into an arm?

— Numbness or tingling: any numbness, tingling, or pins-and-needles in your arms, hands, legs, or feet?

— Stiffness and movement: are you feeling stiff, or having trouble bending, turning, or moving the way you'd like?

— Sleep: is the pain affecting your sleep — making it hard to fall asleep or waking you up?

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
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to feeling good and moving freely like you did when you finished — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back in is the right move to get you back to feeling and moving the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_fixed_for_good',
        label: '\u201cI thought it was fixed for good\u201d',
        content: `I completely understand, and that's a fair thing to bring up. The back and neck can flare up again over time, especially with everyday wear and tear, which is completely normal — and that's exactly why a check-in makes sense, so {{provider_name}} can see what's going on before it gets worse.${CONFIRM}`,
      },
      {
        key: 'obj_injections',
        label: '\u201cI\u2019m thinking about injections or surgery\u201d',
        content: `That makes sense, and that's exactly the kind of thing {{provider_name}} can talk through with you at the appointment — so you have all the information before making a decision like that.${CONFIRM}`,
      },
      {
        key: 'obj_visits',
        label: 'Time or number of visits',
        content: `I completely understand, {{contact_first_name}} — life gets busy. The first step is simply an appointment and {{provider_name}}'s evaluation, and we'll work around your schedule.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['A spouse or someone else weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'Cellulite Reduction',
    openingChoices: [
      '\u201cSkin still smooth \u2014 loving it\u201d',
      '\u201cA little has started to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you finished your cellulite reduction treatments with us? Is the skin still looking smooth and toned in the areas we treated and you're loving how it looks, has a little started to creep back, or are you pretty much back to where you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Holding Results',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear the skin is still looking smooth and you're feeling great. Do you remember how thrilled you were when you saw how much smoother and more toned everything looked and how good you felt?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — especially once you're off the treatments, the dimpling and texture can slowly start creeping back. I remember how great you were looking and how happy you were, and I'm sure you remember that feeling too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because the dimpling and texture tend to return over time, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — was it the texture gradually returning after you stopped, cost, just life getting busy?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad the skin is still looking smooth and you're feeling great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the texture slowly coming back over time. Are you noticing any little areas where the dimpling is starting to sneak back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. Never discuss specific treatment plans, session counts, or pricing.)

— Dimpling returning: has the dimpling or that orange-peel texture started to come back in the areas we treated since you finished?

— Which areas: are there specific spots creeping back more than others — the thighs, buttocks, hips, or wherever we worked?

— Skin smoothness: is the skin feeling and looking less smooth than it did right after your treatments?

— Firmness and tone: are the areas feeling a little softer or less toned than when the program had them at their best?

— In certain lighting or positions: are you noticing the texture again in certain lighting, or when you sit or stand a certain way?

— The mirror and photos: are you feeling a little less happy with how the areas look in the mirror or in photos again?

— Confidence: are you feeling a little less confident in shorts, a swimsuit, or up close the way you were before?

— Clothing choices: are you finding yourself covering up or avoiding certain outfits again because of it?

— Special events: is there anything coming up — a trip, a wedding, a reunion — where you'd love to look and feel your best?

— The reason you started: was there a goal or a reason you wanted this done in the first place that's back on your mind?

— The bigger picture: are you starting to wish you could just get back to looking and feeling the way you did at your best after your treatments?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it something you notice here and there, or pretty much every time you look at it at this point?

How it affects you — when it's on your mind, how does it affect your day, your confidence, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to looking and feeling confident with smooth, toned skin like you did at your best after your treatments — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back on track is the right move to get you back to looking and feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_came_back',
        label: '\u201cIt came back after I stopped\u201d',
        content: `I completely understand, and that's actually really common, because the texture tends to return gradually once you're off your treatments. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you hold your results.${CONFIRM}`,
      },
      {
        key: 'obj_embarrassed',
        label: '\u201cI\u2019m embarrassed it came back\u201d',
        content: `Please don't be — this happens to almost everyone once the treatments stop, and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get back to where you were.${CONFIRM}`,
      },
      {
        key: 'obj_did_it_work',
        label: '\u201cDid it even work last time / not sure it lasts\u201d',
        content: `(Acknowledge it warmly.) That's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and what would help it hold.

(Never make guaranteed-results claims on the call.)${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['A spouse or someone else weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'Skin Tightening',
    openingChoices: [
      '\u201cSkin still firm and lifted\u201d',
      '\u201cA little has started to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you finished your skin tightening treatments with us? Is your skin still looking firm and lifted and you're loving how you look, has a little started to creep back, or are you pretty much back to where you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Holding Results',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear your skin is still looking firm and you're feeling great. Do you remember how thrilled you were when you saw how much tighter and smoother everything looked and how good you felt?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — especially once you're off the treatments, the skin can slowly start to loosen and soften again. I remember how great you were looking and how happy you were, and I'm sure you remember that feeling too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because skin naturally continues to change over time and the results gradually soften, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — was it the skin gradually loosening after you stopped, cost, just life getting busy?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad your skin is still looking firm and you're feeling great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the natural softening and the slow creep back over time. Are you noticing any little areas starting to loosen up or a bit of laxity sneaking back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. Never discuss specific treatment plans, session counts, or pricing.)

— Firmness: has the skin in the areas we treated started to loosen or soften back up since you finished?

— Sagging or laxity: are you noticing the sagging or loose feeling creeping back the way it was before — around the face, neck, or wherever we worked?

— Fine lines and wrinkles: are the fine lines, creases, or crepey texture starting to show again?

— Jawline and contour: is the definition along your jawline or the contour you loved starting to soften?

— Texture and tone: is your skin texture or tone looking less smooth and even than it did right after your treatments?

— The mirror and photos: are you feeling a little less happy with how your skin looks in the mirror or in photos again?

— Confidence: are you feeling a little less confident or frustrated with your appearance the way you were before?

— Makeup or how things sit: is makeup or skincare not sitting the way it did when your skin was at its firmest?

— Special events: is there anything coming up — a trip, a wedding, a reunion — where you'd love to look and feel your best?

— The reason you started: was there a goal or a reason you wanted this done in the first place that's back on your mind?

— The bigger picture: are you starting to wish you could just get back to looking and feeling the way you did at your best after your treatments?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it something you notice here and there, or pretty much every time you look in the mirror at this point?

How it affects you — when it's on your mind, how does it affect your day, your confidence, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to looking and feeling confident with firm, refreshed skin like you did at your best after your treatments — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back on track is the right move to get you back to looking and feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_loosened',
        label: '\u201cIt loosened back up after I stopped\u201d',
        content: `I completely understand, and that's actually really common, because skin naturally keeps changing over time once you're off your treatments. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you hold your results.${CONFIRM}`,
      },
      {
        key: 'obj_embarrassed',
        label: '\u201cI\u2019m embarrassed it came back\u201d',
        content: `Please don't be — this happens to almost everyone once the treatments stop, and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get back to where you were.${CONFIRM}`,
      },
      {
        key: 'obj_did_it_work',
        label: '\u201cDid it even work last time / not sure it lasts\u201d',
        content: `(Acknowledge it warmly.) That's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and what would help it hold.

(Never make guaranteed-results claims on the call.)${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['A spouse or someone else weighing in', 'obj_spouse'],
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
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — life gets busy and it starts to creep back on us. I remember how great you were doing and how happy you were when you finished, and I'm sure you remember that feeling too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people and it is exactly why we check in. I remember how great you looked and felt and how proud you were when you finished. What do you think has made it creep back — just life getting busy, old habits, a little of everything?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still doing great and keeping it off — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the slow creep back over time. Are you noticing any little habits or a few pounds starting to sneak back that you'd like to stay ahead of before they add up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. You are updating the file, not diagnosing or promising anything. Keep it judgment-free.)

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
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to feeling healthy and confident like you did when you finished — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_do_it_myself',
        label: '\u201cI should be able to do it myself this time\u201d',
        content: `I completely understand, and that's a great mindset. A lot of people feel that way — and what the appointment does is simply give you the support and structure that made it work the first time, which is exactly what {{provider_name}} can map out with you.${CONFIRM}`,
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
      ['A spouse or someone else weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'Red Light / Body Contouring',
    openingChoices: [
      '\u201cStill holding my results\u201d',
      '\u201cA little has started to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you finished the body contouring program with us? Are you still holding your results and loving how you look and feel in your clothes, has a little started to creep back, or are you pretty much back to where you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Holding Results',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still holding your results and feeling great. Do you remember how thrilled you were when you saw the inches come off and how good you felt in your clothes?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — especially once you're off the program the inches can slowly start creeping back on. I remember how great you were looking and how happy you were, and I'm sure you remember that feeling too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because without the sessions and the plan things tend to come back, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — was it the inches slowly returning after you stopped, cost, just life getting busy?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still holding your results and feeling great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the slow creep back over time. Are you noticing any little areas starting to soften back up or an inch or two sneaking back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. Never discuss specific treatment plans, session counts, or pricing.)

— Inches returning: have the inches started to come back around your waist, hips, or the areas we worked on since you finished the program?

— Clothes fitting: are your clothes starting to feel tighter again, or have you gone back to the bigger sizes?

— Target areas softening: are the areas you wanted to tone or tighten — like your midsection, arms, or thighs — starting to soften back up?

— Skin firmness: is your skin feeling a little less firm or tight than it did right after the program?

— The mirror and photos: are you feeling a little less happy with how you look in the mirror or in photos again?

— Confidence: are you feeling a little less confident or frustrated with your appearance the way you were before?

— Old habits: have the old eating or activity habits started creeping back in and showing up on your body?

— Energy and motivation: has your motivation to keep up with things slipped a bit since you finished?

— Special events: is there anything coming up — a trip, a wedding, a reunion — where you'd love to look and feel your best?

— The reason you started: was there a goal or a reason you wanted this done in the first place that's back on your mind?

— The bigger picture: are you starting to wish you could just get back to looking and feeling the way you did at your best after the program?

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
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to looking and feeling confident like you did at your best after the program — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back on track is the right move to get you back to looking and feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_came_back',
        label: '\u201cIt came back as soon as I stopped\u201d',
        content: `I completely understand, and that's actually really common, because it's tough to hold everything on your own once you're off the program. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you keep your results.${CONFIRM}`,
      },
      {
        key: 'obj_embarrassed',
        label: '\u201cI\u2019m embarrassed it came back\u201d',
        content: `Please don't be — this happens to almost everyone who stops, and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get back to where you were.${CONFIRM}`,
      },
      {
        key: 'obj_did_it_work',
        label: '\u201cDid it even work last time / not sure it lasts\u201d',
        content: `(Acknowledge it warmly.) That's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and what would help it hold.

(Never make guaranteed-results claims on the call.)${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['Time, or a spouse weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'Joint Pain',
    openingChoices: [
      '\u201cStill feeling good and moving well\u201d',
      '\u201cA little has started to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you finished your care with us for your joint pain? Are you still feeling good and moving well with the pain staying away, has a little of it started to creep back, or are you pretty much back to where you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Feeling Good',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still feeling good and moving well. Do you remember how great it felt to get that relief and be able to do the things you'd been missing without those joints holding you back?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — especially once you're off your care the aches and stiffness can slowly start creeping back in. I remember how much better you were feeling and how happy you were, and I'm sure you remember that relief too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because joint pain tends to gradually flare back up over time, and it is exactly why we check in. I remember how much relief you had and how good you were feeling. What do you think brought it back — was it just the aches gradually returning after you stopped, cost, just life getting busy?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still feeling good and moving well — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the slow creep back before a little stiffness or achiness turns into a full flare-up again. Are you noticing any little twinges or tightness starting to sneak back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the progress you made is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. Never give medical advice or discuss specific treatment plans, session counts, or pricing.)

— Pain returning: has the joint pain or achiness started to creep back since you finished your care?

— Which joints: is it the same joints as before — the knees, hips, shoulders, hands, back, or wherever was bothering you?

— Stiffness and mobility: are you noticing the stiffness, especially in the morning or after sitting, or a reduced range of motion coming back?

— Swelling or aching: are you having any swelling, aching, or that deep soreness in the joints again?

— Everyday activities: is it starting to get in the way of walking, stairs, gripping things, exercising, working, or the things you like to do?

— Sleep: is the joint discomfort affecting your sleep or waking you up the way it used to?

— Flare-ups and weather: are you having flare-ups or bad days more often again, maybe with weather changes or activity?

— Leaning on other things: are you finding yourself back to relying on pain relievers, ice or heat, braces, or just pushing through?

— Doing less: are you holding back from activities or hobbies again because of how your joints feel?

— Special events or goals: is there anything coming up — a trip, an event, or an activity — you'd love to feel good for?

— The reason you started: was there a goal or a reason you came in for this in the first place that's back on your mind?

— The bigger picture: are you starting to wish you could just get back to feeling and moving the way you did at your best after your care?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it something you notice here and there, or pretty much every day at this point?

How it affects you — when it's flaring up, how does it affect your day, your activities, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to feeling good, moving well, and doing the things you enjoy without those joints bothering you like you did at your best after your care — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling and moving the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_came_back',
        label: '\u201cIt came back after I stopped\u201d',
        content: `I completely understand, and that's actually really common, because joint pain tends to gradually flare back up once you're off your care. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you hold your progress.${CONFIRM}`,
      },
      {
        key: 'obj_getting_older',
        label: '\u201cI\u2019m just getting older \u2014 I have to live with it\u201d',
        content: `I hear that a lot, and please don't feel like you just have to put up with it — so many people feel and move a lot better once {{provider_name}} takes another look. That's exactly what the appointment is for.${CONFIRM}`,
      },
      {
        key: 'obj_did_it_work',
        label: '\u201cDid it even work last time / not sure it lasts\u201d',
        content: `(Acknowledge it warmly.) That's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and what would help it hold.

(Never make guaranteed-results claims on the call.)${CONFIRM}`,
      },
      {
        key: 'obj_managing',
        label: '\u201cI\u2019ve just been managing it / pushing through\u201d',
        content: `I understand, and that can get you by — but I know how much better you felt when you weren't having to rely on that. Coming in is the best way to get {{provider_name}}'s eyes on it and get you back to real relief.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['Time, or a spouse weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'Body Waxing',
    openingChoices: [
      '\u201cStill smooth and keeping up\u201d',
      '\u201cSome of it started to creep back\u201d',
      '\u201cPretty much back to shaving\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since your last waxing with us? Are you still keeping up smooth and staying in your regular rhythm, has it been a little while and some of it started to creep back, or are you pretty much back to shaving and dealing with it the way you were before you started coming in?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Smooth & Keeping Up',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still smooth and feeling great. Do you remember how nice it was to be smooth for weeks without having to think about shaving and how good it felt?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — it's easy to fall out of the rhythm and then the regrowth starts creeping back in. I remember how happy you were with how smooth it was, and I'm sure you remember that feeling too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'Fully Back to Shaving',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they fall out of the routine. The hair comes back and you end up back to shaving and dealing with the stubble and ingrowns, and it is exactly why we check in. I remember how thrilled you were to be smooth and done with all that. What do you think got you out of the rhythm — was it just life getting busy, scheduling, cost?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay in the Rhythm',
        content: `{{contact_first_name}}, I'm so glad you're still keeping up and enjoying smooth skin — that's fantastic. Let me ask you this: the hardest part for most people is staying in a regular rhythm so the hair keeps coming in finer and you never have to go back to shaving. Are you finding it's been stretching a little longer between visits than you'd like, or a few areas starting to creep back that you'd like to stay ahead of?

(Close toward a regular rhythm:) ...the best way to keep everything smooth and the regrowth finer over time is to stay on a simple regular schedule so you stay ahead of it instead of falling out of the rhythm. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so we have an accurate picture, okay?

(Ask about each one in a natural, caring way. Never improvise pricing or packages.)

— Regrowth returning: has the hair grown back in the areas we used to wax since your last visit?

— Which areas: are there specific spots you miss having done most — the brows, face, underarms, legs, bikini, Brazilian, back, or wherever we waxed you?

— Back to shaving: are you finding yourself back to shaving or trimming again the way you were before you started coming in?

— Stubble and coarseness: are you noticing the stubble, the quick prickly regrowth, or the coarser feeling that shaving brings back?

— Ingrown hairs and irritation: are the ingrown hairs, razor bumps, nicks, or irritation starting to come back?

— How long smooth lasts: are you missing how you'd stay smooth for weeks at a time instead of every day or two with a razor?

— Time and hassle: is the daily upkeep and shaving becoming a hassle again and eating up your time?

— Confidence: are you feeling a little less confident about those areas — in a swimsuit, sleeveless, or up close — the way you were before?

— Special events: is there anything coming up — a trip, a wedding, a reunion — where you'd love to be smooth and not worry about it?

— The reason you started: was there a reason you first started coming in for waxing that's back on your mind?

— The bigger picture: are you starting to wish you could just get back to that smooth, low-maintenance feeling and your regular rhythm the way you had it before?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has it been since you've been in? A few weeks, a couple months?

How often — is it here and there, or are you pretty much back to shaving or dealing with it regularly at this point?

How it affects you — when it's on your mind, how does it affect your routine, your confidence, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing we help people with every single day.`,
      },
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to that smooth, low-maintenance, confident feeling and your regular rhythm like you had it before — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so we can get you back on track and back into your smooth, low-maintenance rhythm. If it's a good fit we'd be honored to help, and if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(When scheduling, remind them to let the hair grow out to about a quarter inch and avoid shaving beforehand, exactly as your office instructs. Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_fell_out',
        label: '\u201cI fell out of the habit / it\u2019s been too long\u201d',
        content: `I completely understand, and that's actually really common — life gets busy and it's easy to fall out of the rhythm. That's exactly why coming in makes sense: we'll get you right back on track and back to smooth, and the more regular you are the finer it tends to come in.${CONFIRM}`,
      },
      {
        key: 'obj_hurts_more',
        label: '\u201cDoesn\u2019t it hurt more after a break?\u201d',
        content: `I hear that a lot, and it's a great question. That first appointment back is exactly the kind of thing our team makes as comfortable as possible, and the more regular you stay the easier it gets over time. That's something they'll walk you through when you come in.${CONFIRM}`,
      },
      {
        key: 'obj_shaving_easier',
        label: '\u201cI\u2019ve just been shaving, it\u2019s easier\u201d',
        content: `I understand, and shaving is quick — but I know the stubble, the ingrowns, and doing it every day or two got old for you. That's why you loved being smooth for weeks. Coming back in is the easiest way to get out of that daily grind again.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost', 'obj_cost'],
      ['Time, or a spouse weighing in', 'obj_spouse'],
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
        content: `{{contact_first_name}}, I'm so sorry to hear it's starting to creep back, because we remember how great you were doing when you finished your care — and I'm sure you remember that relief too?

(Let them confirm.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, I'm so sorry to hear that. I remember how much better you were moving and feeling the last time we saw you — you were so relieved, weren't you? What happened, did it just gradually come back, or did something set it off?

(Let them answer. Be sympathetic, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of a Flare',
        content: `{{contact_first_name}}, I'm so glad you're still feeling great — that is fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: when you finished care you were thrilled to be out of pain. Spinal issues do tend to creep back over time, especially once people get busy and stop their exercises, so I'm curious — are you noticing any little twinges, stiffness, or early signs starting to come back that you'd like to stay ahead of?

(Close toward a regular rhythm:) ...the best way to protect how good you feel, since spinal issues tend to creep back, is to get back in for a check and stay on a supportive schedule so you stay ahead of a flare. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. You are updating the file, not diagnosing.)

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
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it interferes.) Did I get that right?

And it sounds like that's affecting the things and the people you care about most — your work, your sleep, and getting back to being active — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back in is the right move to take the pressure off and get you back out of pain like you were before. If {{provider_name}} thinks we can help, we'll let you know and we'd be honored to. And if for some reason it's not the right fit, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_fixed_for_good',
        label: '\u201cI thought I was fixed for good\u201d',
        content: `I completely understand, and that's a great thing to bring up. Spinal issues can flare back up over time, especially with everyday wear and tear, and that's exactly the kind of thing {{provider_name}} will want to look at with you in person.${CONFIRM}`,
      },
      {
        key: 'obj_injections',
        label: '\u201cI\u2019m considering injections or surgery\u201d',
        content: `That makes total sense, and many people like to see where a conservative option fits before making a bigger decision — which is exactly what the appointment is for.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['Time / number of visits', 'obj_time'],
      ['A spouse or another person weighing in', 'obj_spouse'],
    ],
  },
  {
    name: 'Acupuncture',
    openingChoices: [
      '\u201cStill feeling good and balanced\u201d',
      '\u201cA little has started to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you finished your acupuncture care with us? Are you still feeling good and balanced with whatever we were helping you with staying away, has a little of it started to creep back, or are you pretty much back to where you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Feeling Good',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still feeling good and balanced. Do you remember how great it felt to get that relief and feel more like yourself again without what had been bothering you holding you back?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `{{contact_first_name}}, I really appreciate you being honest, and that is so common — especially once you're off your sessions the old symptoms can slowly start creeping back in. I remember how much better you were feeling and how happy you were, and I'm sure you remember that relief too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because these things can gradually return over time when you fall out of the rhythm, and it is exactly why we check in. I remember how much relief you had and how good you were feeling. What do you think brought it back — was it just the symptoms gradually returning after you stopped, cost, just life getting busy?

(Let them answer. Be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still feeling good and balanced — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the slow creep back before a little stress or tension builds back into where you started. Are you noticing any little things starting to sneak back that you'd like to stay ahead of before they add up?

(Close toward a regular rhythm:) ...the best way to protect all the progress you made is to come in for a check and stay on a simple maintenance rhythm so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way. Never give medical advice or discuss specific treatment plans, session counts, or pricing.)

— What we were helping with: has the main thing we were working on — whether that was pain, stress, sleep, or something else — started to creep back since you finished?

— Pain or tension: are you noticing any aches, pain, or muscle tension coming back the way it was before?

— Stress and mood: are you feeling more stressed, tense, or run-down again lately?

— Sleep: is your sleep slipping back to how it was before — trouble falling asleep or staying asleep?

— Energy: is your energy lower, or are you feeling more drained or out of balance again?

— Digestion or other symptoms: are any of the other things we were helping with — like digestion, headaches, or tension — starting to return?

— Everyday life: is it starting to get in the way of work, activities, or the things you like to do again?

— Leaning on other things: are you finding yourself back to relying on pain relievers, extra caffeine, or just pushing through the way you were before?

— Special events or goals: is there anything coming up — a trip, an event, or a stressful stretch — you'd love to feel your best for?

— The reason you started: was there a goal or a reason you came in for acupuncture in the first place that's back on your mind?

— The bigger picture: are you starting to wish you could just get back to feeling balanced and like yourself the way you did at your best after your sessions?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it something you notice here and there, or pretty much every day at this point?

How it affects you — when it's acting up, how does it affect your day, your mood, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      review: {
        title: 'The Review & Bridge to Emotion',
        content: `{{contact_first_name}}, let me make sure I've got this right. (Recap what they told you: how long, how often, how it affects them.) Did I get that right?

And it sounds like you'd really just love to get back to feeling balanced, relaxed, and like yourself again like you did at your best after your sessions — is that fair to say?

(About 95% say yes. That yes is the moment.)`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_came_back',
        label: '\u201cIt came back after I stopped\u201d',
        content: `I completely understand, and that's actually really common, because these things can gradually return once you're off your sessions and out of the rhythm. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you hold your progress.${CONFIRM}`,
      },
      {
        key: 'obj_skeptical',
        label: '\u201cNot sure it really did anything / I\u2019m skeptical\u201d',
        content: `(Acknowledge it warmly.) That's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and what would help.

(Never make guaranteed-results claims on the call.)${CONFIRM}`,
      },
      {
        key: 'obj_managing',
        label: '\u201cI\u2019ve just been managing on my own\u201d',
        content: `I understand, and that can get you by — but I know how much better you felt when things were more balanced. Coming in is the best way to get {{provider_name}}'s eyes on it and get you back to feeling your best.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['Time, or a spouse weighing in', 'obj_spouse'],
    ],
  },
]

// ---------------------------------------------------------------------------

const { rows: nicheRows } = await client.query(
  'select id, name from niches',
)
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

  // Keep sort_order aligned with the general flow so the start step stays 'open'
  const { rows: generalSteps } = await client.query(
    'select step_key, sort_order from script_flow_steps where niche_id is null',
  )
  const generalOrder = new Map(generalSteps.map((r) => [r.step_key, r.sort_order]))

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
      [nicheId, obj.key, `Objection: ${obj.label.replace(/[\u201c\u201d]/g, '')}`, obj.content, objSort++],
    )
  }

  // Choices ------------------------------------------------------------
  const choices = []

  // Opening question: niche-specific labels for the three answers
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
    // Loops back from each niche-specific objection step
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
