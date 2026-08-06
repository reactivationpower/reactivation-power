/**
 * Seeds niche-specific script flows (batch C) from the official Script-Only
 * PDFs: Body Waxing, Cellulite Reduction, Red Light / Body Contouring,
 * Skin Tightening, Teeth Whitening.
 * Same structure/upsert logic as seed-remaining-flows-a.mjs.
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
    name: 'Body Waxing',
    openingChoices: [
      '\u201cStill smooth and keeping up\u201d',
      '\u201cSome of it\u2019s started to creep back\u201d',
      '\u201cPretty much back to shaving\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since your last waxing with us? Are you still keeping up smooth and staying in your regular rhythm, has it been a little while and some of it started to creep back, or are you pretty much back to shaving and dealing with it the way you were before you started coming in?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Smooth and Keeping Up',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still smooth and feeling great. Do you remember how nice it was to be smooth for weeks without having to think about shaving and how good it felt?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they fall out of the routine. The hair comes back and you end up back to shaving and dealing with the stubble and ingrowns, and it is exactly why we check in. I remember how thrilled you were to be smooth and done with all that. What do you think got you out of the rhythm — was it just life getting busy, scheduling, cost?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'Back to Shaving',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they fall out of the routine. The hair comes back and you end up back to shaving and dealing with the stubble and ingrowns, and it is exactly why we check in. I remember how thrilled you were to be smooth and done with all that. What do you think got you out of the rhythm — was it just life getting busy, scheduling, cost?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still keeping up and enjoying smooth skin — that's fantastic. Let me ask you this: the hardest part for most people is staying in a regular rhythm so the hair keeps coming in finer and you never have to go back to shaving. Are you finding it's been stretching a little longer between visits than you'd like, or a few areas starting to creep back that you'd like to stay ahead of?

(Close toward a regular rhythm:) ...the best way to keep everything smooth and the regrowth finer over time is to stay on a simple regular schedule so you stay ahead of it instead of falling out of the rhythm. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so we have an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, promising, or committing them to anything. Keep it judgment-free, and never improvise pricing or packages.)

— Regrowth returning: has the hair grown back in the areas we used to wax since your last visit?

— Which areas: are there specific spots you miss having done most, like the brows, face, underarms, legs, bikini, Brazilian, back, or wherever we waxed you?

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
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so we can get you back on track and back into your smooth, low-maintenance rhythm. If it's a good fit we'd be honored to help, and if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next. Remind them to let the hair grow out to about a quarter inch and avoid shaving beforehand, exactly as your office instructs.)`,
      },
    },
    objections: [
      {
        key: 'obj_fell_out',
        label: '\u201cI fell out of the habit / it\u2019s been too long\u201d',
        content: `I completely understand, and that's actually really common — life gets busy and it's easy to fall out of the rhythm. That's exactly why coming in makes sense: we'll get you right back on track and back to smooth, and the more regular you are the finer it tends to come in.${CONFIRM}`,
      },
      {
        key: 'obj_hurt_more',
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
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Cellulite Reduction',
    openingChoices: [
      '\u201cStill looking smooth and toned\u201d',
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
        title: 'Still Smooth and Toned',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear the skin is still looking smooth and you're feeling great. Do you remember how thrilled you were when you saw how much smoother and more toned everything looked and how good you felt?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because the dimpling and texture tend to return over time, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — was it the texture gradually returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'Pretty Much Back to Before',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because the dimpling and texture tend to return over time, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — was it the texture gradually returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad the skin is still looking smooth and you're feeling great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the texture slowly coming back over time. Are you noticing any little areas where the dimpling is starting to sneak back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, promising, or committing them to anything. Keep it judgment-free, and never discuss specific treatment plans, session counts, or pricing.)

— Dimpling returning: has the dimpling or that orange-peel texture started to come back in the areas we treated since you finished?

— Which areas: are there specific spots creeping back more than others, like the thighs, buttocks, hips, or wherever we worked?

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
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back on track is the right move to get you back to looking and feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
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
        label: '\u201cDid it even work last time?\u201d',
        content: `That's a completely fair question, and it's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and what would help it hold. (Never make guaranteed-results claims on the call.)${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
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
        title: 'Still Holding Their Results',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still holding your results and feeling great. Do you remember how thrilled you were when you saw the inches come off and how good you felt in your clothes?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because without the sessions and the plan things tend to come back, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — was it the inches slowly returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'Pretty Much Back to Before',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because without the sessions and the plan things tend to come back, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — was it the inches slowly returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still holding your results and feeling great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the slow creep back over time. Are you noticing any little areas starting to soften back up or an inch or two sneaking back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, promising, or committing them to anything. Keep it judgment-free, and never discuss specific treatment plans, session counts, or pricing.)

— Inches returning: have the inches started to come back around your waist, hips, or the areas we worked on since you finished the program?

— Clothes fitting: are your clothes starting to feel tighter again, or have you gone back to the bigger sizes?

— Target areas softening: are the areas you wanted to tone or tighten, like your midsection, arms, or thighs, starting to soften back up?

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
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back on track is the right move to get you back to looking and feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
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
        label: '\u201cDid it even work last time?\u201d',
        content: `That's a completely fair question, and it's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and what would help it hold. (Never make guaranteed-results claims on the call.)${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Skin Tightening',
    openingChoices: [
      '\u201cStill looking firm and lifted\u201d',
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
        title: 'Still Firm and Lifted',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear your skin is still looking firm and you're feeling great. Do you remember how thrilled you were when you saw how much tighter and smoother everything looked and how good you felt?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because skin naturally continues to change over time and the results gradually soften, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — was it the skin gradually loosening after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'Pretty Much Back to Before',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because skin naturally continues to change over time and the results gradually soften, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — was it the skin gradually loosening after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad your skin is still looking firm and you're feeling great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the natural softening and the slow creep back over time. Are you noticing any little areas starting to loosen up or a bit of laxity sneaking back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, promising, or committing them to anything. Keep it judgment-free, and never discuss specific treatment plans, session counts, or pricing.)

— Firmness returning to how it was: has the skin in the areas we treated started to loosen or soften back up since you finished?

— Sagging or laxity: are you noticing the sagging or loose feeling creeping back the way it was before, around the face, neck, or wherever we worked?

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
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back on track is the right move to get you back to looking and feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
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
        label: '\u201cDid it even work last time?\u201d',
        content: `That's a completely fair question, and it's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and what would help it hold. (Never make guaranteed-results claims on the call.)${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Teeth Whitening',
    openingChoices: [
      '\u201cStill bright and white\u201d',
      '\u201cSome staining has crept back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since you had your teeth whitening done with us? Is your smile still looking bright and white and you're loving it, has a little staining started to creep back, or are you pretty much back to where you were before you started with us?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Bright and White',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear your smile is still looking bright and you're feeling great. Do you remember how thrilled you were when you saw how much whiter and brighter your smile looked and how confident it made you feel?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Staining Creeping Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people, because teeth naturally restain over time with the things we eat and drink, and it is exactly why we check in. I remember how bright and confident your smile was. What do you think brought the staining back — was it coffee or wine, everyday foods, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'Pretty Much Back to Before',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people, because teeth naturally restain over time with the things we eat and drink, and it is exactly why we check in. I remember how bright and confident your smile was. What do you think brought the staining back — was it coffee or wine, everyday foods, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad your smile is still looking bright and you're feeling great — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the everyday staining from coffee, wine, and food that slowly builds back up over time. Are you noticing any little bit of dullness or staining starting to sneak back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect that bright smile is to come in for a quick check and stay on a simple maintenance or touch-up rhythm so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, giving dental advice, or promising anything. Keep it judgment-free, and never discuss specific products, strengths, or pricing.)

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
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if a touch-up or getting you back on track is the right move to get your smile back to the way it looked before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
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
        content: `I completely understand, and that's exactly the kind of thing {{provider_name}} will want to talk through in person, so they can look at the whole picture and make it comfortable. (Never give dental advice on the call.)${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
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
