/**
 * Seeds script flows for the 5 niches added/aligned from the official
 * Script-Only PDFs: Neuropathy, Laser Hair Removal, Dental Implants,
 * Clear Aligners, and Orthodontics / Braces.
 *
 * Content is extracted from the "Reactivation Power Program" Script-Only
 * documents. Same structure/upsert logic as seed-niche-flows.mjs.
 * Also seeds the 4 script_sections slots for the two brand-new niches.
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
    name: 'Neuropathy',
    openingChoices: [
      '\u201cStill under control \u2014 feeling good\u201d',
      '\u201cA little is starting to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you finished the neuropathy program with us? Are the numbness and tingling still under control and you're feeling good and getting around well, has a little of it started to creep back, or are you pretty much back to where you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Under Control',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still doing great and staying on top of it. Do you remember how much of a relief it was when the numbness and tingling settled down and you could get around and sleep so much better?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `{{contact_first_name}}, I appreciate you sharing that, and that is actually really common — the nerve symptoms can gradually return once the program ends. I remember how much better you were moving and sleeping and how relieved you were, and I'm sure you remember that feeling too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because the nerve symptoms can gradually return, and it is exactly why we check in. I remember how much better you were moving and sleeping and how relieved you were. What do you think brought it back — the symptoms slowly returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still doing great and staying on top of it — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the symptoms and the slow creep back over time. Are you noticing any little signs — a bit of tingling, some numbness, or a little less steadiness — starting to sneak back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the progress you made is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, treating, or promising anything. Never discuss specific treatments or medications.)

— Numbness returning: has the numbness in your feet or hands started to come back since you finished the program?

— Tingling and pins-and-needles: are you noticing the tingling or that pins-and-needles feeling creeping back in the way it was before?

— Burning or shooting pain: has the burning, stabbing, or shooting pain started to return, especially at night?

— Balance and steadiness: are you feeling less steady on your feet again, or worried about losing your balance or a fall?

— Feeling in your feet and hands: is it getting harder to feel the floor, buttons, or small objects again?

— Sleep: is the discomfort disturbing your sleep again the way it was before?

— Walking and getting around: are you finding it harder to walk, stand, or stay on your feet for as long as you'd like?

— Energy and mood: is the ongoing discomfort wearing on you again and leaving you more tired, frustrated, or down?

— Everyday tasks: are the symptoms starting to get in the way of the things you like to do or need to do each day?

— Confidence and independence: are you feeling a little less confident getting around on your own or doing things you used to do easily?

— Special events: is there anything coming up — a trip, a wedding, a reunion — where you'd love to be comfortable and steady on your feet?

— Health reasons: was there a health reason behind the neuropathy that's on your mind again?

— The bigger picture: are you starting to wish you could just get back to feeling the way you did when the symptoms were under control?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it here and there, or is it pretty much every day at this point?

How it affects you — when it's acting up, how does it affect your day, your sleep, your confidence, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_came_back_stopped',
        label: '\u201cThe symptoms came back as soon as I stopped\u201d',
        content: `I completely understand, and that's actually really common, because the nerve symptoms can slowly return once you're off the program. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you stay ahead of it.${CONFIRM}`,
      },
      {
        key: 'obj_frustrated',
        label: '\u201cI\u2019m frustrated it came back\u201d',
        content: `Please don't be — this happens to almost everyone whose symptoms return, and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get back to where you were.${CONFIRM}`,
      },
      {
        key: 'obj_bad_experience',
        label: 'Side effects or a bad experience before',
        content: `(Acknowledge it warmly and explain that's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture. Never give medical advice on the call.)

{{contact_first_name}}, I completely understand, and I'm glad you told me. That's exactly the kind of thing {{provider_name}} will want to talk through with you in person so you can look at the whole picture together.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Laser Hair Removal',
    openingChoices: [
      '\u201cStill smooth and loving it\u201d',
      '\u201cA little regrowth is creeping back\u201d',
      '\u201cPretty much back to shaving or waxing\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you finished your laser hair removal treatments with us? Are the treated areas still smooth and staying clear and you're loving it, has a little regrowth started to creep back, or are you pretty much back to shaving or waxing the way you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Smooth and Loving It',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still enjoying smooth, clear skin. Do you remember how great it felt to be done with the constant shaving and waxing and how happy you were with how smooth everything stayed?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Regrowth Is Creeping Back',
        content: `{{contact_first_name}}, I appreciate you sharing that, and that does happen — especially if the series got interrupted or hormones are involved. I remember how thrilled you were to be smooth and done with all that, and I'm sure you remember that feeling too?

(Let them confirm, with zero judgment.)`,
      },
      resp_fully_back: {
        title: 'Back to Shaving or Waxing',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people, especially if the series got interrupted or hormones are involved. The hair can come back and you end up shaving again, and it is exactly why we check in. I remember how thrilled you were to be smooth and done with all that. What do you think made it come back — not finishing the full series, hormones, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still enjoying smooth skin — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the little bit of regrowth that can sneak back over time, especially if the full series wasn't finished. Are you noticing any fine hairs or a few spots starting to come back that you'd like to stay ahead of before they add up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which one bothers them most. You are updating the file, not diagnosing, promising, or committing them to anything. Keep it judgment-free, and never discuss specific treatment plans, session counts, settings, or pricing.)

— Regrowth returning: has the hair started to grow back in the areas we treated since you finished?

— Which areas: are there specific spots creeping back more than others — the underarms, legs, bikini area, face, or wherever we worked?

— Back to shaving or waxing: are you finding yourself back to shaving, waxing, or plucking again the way you were before?

— Stubble and texture: are you noticing the stubble, prickly feeling, or coarser hair coming back?

— Ingrown hairs and irritation: are the ingrown hairs, razor bumps, or irritation starting to come back?

— How smooth it stays: is the skin just not staying as smooth for as long as it did right after your treatments?

— Time and hassle: is the upkeep — the shaving and the maintenance — becoming a hassle again and eating up your time?

— Confidence: are you feeling a little less confident about the treated areas — in a swimsuit, sleeveless, or up close — the way you were before?

— Special events: is there anything coming up — a trip, a wedding, a reunion — where you'd love to feel smooth and not worry about it?

— The reason you started: was there a goal or a reason you wanted this done in the first place that's back on your mind?

— The bigger picture: are you starting to wish you could just get back to that smooth, low-maintenance feeling the way you had it at your best after your treatments?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been creeping back? A few weeks, a couple months?

How often — is it here and there, or are you pretty much back to shaving or dealing with it regularly at this point?

How it affects you — when it's on your mind, how does it affect your routine, your confidence, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good," and never "when can we get you on the schedule." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_permanent',
        label: '\u201cI thought it was supposed to be permanent\u201d',
        content: `I completely understand, and that's a great question — laser hair removal reduces hair, but some regrowth can happen over time, especially with things like hormones or if the full series wasn't finished. That's exactly why coming in makes sense, so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track.${CONFIRM}`,
      },
      {
        key: 'obj_frustrated',
        label: '\u201cI\u2019m frustrated it came back\u201d',
        content: `I completely understand, and please don't be hard on yourself — some regrowth is common and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get back to where you were.${CONFIRM}`,
      },
      {
        key: 'obj_did_it_work',
        label: '\u201cDid it even work last time / does it last?\u201d',
        content: `(Acknowledge it warmly. Never make guaranteed-results or permanence claims on the call.)

That's a completely fair question, {{contact_first_name}}, and it's exactly the kind of thing {{provider_name}} will want to talk through in person — so they can look at the whole picture and what would help it hold.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Dental Implants',
    openingChoices: [
      '\u201cIt\u2019s still about the same\u201d',
      '\u201cIt\u2019s starting to bother me more\u201d',
      '\u201cIt\u2019s gotten significantly worse\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, when we last saw you, you were dealing with (the missing tooth or teeth, loose or failing teeth, difficulty chewing, denture problems, or the specific concern from their chart). How has that been since we last saw you? Is it still about the same, is it starting to bother you more, or has the situation gotten significantly worse?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still About the Same',
        content: `You know what, {{contact_first_name}}? I'm glad to hear it hasn't gotten worse. Do you remember what originally brought you in and what you were hoping to change about your smile, your ability to chew, or the way your teeth were affecting you?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Bothering Them More',
        content: `Oh {{contact_first_name}}, I'm sorry to hear that. I remember how much this was affecting you when we last saw you. What happened — did it gradually get worse, or did something change?

(Let them answer, be sympathetic, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Gotten Significantly Worse',
        content: `Oh {{contact_first_name}}, I'm so sorry to hear that. I remember how much this was affecting you when we last saw you. What happened — did it gradually get worse, or did something change?

(Let them answer, be sympathetic, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Still Want It Handled?',
        content: `{{contact_first_name}}, I'm glad to hear things haven't gotten significantly worse, and I know {{provider_name}} will be glad to hear that too. Let me ask you this: when you originally came in, you were concerned about (their original concern). Is that something you still eventually want to get taken care of, or have you decided you're comfortable leaving things the way they are?

(If they still want it handled, continue to the recommendation. Can I make a recommendation?)`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing.)

— The original concern: is the missing tooth, loose or failing tooth, or denture problem we saw you for still there or getting worse?

— Chewing and eating: is it affecting what you can eat, or are you avoiding certain foods because of it?

— Discomfort: any pain, soreness, or irritation in that area?

— Your smile: are you feeling self-conscious about your smile — covering your mouth, holding back in photos?

— Everyday life: is it getting in the way of eating out, socializing, or speaking comfortably?

— The bigger picture: are you starting to worry about it getting worse or affecting the neighboring teeth down the road?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been going on or getting worse? A few weeks, a couple months?

How often — is it here and there, or pretty much every day at this point?

How it affects you — when it's bothering you, how does it affect your meals, your confidence, the things you like to do? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that is exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take a look and determine what options may be available to help you replace the missing or failing teeth and get back to eating and smiling with confidence. If {{provider_name}} thinks dental implants may be a good option for you, we'll let you know and explain what would be involved. And if for some reason they're not the right fit, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_candidate',
        label: '\u201cI\u2019m worried I won\u2019t be a candidate\u201d',
        content: `I completely understand, and that's exactly why the first step is the appointment. {{provider_name}} needs to evaluate your individual situation before anyone can tell you which options may or may not be appropriate.${CONFIRM}`,
      },
      {
        key: 'obj_procedure',
        label: '\u201cI\u2019m worried about the procedure\u201d',
        content: `That makes total sense, and that's a great thing to discuss with {{provider_name}}. The appointment gives you an opportunity to understand what would actually be involved in your situation before making any decisions.${CONFIRM}`,
      },
      {
        key: 'obj_too_old',
        label: '\u201cI\u2019m too old for implants\u201d',
        content: `I understand why you might wonder about that. Whether dental implants are appropriate isn't something we can determine over the phone — that's exactly what {{provider_name}} can evaluate with you in person.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Clear Aligners',
    openingChoices: [
      '\u201cStill want to get it taken care of\u201d',
      '\u201cIt\u2019s been bothering me more\u201d',
      '\u201cI\u2019ve decided not to do anything\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, when we last spoke with you, you were considering clear aligners because of (crowding, spacing, crooked teeth, bite concerns, or the specific concern from their file). How are you feeling about that now? Is it still something you'd like to get taken care of, has it started bothering you more, or have you pretty much decided not to do anything about it?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Wants It Taken Care Of',
        content: `You know what, {{contact_first_name}}? That's great to hear. Do you remember what originally made you interested in clear aligners and what you were hoping would be different about your teeth or smile once treatment was completed?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'It\u2019s Bothering Them More',
        content: `{{contact_first_name}}, I completely understand. I remember this was something you really wanted to change when we last spoke with you. What has been bothering you more about it lately?

(Let them answer — do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'Decided Not to Do Anything',
        content: `I completely understand, {{contact_first_name}}. When we last spoke, I remember there was a reason you were considering clear aligners in the first place. What changed? Was there something specific that kept you from moving forward?

(Let them answer — usually timing or cost. Be warm and non-judgmental.)`,
      },
      doing_well_variant: {
        title: 'Still Interested but Lapsed \u2014 No Pressure',
        content: `{{contact_first_name}}, I completely understand, and there's absolutely no pressure. When you originally reached out to us, you were interested in getting (their original concern) taken care of. I'm curious — is having straighter teeth and improving your smile still something you'd like to accomplish at some point?

(Let them respond, then:) What's been the biggest thing that's kept you from moving forward?

(Their answer tells you the objection to resolve. Can I make a recommendation?)`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so we have an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing.)

— The original concern: is the crowding, spacing, crooked teeth, or bite concern still bothering you the way it was?

— Noticing it more: are you noticing it more lately — in photos, on video calls, or up close?

— Self-consciousness: are you finding yourself holding back your smile or feeling self-conscious about it?

— Everyday life: is it on your mind in social settings, at work, or when meeting new people?

— The bigger picture: is getting it finally taken care of something that's been on your mind more and more?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been bothering you? Since we last spoke, or longer?

How often — is it something you notice here and there, or pretty much every time you see your smile?

How it affects you — when it's on your mind, how does it affect your confidence, your photos, the way you feel meeting people? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that's exactly the kind of thing we help people with every single day.`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with a consultation so we can take another look at where things stand and determine whether a clear-aligner option may be appropriate for your situation. If it looks like a good fit, we'll let you know and explain what treatment would involve. And if for some reason it's not the right fit, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
      scheduling: {
        title: 'Scheduling \u2014 Two Yes-Yes Options',
        content: `Wonderful, {{contact_first_name}}. We have consultation times available this week on Tuesday and Wednesday — do mornings or afternoons work better for you?

Perfect, I have a 2:30 and a 5:30 — which is better?

Great, I've got you down for Wednesday at 5:30.

(Always offer two yes-yes options within 48 hours. Once booked, add your notes and press the green "Scheduled" button below to log the call.)`,
      },
    },
    objections: [
      {
        key: 'obj_candidate',
        label: '\u201cAm I even a candidate?\u201d',
        content: `I completely understand, and that's exactly why the first step is the consultation. Your individual situation needs to be evaluated before anyone can tell you whether clear aligner treatment is appropriate for you.${CONFIRM}`,
      },
      {
        key: 'obj_involved',
        label: '\u201cWhat would treatment involve?\u201d',
        content: `That makes total sense, and that's a great thing to discuss during your consultation. The first step is simply understanding what treatment would actually involve for you before making any decisions.${CONFIRM}`,
      },
      {
        key: 'obj_lifestyle',
        label: '\u201cWill it fit my lifestyle?\u201d',
        content: `I completely understand. That's something we can talk through with you so you understand what treatment requires and can decide whether it's a good fit for your lifestyle.${CONFIRM}`,
      },
      {
        key: 'obj_age',
        label: 'Concerned about age',
        content: `I understand, and that's actually one of the reasons many people originally become interested in clear aligners. The consultation is simply to determine whether a clear-aligner option may be appropriate for your situation.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or timing', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Orthodontics / Braces',
    openingChoices: [
      '\u201cStill want to get it taken care of\u201d',
      '\u201cIt\u2019s been bothering me more\u201d',
      '\u201cI\u2019ve decided not to do anything\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, when we last saw you, you were considering braces because of (crowding, spacing, crooked teeth, bite concerns, or the specific concern from their chart). How are you feeling about that now? Is it still something you'd like to get taken care of, has it started bothering you more, or have you pretty much decided not to do anything about it?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Wants It Taken Care Of',
        content: `You know what, {{contact_first_name}}? I'm glad to hear it's still something you'd like to address. Do you remember what originally brought you in and what you were hoping would be different once your teeth were straightened and your orthodontic treatment was completed?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'It\u2019s Bothering Them More',
        content: `{{contact_first_name}}, I completely understand. I remember this was something you really wanted to get taken care of when we last saw you. What has been bothering you more about it lately?

(Let them answer — do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'Decided Not to Do Anything',
        content: `I completely understand, {{contact_first_name}}. When we last saw you, I remember there was a reason you were considering braces in the first place. What changed? Was there something specific that kept you from moving forward?

(Let them answer — usually timing or cost. Be warm and non-judgmental.)`,
      },
      doing_well_variant: {
        title: 'Still Interested but Lapsed \u2014 No Pressure',
        content: `{{contact_first_name}}, I completely understand, and there's absolutely no pressure. When you originally came in, you were interested in getting (their original concern) taken care of. I'm curious — is having straighter teeth and improving your smile still something you'd like to accomplish at some point?

(Let them respond, then:) What's been the biggest thing that's kept you from moving forward?

(Close toward the visit:) ...the best way to know where things stand now and what your options look like is to get you back in with {{provider_name}}. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing.)

— The original concern: is the crowding, spacing, crooked teeth, or bite concern still bothering you the way it was?

— Noticing it more: are you noticing it more lately — in photos, on video calls, or up close?

— Self-consciousness: are you finding yourself holding back your smile or feeling self-conscious about it?

— Everyday life: is it on your mind in social settings, at work, or when meeting new people?

— The bigger picture: is getting it finally taken care of something that's been on your mind more and more?

Recap and focus: So {{contact_first_name}}, it sounds like the biggest things are X, Y, and Z — is that right? Of everything we just talked about, which one bothers you the most?

(Their answer is the heart of the close.)`,
      },
      making_it_real: {
        title: 'Making It Real',
        content: `(Take the concern they named and make it present with three questions, in order.)

How long — how long has that been bothering you? Since we last saw you, or longer?

How often — is it something you notice here and there, or pretty much every time you see your smile?

How it affects you — when it's on your mind, how does it affect your confidence, your photos, the way you feel meeting people? (Let them open up — do not rush.)

Then respond with empathy: Thank you for sharing that, it makes complete sense, and that is exactly the kind of thing {{provider_name}} helps people with every single day.`,
      },
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so {{provider_name}} can take another look and see if getting you started with braces is the right move to address the concerns you originally came in for and help you get the smile you've been wanting. If {{provider_name}} thinks we can help, we'll let you know and we'd be honored to. And if for some reason it's not the right fit, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_options',
        label: 'Questions about the treatment options',
        content: `I completely understand, and that's a great thing to bring up. The first step is simply getting back in so {{provider_name}} can go over the treatment options that may be appropriate for you and answer those questions.${CONFIRM}`,
      },
      {
        key: 'obj_how_long',
        label: '\u201cHow long will treatment take?\u201d',
        content: `That makes total sense. Treatment time depends on the individual situation, which is exactly why {{provider_name}} would need to take another look before anyone could tell you what your treatment would involve.${CONFIRM}`,
      },
      {
        key: 'obj_too_old',
        label: '\u201cAm I too old for braces?\u201d',
        content: `I completely understand why you might feel that way. We see people at many different ages who want to improve their smile. The appointment is simply an opportunity for {{provider_name}} to evaluate your situation and discuss what options may be appropriate.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or timing', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
]

// ---------------------------------------------------------------------------
// Legacy merged-script sections for the two brand-new niches
// ---------------------------------------------------------------------------

const NEW_SECTIONS = {
  'Clear Aligners': {
    opening_hook: 'I hope you have been doing well and smiling often!',
    reason_for_visit:
      'When we last spoke, you were considering clear aligners, and we wanted to check in on where things stand and answer any questions that have come up since.',
    offer_details:
      'We would love to set up a consultation to take another look and go over the clear-aligner options that may be appropriate for your situation.',
    objection_handler:
      'I completely understand. The consultation is simply to see whether clear aligners may be a good fit for you — you are not committing to anything today.',
  },
  'Orthodontics / Braces': {
    opening_hook: 'I hope you have been doing well and smiling often!',
    reason_for_visit:
      'When we last saw you, you were considering braces, and the doctor wanted to check in on where things stand and answer any questions that have come up since.',
    offer_details:
      'We would love to get you back in so the doctor can take another look and go over the treatment options that may be appropriate for you.',
    objection_handler:
      'I completely understand. The appointment is simply an opportunity to evaluate your situation and understand your options — you are not committing to anything today.',
  },
}

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

// Seed legacy sections for the two brand-new niches
for (const [name, slots] of Object.entries(NEW_SECTIONS)) {
  const nicheId = nicheIdByName.get(name)
  if (!nicheId) continue
  await client.query('delete from script_sections where niche_id = $1', [
    nicheId,
  ])
  for (const [slot, content] of Object.entries(slots)) {
    await client.query(
      'insert into script_sections (niche_id, slot_name, content) values ($1, $2, $3)',
      [nicheId, slot, content],
    )
  }
  console.log(`SECTIONS ${name}: ${Object.keys(slots).length} slots`)
}

await client.end()
