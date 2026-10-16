/**
 * Seeds niche-specific script flows (batch B) from the official Script-Only
 * PDFs: Acupuncture, Joint Pain, Gut Health, GLP Patients, Massage Therapy.
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
        title: 'Still Feeling Good and Balanced',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still feeling good and balanced. Do you remember how great it felt to get that relief and feel more like yourself again without what had been bothering you holding you back?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because these things can gradually return over time when you fall out of the rhythm, and it is exactly why we check in. I remember how much relief you had and how good you were feeling. What do you think brought it back — the symptoms gradually returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because these things can gradually return over time when you fall out of the rhythm, and it is exactly why we check in. I remember how much relief you had and how good you were feeling. What do you think brought it back — the symptoms gradually returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still feeling good and balanced — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the slow creep back before a little stress or tension builds back into where you started. Are you noticing any little things starting to sneak back that you'd like to stay ahead of before they add up?

(Close toward a regular rhythm:) ...the best way to protect all the progress you made is to come in for a check and stay on a simple maintenance rhythm so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, giving medical advice, or committing them to anything. Keep it judgment-free, and never discuss specific treatment plans, session counts, or pricing.)

— What we were helping with: has the main thing we were working on — whether that was pain, stress, sleep, or something else — started to creep back since you finished?

— Pain or tension: are you noticing any aches, pain, or muscle tension coming back the way it was before?

— Stress and mood: are you feeling more stressed, tense, or run-down again lately?

— Sleep: is your sleep slipping back to how it was before — trouble falling asleep or staying asleep?

— Energy: is your energy lower, or are you feeling more drained or out of balance again?

— Digestion or other symptoms: are any of the other things we were helping with, like digestion, headaches, or tension, starting to return?

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
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_came_back_stopped',
        label: '\u201cIt came back after I stopped\u201d',
        content: `I completely understand, and that's actually really common, because these things can gradually return once you're off your sessions and out of the rhythm. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you hold your progress.${CONFIRM}`,
      },
      {
        key: 'obj_skeptical',
        label: '\u201cI\u2019m not sure it really did anything\u201d',
        content: `(Acknowledge it warmly. Never make guaranteed-results claims on the call.)

{{contact_first_name}}, I completely understand, and I'm glad you told me. That's exactly the kind of thing {{provider_name}} will want to talk through with you in person, so you can look at the whole picture and what would help.${CONFIRM}`,
      },
      {
        key: 'obj_managing_own',
        label: '\u201cI\u2019ve just been managing on my own\u201d',
        content: `I understand, and that can get you by, but I know how much better you felt when things were more balanced. Coming in is the best way to get {{provider_name}}'s eyes on it and get you back to feeling your best.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
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
        title: 'Still Feeling Good and Moving Well',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still feeling good and moving well. Do you remember how great it felt to get that relief and be able to do the things you'd been missing without those joints holding you back?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because joint pain tends to gradually flare back up over time, and it is exactly why we check in. I remember how much relief you had and how good you were feeling. What do you think brought it back — the aches gradually returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because joint pain tends to gradually flare back up over time, and it is exactly why we check in. I remember how much relief you had and how good you were feeling. What do you think brought it back — the aches gradually returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still feeling good and moving well — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the slow creep back before a little stiffness or achiness turns into a full flare-up again. Are you noticing any little twinges or tightness starting to sneak back that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the progress you made is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, giving medical advice, or committing them to anything. Keep it judgment-free.)

— Pain returning: has the joint pain or achiness started to creep back since you finished your care?

— Which joints: is it the same joints as before — like the knees, hips, shoulders, hands, back, or wherever was bothering you?

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
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling and moving the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_came_back_stopped',
        label: '\u201cIt came back after I stopped\u201d',
        content: `I completely understand, and that's actually really common, because joint pain tends to gradually flare back up once you're off your care. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you hold your progress.${CONFIRM}`,
      },
      {
        key: 'obj_getting_older',
        label: '\u201cI\u2019m just getting older, I have to live with it\u201d',
        content: `I hear that a lot, and please don't feel like you just have to put up with it — so many people feel and move a lot better once {{provider_name}} takes another look. That's exactly what the appointment is for.${CONFIRM}`,
      },
      {
        key: 'obj_managing_own',
        label: '\u201cI\u2019ve been managing with pain relievers\u201d',
        content: `I understand, and that can get you by, but I know how much better you felt when you weren't having to rely on that. Coming in is the best way to get {{provider_name}}'s eyes on it and get you back to real relief.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Gut Health',
    openingChoices: [
      '\u201cStill feeling good and settled\u201d',
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
        title: 'Still Feeling Settled',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still doing great and feeling settled. Do you remember how much of a relief it was when the bloating and discomfort calmed down and you had your energy back and felt like yourself again?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Starting to Creep Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because the gut can slip back into old patterns, and it is exactly why we check in. I remember how much better you felt and how relieved you were. What do you think brought it back — the symptoms slowly returning after you stopped, diet slipping back, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because the gut can slip back into old patterns, and it is exactly why we check in. I remember how much better you felt and how relieved you were. What do you think brought it back — the symptoms slowly returning after you stopped, diet slipping back, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still doing great and feeling settled — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the old symptoms and the slow creep back over time. Are you noticing any little signs — a bit of bloating, some irregularity, or a food starting to bother you again — that you'd like to stay ahead of before it adds up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, treating, or promising anything. Keep it judgment-free, and never discuss specific treatments, supplements, or doses.)

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
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_came_back_eating',
        label: '\u201cIt came back when I went back to my old way of eating\u201d',
        content: `I completely understand, and that's actually really common, because the gut tends to slip back into old patterns once you're off the program. That's exactly why coming in makes sense — so {{provider_name}} can look at the whole picture and talk through the best plan to get you back on track and help you keep it settled.${CONFIRM}`,
      },
      {
        key: 'obj_embarrassed',
        label: '\u201cI\u2019m embarrassed I let it slip back\u201d',
        content: `Please don't be — this happens to almost everyone who stops, and it's exactly why we reach out, with no judgment at all. {{provider_name}} would simply love to help you get back to where you were.${CONFIRM}`,
      },
      {
        key: 'obj_bad_experience',
        label: 'Bad experience or it didn\u2019t fully work before',
        content: `(Acknowledge it warmly. Never give medical advice on the call.)

{{contact_first_name}}, I completely understand, and I'm glad you told me. That's exactly the kind of thing {{provider_name}} will want to talk through with you in person, so you can look at the whole picture together.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
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
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because the appetite comes right back, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — the appetite returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they stop, because the appetite comes right back, and it is exactly why we check in. I remember how great you looked and felt and how proud you were. What do you think made it come back — the appetite returning after you stopped, cost, just life getting busy?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still doing great and keeping it off — that's fantastic, and I know {{provider_name}} will be thrilled to hear it. Let me ask you this: the hardest part for most people is staying ahead of the appetite and the slow creep back over time. Are you noticing any little habits or a few pounds starting to sneak back that you'd like to stay ahead of before they add up?

(Close toward a regular rhythm:) ...the best way to protect all the work you put in is to come in for a check and stay on a simple maintenance plan so you stay ahead of it instead of having to start over. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so {{provider_name}} has an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, dosing, or promising anything. Keep it judgment-free, and never discuss specific medication or doses.)

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
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

{{provider_name}} can take a look and see if getting you back on track is the right move to get you back to feeling the way you did before. If {{provider_name}} thinks it's a good fit, we'll let you know and we'd be honored to help. And if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
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
        content: `(Acknowledge it warmly. Never give medical advice or discuss medication specifics on the call.)

{{contact_first_name}}, I completely understand, and I'm glad you told me. That's exactly the kind of thing {{provider_name}} will want to talk through with you in person, so you can look at the whole picture together.${CONFIRM}`,
      },
    ],
    extraObjectionRefs: [
      ['Cost or insurance', 'obj_cost'],
      ['\u201cI don\u2019t have time\u201d', 'obj_time'],
      ['\u201cI need to talk to my spouse\u201d', 'obj_spouse'],
    ],
  },
  {
    name: 'Massage Therapy',
    openingChoices: [
      '\u201cStill feeling loose and relaxed\u201d',
      '\u201cThe tension is starting to creep back\u201d',
      '\u201cPretty much back to where I was\u201d',
    ],
    steps: {
      opening_question: {
        title: 'The Opening Question',
        content: `So {{contact_first_name}}, how have things been going since your last massage with us? Are you still feeling loose and relaxed and staying in your regular rhythm, has it been a little while and the tension started to creep back, or are you pretty much back to where you were before you started coming in?

(This question has only three possible answers — click the one you hear.)`,
      },
      resp_doing_great: {
        title: 'Still Loose and Relaxed',
        content: `That's wonderful, {{contact_first_name}}, we're so happy to hear you're still feeling loose and relaxed. Do you remember how great it felt to have that tension melt away and to move and sleep so much better?

(Let them respond.)`,
      },
      resp_coming_back: {
        title: 'Tension Creeping Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they fall out of the routine. The tension builds right back up and you end up stiff and stressed again, and it is exactly why we check in. I remember how good you were feeling. What do you think got you out of the rhythm — just life getting busy, scheduling, cost?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      resp_fully_back: {
        title: 'It\u2019s Fully Back',
        content: `Oh {{contact_first_name}}, please don't be hard on yourself — this happens to so many people once they fall out of the routine. The tension builds right back up and you end up stiff and stressed again, and it is exactly why we check in. I remember how good you were feeling. What do you think got you out of the rhythm — just life getting busy, scheduling, cost?

(Let them answer, be warm and non-judgmental, and do NOT try to book yet.)`,
      },
      doing_well_variant: {
        title: 'Doing Well but Lapsed \u2014 Stay Ahead of It',
        content: `{{contact_first_name}}, I'm so glad you're still feeling loose and relaxed — that's fantastic. Let me ask you this: the hardest part for most people is staying in a regular rhythm so the tension never gets a chance to build back up into knots and stiffness. Are you finding it's been stretching a little longer between visits than you'd like, or a bit of tightness starting to creep back that you'd like to stay ahead of?

(Close toward a regular rhythm:) ...the best way to keep feeling loose and relaxed is to stay on a simple regular schedule so you stay ahead of the tension instead of letting it build back up. Can I make a recommendation?`,
      },
      digging_in: {
        title: 'Digging In \u2014 Update the File',
        content: `{{contact_first_name}}, while I have you, let me just run through a few quick things so we have an accurate picture, okay?

(Ask about each one in a natural, caring way, listen, and note which are present and which bothers them most. You are updating the file, not diagnosing, giving medical advice, or committing them to anything. Keep it judgment-free, and never improvise pricing or packages.)

— Tension returning: has the tightness or tension started to build back up since your last massage?

— Which areas: is it the same spots as before, like the neck, shoulders, upper or lower back, or wherever you tend to hold it?

— Knots and soreness: are you noticing the knots, soreness, or that stiff, tight feeling coming back?

— Stress levels: are you feeling more stressed, wound up, or run-down again lately?

— Sleep: is the tension affecting your sleep the way it did before?

— Range of motion: is your neck or back feeling tighter or less mobile again — harder to turn or reach?

— Headaches: are the tension headaches starting to come back, if those were something you dealt with?

— Everyday life and posture: is sitting at a desk, working, or your posture leaving you achy and tight again?

— Special events or stressful stretches: is there anything coming up — a trip, an event, or a busy stretch — you'd love to feel relaxed and loose for?

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
      recommendation: {
        title: 'The Magic Question & Recommendation',
        content: `{{contact_first_name}}, can I make a recommendation? (Wait for yes.)

Based on everything you've told me, I'd love to get you set up with an appointment so we can get you back on track and back into your relaxed, low-tension rhythm. If it's a good fit we'd be honored to help, and if for some reason it's not the right time, we'll tell you that too, because we're not here to waste your time or your money. Does that sound reasonable?

(Ask "does that sound reasonable" — never "does that sound good." Click what you hear next.)`,
      },
    },
    objections: [
      {
        key: 'obj_fell_out_habit',
        label: '\u201cI fell out of the habit / it\u2019s been too long\u201d',
        content: `I completely understand, and that's actually really common — life gets busy and it's easy to fall out of the rhythm. That's exactly why coming in makes sense: we'll get you right back to feeling loose and relaxed, and the more regular you are the easier it is to stay ahead of the tension.${CONFIRM}`,
      },
      {
        key: 'obj_luxury',
        label: '\u201cIt\u2019s kind of a luxury / I feel guilty spending on it\u201d',
        content: `I hear that a lot, and I'd gently say taking care of your stress and tension isn't a luxury — it's part of feeling and functioning your best, and you told me how much better you felt when you were coming in.${CONFIRM}`,
      },
      {
        key: 'obj_living_with_it',
        label: '\u201cI\u2019ve just been living with the tension\u201d',
        content: `I understand, and you can get used to it, but I know how much better you felt when that tension was gone. Coming back in is the easiest way to get back to feeling loose again.${CONFIRM}`,
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
