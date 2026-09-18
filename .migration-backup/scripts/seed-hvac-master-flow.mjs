/**
 * Seeds the HVAC niche interactive script flow from the official
 * "HVAC Customer Reactivation & Cross-Sell Master Script" PDF.
 * Replaces the placeholder HVAC flow entirely with the real branching script:
 * open -> hub -> concern branches -> recommendation -> schedule -> expand -> close,
 * plus objection, status, and record-keeping branches.
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

const { rows: nicheRows } = await client.query(
  `select id from niches where name = 'HVAC'`,
)
if (nicheRows.length === 0) {
  console.error('HVAC niche not found')
  process.exit(1)
}
const HVAC = nicheRows[0].id

// The standard choice set shown after a recommendation has been made
// ("Would you like me to see what we have available?")
const POST_REC = [
  ['Yes — check availability', 'schedule', 'positive'],
  ['"How much is it?"', 'obj_price', 'objection'],
  ['"I need to think about it"', 'obj_think', 'objection'],
  ['"I need to talk to my spouse"', 'obj_spouse', 'objection'],
  ['"I\'m too busy"', 'obj_busy', 'objection'],
  ['"Not interested"', 'not_interested', 'negative'],
]

// Concern branches: [key, title, body]. Every one ends with the permission
// ask + recommendation + availability question, then shows POST_REC choices.
const CONCERNS = [
  [
    'c_cooling',
    'System Isn\u2019t Cooling Properly',
    `(Customer says something like: "It isn't cooling like it used to.")

Ask, naturally and one at a time:

— When did you first notice that?

— Is the problem throughout the entire house or mainly in certain areas?

— Is the system running longer than it normally does?

— Does it reach the temperature you set on the thermostat?

— Have you noticed any unusual sounds, odors, leaking, or changes in airflow?

(If it's certain rooms, also ask: Which rooms or areas are giving you the most trouble? Has it always been that way, or is this something that changed? Has anyone specifically evaluated the airflow or ductwork to those areas?)

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone take a look at the system and determine what may be contributing to the change in cooling.

Would you like me to see what we have available?

(Opportunities to note: AC repair, refrigerant/system diagnostic, airflow evaluation, duct evaluation/sealing/repair, air balancing, zoning, insulation, system replacement, mini-split.)`,
  ],
  [
    'c_heating',
    'System Isn\u2019t Heating Properly',
    `Ask, naturally and one at a time:

— When did you first notice the problem?

— Is the entire home affected or only certain areas?

— Is the system running but not producing enough heat?

— Does it reach the temperature you set?

— Have you noticed unusual noises, odors, or airflow?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone look at the system and determine what may be contributing to the heating issue.

Would you like me to see what we have available?

(Opportunities to note: heating repair, furnace repair, heat pump repair, airflow evaluation, duct evaluation, system replacement.)`,
  ],
  [
    'c_uneven',
    'Uneven Temperatures',
    `(Customer says something like: "Some rooms are always hotter or colder.")

Ask, naturally and one at a time:

— Which areas are affected?

— Has it always been that way?

— Is it worse at certain times of the day?

— Has anyone evaluated the airflow going to those rooms?

— Have you had any additions, renovations, or changes to the home since the HVAC system was installed?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the airflow and system setup to determine what may be contributing to the temperature differences.

Would you like me to see what we have available?

(Opportunities to note: airflow evaluation, duct repair/modification/sealing, air balancing, zoning, insulation, mini-split, HVAC capacity evaluation.)`,
  ],
  [
    'c_bills',
    'High Energy Bills',
    `(Customer says something like: "Our electric bill is really high.")

Ask, naturally and one at a time:

— When did you start noticing the increase?

— Does the system seem to run longer than it used to?

— Does it frequently turn on and off?

— Are you having to adjust the thermostat more often to stay comfortable?

— Do you know approximately how old the system is?

— When was it last professionally serviced?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the system and determine whether anything may be contributing to the increased energy use.

Would you like me to see what we have available?

(Opportunities to note: system efficiency evaluation, preventive maintenance, HVAC repair, smart thermostat, duct sealing, insulation, system replacement, high-efficiency system, heat pump.)`,
  ],
  [
    'c_constant',
    'System Runs Constantly',
    `Ask, naturally and one at a time:

— When did you start noticing that?

— Does the home eventually reach the temperature you set?

— Is the problem worse during the hottest or coldest part of the day?

— Have your energy bills increased?

— When was the system last serviced?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone take a look at the system and determine what may be contributing to it running so much.

Would you like me to see what we have available?`,
  ],
  [
    'c_shortcycle',
    'System Short-Cycles',
    `(Customer says something like: "It keeps turning on and off.")

Ask, naturally and one at a time:

— How long has that been happening?

— How frequently does it seem to cycle?

— Is the home staying comfortable?

— Have you noticed any changes in your energy bills?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone take a look and determine what may be contributing to the frequent cycling.

Would you like me to see what we have available?`,
  ],
  [
    'c_airflow',
    'Weak Airflow',
    `(Customer says something like: "Not much air comes out of the vents.")

Ask, naturally and one at a time:

— Is that happening throughout the house or only at certain vents?

— When did you first notice it?

— When was the filter last changed?

— Has anyone evaluated the ductwork recently?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the system and airflow to determine what may be contributing to the reduced airflow.

Would you like me to see what we have available?

(Opportunities to note: HVAC diagnostic, blower evaluation, filter/filtration, duct evaluation/cleaning/repair/sealing, air balancing.)`,
  ],
  [
    'c_dust',
    'Excessive Dust',
    `(Customer says something like: "The house is always dusty.")

Ask, naturally and one at a time:

— Has that gotten worse over time?

— How quickly does the dust return after cleaning?

— Do you notice more dust around the vents?

— Do you have pets in the home?

— Has anyone evaluated your filtration, ductwork, or indoor air quality?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone look at the filtration, airflow, and duct system to determine what may be contributing to the amount of dust.

Would you like me to see what we have available?

(Opportunities to note: indoor air quality evaluation, upgraded filtration, media filtration, air purification, duct evaluation/sealing/cleaning.)`,
  ],
  [
    'c_iaq',
    'Allergies / Air Quality Concerns',
    `(Customer says something like: "Our allergies seem worse inside.")

Ask, naturally and one at a time:

— Is that happening year-round or mainly during certain seasons?

— Have you noticed excessive dust, odors, or humidity as well?

— What type of filtration are you currently using?

— Has anyone evaluated the indoor air quality in the home?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the filtration and indoor air quality options in the home to see what may help improve the air you're breathing.

Would you like me to see what we have available?

(Opportunities to note: IAQ evaluation, enhanced filtration, media filter, air purification, UV system, duct evaluation.)`,
  ],
  [
    'c_odor',
    'Odors When the System Runs',
    `(Customer says something like: "There's a strange smell when the system runs.")

Ask, naturally and one at a time:

— How would you describe the smell?

— When did you first notice it?

— Does it happen every time the system runs?

— Does it seem to come from one area or throughout the home?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone take a look and determine what may be contributing to the odor.

Would you like me to see what we have available?

(Opportunities to note: HVAC diagnostic, indoor air quality evaluation, duct evaluation, drain/moisture evaluation, air purification. If the smell is electrical or burning — treat as URGENT and use the safety branch.)`,
  ],
  [
    'c_humid',
    'Home Feels Humid',
    `Ask, naturally and one at a time:

— Has that always been an issue or is it something new?

— Does it feel humid throughout the house?

— Do you notice condensation on windows or vents?

— Are there any areas that smell damp or musty?

— Does the HVAC system run frequently?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the HVAC system and humidity levels to determine what may be contributing to the excess humidity.

Would you like me to see what we have available?

(Opportunities to note: HVAC performance evaluation, humidity evaluation, whole-home dehumidifier, duct evaluation, system sizing evaluation, HVAC replacement.)`,
  ],
  [
    'c_dry',
    'Home Is Too Dry',
    `Ask, naturally and one at a time:

— Is it mainly during the heating season?

— Do you notice static electricity, dry air, or discomfort?

— Has anyone evaluated the humidity level in the home?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the humidity levels and see what options may help make the home more comfortable.

Would you like me to see what we have available?

(Opportunities to note: humidifier, humidity control, indoor air quality evaluation.)`,
  ],
  [
    'c_thermostat',
    'Thermostat Problems',
    `(Customer says something like: "We're constantly adjusting the thermostat.")

Ask, naturally and one at a time:

— Is that because the home isn't staying comfortable or because you're trying to control the energy bill?

— Do different parts of the house need different temperatures?

— Is your thermostat programmable or Wi-Fi enabled?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the thermostat and overall comfort setup to determine what may be contributing to the issue.

Would you like me to see what we have available?

(Opportunities to note: thermostat replacement, smart thermostat, zoning, air balancing, system optimization.)`,
  ],
  [
    'c_noise',
    'System Is Loud',
    `Ask, naturally and one at a time:

— What type of noise are you hearing?

— Does it happen when the system starts, while it's running, or when it shuts off?

— When did it begin?

— Has it gotten worse?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone take a look and determine what may be contributing to the noise.

Would you like me to see what we have available?

(Opportunities to note: HVAC repair, blower/motor diagnostic, duct evaluation, system replacement.)`,
  ],
  [
    'c_leak',
    'Water / Leaking Around HVAC System',
    `Ask, naturally and one at a time:

— Where are you seeing the water?

— Is it happening while the air conditioning is running?

— When did you first notice it?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone look at it and determine what may be contributing to the water or leaking.

Would you like me to see what we have available?

(Opportunities to note: drain-line service, condensate evaluation, AC repair, moisture evaluation. If it's a significant water leak — treat as URGENT and use the safety branch.)`,
  ],
  [
    'c_breakdowns',
    'System Breaks Down Frequently',
    `(Customer says something like: "We keep having to repair it.")

Ask, naturally and one at a time:

— How many repairs have you had recently?

— Do you know approximately how old the system is?

— Are the repair costs starting to add up?

— Outside of the repairs, is the system keeping the house comfortable?

— Have your energy bills changed?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the overall condition of the system so you can see whether continuing to repair it or considering another option makes the most sense.

Would you like me to see what we have available?

(Opportunities to note: HVAC diagnostic, system health evaluation, repair-versus-replace evaluation, HVAC replacement, high-efficiency replacement, heat pump, financing consultation.)`,
  ],
  [
    'c_old',
    'Older HVAC System',
    `Ask, naturally and one at a time:

— About how old is the system?

— Have you had any significant repairs recently?

— Is it still keeping the house comfortable?

— Have you noticed higher energy bills?

— Do you plan on staying in the home for the foreseeable future?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the current condition of the system so you know where everything stands before you have an unexpected breakdown.

Would you like me to see what we have available?

(Opportunities to note: system health evaluation, preventive maintenance, repair-versus-replace evaluation, HVAC replacement.)`,
  ],
  [
    'c_breakdown_worry',
    'Worried About an Unexpected Breakdown',
    `Ask, naturally and one at a time:

— Have you had any problems with the system recently?

— Approximately how old is it?

— When was it last professionally serviced?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone give the system a complete check so you have a better understanding of its current condition.

Would you like me to see what we have available?

(Opportunities to note: preventive maintenance, system health evaluation, maintenance membership, replacement evaluation.)`,
  ],
  [
    'c_lower_energy',
    'Wants Lower Energy Costs',
    `Ask, naturally and one at a time:

— Are you mainly looking to reduce energy use, improve comfort, or both?

— How old is your current HVAC system?

— Do you currently use a programmable or smart thermostat?

— Have the ductwork and insulation ever been evaluated?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the system and home comfort setup to see where the biggest opportunities may be to improve efficiency.

Would you like me to see what we have available?

(Opportunities to note: efficiency evaluation, smart thermostat, duct sealing, insulation, zoning, high-efficiency HVAC, heat pump.)`,
  ],
  [
    'c_remodel',
    'Remodeling / Home Addition',
    `Ask, naturally and one at a time:

— What part of the home are you remodeling or adding?

— Has anyone determined whether the current HVAC system can properly handle the additional space?

— Are you planning to extend the existing ductwork?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone evaluate the current system and the new space before the project gets too far along.

Would you like me to see what we have available?

(Opportunities to note: load/capacity evaluation, duct modifications, zoning, mini-split, additional HVAC system, HVAC replacement.)`,
  ],
  [
    'c_space',
    'Garage / Sunroom / Bonus Room / Home Office',
    `Ask, naturally and one at a time:

— Is that space currently heated and cooled?

— Are you trying to make it comfortable year-round?

— Does the existing system serve that area?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone look at the space and the existing system so they can determine what options may work best.

Would you like me to see what we have available?

(Opportunities to note: mini-split, duct extension, zoning, additional HVAC system.)`,
  ],
  [
    'c_new_home',
    'Customer Just Purchased the Home',
    `Congratulations. Do you know approximately how old the heating and cooling system is?

— Do you know when it was last professionally serviced?

— Did the home inspection identify any HVAC concerns?

— Have you noticed any comfort, airflow, humidity, air quality, or energy-use issues since moving in?

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone go through the system with you so you know what you have, what condition it's in, and whether there's anything you should be aware of.

Would you like me to see what we have available?

(Opportunities to note: HVAC inspection, maintenance, system health evaluation, IAQ evaluation, duct evaluation, thermostat, maintenance membership, replacement evaluation.)`,
  ],
]

// [key, title, content] for every non-concern step
const STEPS = [
  [
    'open',
    'Call Opening',
    `Hi, is this {{contact_first_name}}?

Hi {{contact_first_name}}, this is {{caller_name}} with {{practice_name}}. We're updating our customer records and following up with customers we've helped in the past. I see we helped you with [previous service] [timeframe].

I wanted to check in, make sure everything is still doing well, and make sure we have everything up to date for you. How has everything been going with your heating and air conditioning?

(Click what happens next.)`,
  ],
  [
    'hub',
    'Listen — Where Does the Call Go?',
    `(Listen to how {{contact_first_name}} responds to "How has everything been going with your heating and air conditioning?" and click what you hear. If they describe anything potentially hazardous — burning smell, smoke, suspected gas issue, carbon monoxide alarm, no heat in extreme cold, no cooling in extreme heat, significant water leak — use the URGENT button immediately.)`,
  ],
  [
    'problem_picker',
    'They Mentioned a Problem — Which One?',
    `(Click the concern that best matches what {{contact_first_name}} described. Each branch gives you the discovery questions to ask, the recommendation to make, and the opportunities to note in the portal.)`,
  ],
  [
    'plans_picker',
    'Plans & Projects — Which One?',
    `(Click the situation that matches what {{contact_first_name}} described.)`,
  ],
  [
    'property_hub',
    'Property & Record Updates',
    `(Click the situation that matches what {{contact_first_name}} told you, so you can update the record and follow the right branch.)`,
  ],
  // ---- Maintenance path ----
  [
    'svc_check',
    'Everything Is Working Well',
    `Great. When was the last time you had the system professionally serviced or maintained?

(Click what you hear.)`,
  ],
  [
    'maint_plan',
    'Serviced Recently — On a Plan?',
    `Perfect. Are you currently on a regular maintenance plan with someone?

(Click what you hear.)`,
  ],
  [
    'satisfied_check',
    'Final Satisfaction Check',
    `Great. It sounds like you're staying on top of it.

Before I update our records, is there anything about the comfort of the home, air quality, humidity, airflow, noise, or energy bills that you haven't been completely satisfied with?

(Click what you hear.)`,
  ],
  [
    'maint_rec',
    'Recommend a Maintenance Plan',
    `Would it be okay if I made a recommendation? (Wait for yes.)

Since you're already taking care of the system, it may make sense to have us handle the regular maintenance for you going forward so it stays on a consistent schedule.

Would you like me to see what we have available?

(Opportunities to note: preventive maintenance, AC tune-up, heating tune-up, maintenance agreement, system health evaluation.)`,
  ],
  [
    'svc_while',
    'It\u2019s Been a While Since Service',
    `About how long would you say?

(Let them answer.)

Would it be okay if I made a recommendation? (Wait for yes.)

Since it's been a while, I'd recommend having someone give the system a complete check and service so you know everything is operating the way it should.

Would you like me to see what we have available?

(Opportunities to note: preventive maintenance, AC tune-up, heating tune-up, maintenance agreement, system health evaluation.)`,
  ],
  [
    'svc_unknown',
    'Doesn\u2019t Know When It Was Serviced',
    `No problem.

Would it be okay if I made a recommendation? (Wait for yes.)

If you're not sure when it was last serviced, I'd recommend having someone give the system a complete check so you know where everything stands.

Would you like me to see what we have available?`,
  ],
  [
    'diy',
    'Customer Does Their Own Maintenance',
    `Got it. What maintenance are you currently handling yourself?

(Let them answer.)

When was the last time the complete system was professionally inspected and serviced?

(If it's been a long time or never:)

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone give the complete system a professional check so you know everything is operating properly.

Would you like me to see what we have available?`,
  ],
  [
    'warranty',
    'Customer Has a Home Warranty',
    `Understood. Do they handle your regular preventive maintenance as well, or mainly repairs when something breaks?

(If mainly repairs:) Got it. Is your HVAC system currently being professionally maintained on a regular basis?

(If no:)

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend keeping the system on a regular maintenance schedule even if your home warranty handles unexpected repairs.

(If they have a current unresolved problem:) Has the warranty company already addressed that issue? If it wasn't resolved — it may be worthwhile to have us take a look and give you another opinion.

Would you like me to see what we have available?`,
  ],
  // ---- Status branches ----
  [
    'competitor',
    'Customer Uses Another HVAC Company',
    `Thanks for letting me know. I'll update our records.

Has everything been going well with them?

(Click what you hear.)`,
  ],
  [
    'competitor_unhappy',
    'Dissatisfied With Their Current Company',
    `What hasn't gone the way you expected?

(Let them answer.)

Would it be okay if I made a recommendation? (Wait for yes.)

It may be worthwhile to have us take a look and give you another opinion so you know what your options are.

Would you like me to see what we have available?

(Opportunities to note: second opinion, repair, maintenance, replacement, appropriate cross-sell branch.)`,
  ],
  [
    'replaced',
    'System Replaced by Another Company',
    `Thanks for letting me know. I'll update that in our records.

— When was the new system installed?

— Has everything been working the way you expected?

— Is the entire house staying comfortable?

— Are you already having the new system professionally maintained?

(Click what you hear.)`,
  ],
  [
    'maint_rec_replaced',
    'Recommend Maintenance on Their New System',
    `Would it be okay if I made a recommendation? (Wait for yes.)

Even though another company installed the system, I'd recommend keeping it on a regular professional maintenance schedule.

If you'd like, we can handle that for you.

(Opportunities to note: preventive maintenance, maintenance agreement, second opinion, airflow, ductwork, IAQ, thermostat, zoning, humidity control.)`,
  ],
  [
    'recovery',
    'Previous Bad Experience',
    `(Customer says something like: "I wasn't happy with you last time.")

I'm sorry to hear that. Would you mind telling me what happened?

(LISTEN. Do not interrupt. Do not immediately cross-sell.)

Thank you for telling me. I want to make sure I have this documented correctly. [Restate their concern.] Is that accurate?

(If yes:) Thank you. I'd like to make sure the right person on our team is aware of this. Would it be okay for us to follow up with you about it?

(Portal action: Service Recovery — flag for manager follow-up.)`,
  ],
  // ---- Property branches ----
  [
    'p_moved',
    'Customer Has Moved',
    `Thanks for letting me know. I'll update our records.

Are you still located within our service area?

(If yes:) How has the heating and cooling system been at the new home?

(If they don't know — it's a new home to them:)

Would it be okay if I made a recommendation? (Wait for yes.)

I'd recommend having someone check the system so you know its condition and maintenance status.

Would you like me to see what we have available?

(Opportunities to note: new-home inspection, maintenance, system evaluation, IAQ, maintenance membership.)`,
  ],
  [
    'p_renting',
    'Customer Is Renting the Property',
    `Thanks for letting me know.

Is the HVAC handled by the property owner or property manager?

(If yes:) Perfect. I'll update our information.

(If the customer is responsible for the HVAC, continue with the appropriate branch — go Back and pick the concern or maintenance path.)`,
  ],
  [
    'p_rental',
    'Property Is Now a Rental',
    `Thanks for letting me know.

Are you still the owner of the property?

(If yes:) Do you handle the HVAC maintenance and repairs, or does a property manager handle that for you?

(If the owner handles it:)

Would it be okay if I made a recommendation? (Wait for yes.)

It may make sense to have us handle the regular HVAC maintenance for the property so you have someone keeping track of it for you.

Would you like me to see what we have available?

(Opportunities to note: landlord maintenance, maintenance agreement, multi-property relationship, property management relationship.)`,
  ],
  [
    'p_multi',
    'Customer Owns Multiple Properties',
    `Do you handle the HVAC service for your other properties as well?

(If yes:)

Would it be okay if I made a recommendation? (Wait for yes.)

If it would make things easier, we may be able to handle the HVAC service and maintenance for your other properties as well.

Would you like me to see what we have available?

(Opportunities to note: additional properties, maintenance agreements, property portfolio HVAC service.)`,
  ],
  // ---- Objections ----
  [
    'obj_price',
    'Objection: Price',
    `(If the customer says the company was too expensive before:) I understand. Was that related to a repair, replacement, maintenance, or something else? (Let them answer.) Thanks for letting me know. Before making a decision based only on what something cost in the past, it may be worth having someone look at what you need now and give you the current options.

(If a service price is available to you:) The price for [service] is [price]. Would you like me to see what we have available?

(If price depends on diagnosis:) That depends on what the technician finds and what options are appropriate. Would it be okay if I made a recommendation? I'd recommend having someone evaluate it first so you know exactly what you're dealing with before making any decisions.

(If they want a quote without a visit:) I understand. We don't want to guess and give you inaccurate information without knowing what's actually needed. I'd recommend having someone evaluate it first. Once they know what's actually going on, they can give you the appropriate options.

(Click what happens next.)`,
  ],
  [
    'obj_think',
    'Objection: "I Need to Think About It"',
    `Absolutely. What specifically would you like to think about?

(If it's PRICE — click the price button below.)

(If it's TIMING:) When would be a better time? Schedule a follow-up.

(If they're UNSURE the service is needed:) Is the main question whether there's actually a problem that needs attention? (If yes:) Would it be okay if I made a recommendation? I'd recommend having someone evaluate it first so you know whether there's actually anything that needs to be addressed.

(Click what happens next.)`,
  ],
  [
    'obj_spouse',
    'Objection: "I Need to Talk to My Spouse"',
    `Absolutely.

Would it be easier for me to follow up after you've had a chance to speak with them, or would you prefer to find a time when you can both be available?

(Click what they choose.)`,
  ],
  [
    'obj_busy',
    'Objection: "I\u2019m Too Busy" / "Call Me Later"',
    `No problem. I was just checking in to make sure everything was still doing well and to update our information.

When would be a better time for me to call you back?

What day works best? And is morning or afternoon better?

(Portal action: schedule a specific callback.)`,
  ],
  [
    'not_interested',
    'Objection: "Not Interested"',
    `No problem.

Before I update our records, is everything currently working well with the heating and air conditioning?

(Click what you hear.)`,
  ],
  [
    'why_calling',
    '"Why Are You Calling?" / "Is This a Sales Call?"',
    `(If they ask how you got their number:) You previously used {{practice_name}}, and this is the contact information we have in your customer record.

(If they ask why you're calling:) We're following up with previous customers, updating our records, and making sure everything is still doing well since we last helped you.

(If they ask if it's a sales call:) I'm calling because you're a previous customer and we're checking in and updating our records. If everything is doing well, that's all I need to know. If something isn't right, I can help you get it taken care of.

(Click what happens next.)`,
  ],
  [
    'dnc',
    'Customer Requests No More Calls',
    `Absolutely. I'll make sure that request is documented. Thank you.

(If they're upset about being called:) I understand. I'll update your record so you aren't contacted again about this. Thank you.

(Portal action: Do Not Call — suppress future reactivation calls. End of script — log the call outcome below.)`,
  ],
  [
    'emergency',
    'URGENT: Safety Issue',
    `(Examples: no cooling during extreme heat, no heat during cold weather, electrical/burning smell, smoke, suspected gas issue, carbon monoxide alarm, significant water leak, other potentially hazardous condition.)

Because of what you're describing, I don't want to treat this as a routine reactivation call.

(Follow your company's Emergency/Safety Protocol immediately.)

(Portal action: Emergency/Safety Escalation. Do not continue cross-selling. End of script — log the call outcome below.)`,
  ],
  // ---- Scheduling & close ----
  [
    'schedule',
    'Scheduling',
    `Are mornings or afternoons generally better?

I have [day/time option 1] or [day/time option 2]. Which works better?

(Click when a time is selected.)`,
  ],
  [
    'confirm',
    'Appointment Confirmation',
    `Perfect. I have you scheduled for [day, date] at [time/arrival window].

— Is [service address] still the correct address?

— Is [phone number] still the best number for you?

— Is [email address] still correct?

— Will you be the person meeting the technician? (If not: Who should we note as the contact at the property?)

— Before I finish scheduling this, how many heating and cooling systems do you have in the home? (If more than one: Would it be okay if I made a recommendation? Since the technician will already be there, it may make sense to have the other system checked at the same time. Would you like me to add that to the appointment?)

— Do you have any other properties that we've serviced or that you'd like us to help maintain?

— Is there anything else you want me to note for the technician before they come out?`,
  ],
  [
    'expand',
    'Final Cross-Sell Discovery',
    `Besides [primary concern], is there anything else you've noticed with the heating and cooling, room temperatures, airflow, humidity, air quality, thermostat, unusual noises, or energy bills that you'd like us to look at while we're there?

(If the customer needs prompting:) Anything with certain rooms being too hot or cold, airflow, humidity, dust, air quality, thermostat control, unusual noises, or energy bills?

(If they have multiple concerns:) Let me make sure I have everything. You mentioned [concern 1], [concern 2], and [concern 3]. Is there anything else you'd like us to look at? ... I'd recommend having the technician look at all of those concerns while they're there so you can get a complete picture of what's going on. I'll make sure all of that is noted.

(Click what you hear.)`,
  ],
  [
    'close_appt',
    'Appointment Close',
    `Perfect. I've got everything noted for the technician.

We'll see you [day/time]. Thank you, {{contact_first_name}}.

(End of script — add your notes and log the call outcome below.)`,
  ],
  [
    'close_no_appt',
    'No Appointment — Positive Close',
    `Great. I'll update our records that everything is doing well.

We appreciate you using {{practice_name}}, and if anything changes, we're here to help.

(End of script — add your notes and log the call outcome below.)`,
  ],
  [
    'close_callback',
    'Callback Close',
    `Perfect. I'll follow up with you [day/time].

Thanks, {{contact_first_name}}.

(Portal action: schedule the callback. End of script — log the call outcome below.)`,
  ],
  [
    'close_recovery',
    'Service Recovery Close',
    `Thank you again for telling me — I've documented everything and the right person on our team will follow up with you.

(Portal action: Service Recovery / manager follow-up. Do not cross-sell. End of script — log the call outcome below.)`,
  ],
  // ---- No-contact endings ----
  [
    'voicemail',
    'Voicemail',
    `Hi {{contact_first_name}}, this is {{caller_name}} with {{practice_name}}. We're doing some customer follow-up and updating our records, and I wanted to check in with you. Please give me a call back at [phone number]. Again, this is {{caller_name}} with {{practice_name}} at [phone number]. Thank you.

(End of script — log the call outcome below.)`,
  ],
  [
    'gatekeeper',
    'Someone Else Answered',
    `Hi, this is {{caller_name}} with {{practice_name}}. I was trying to reach {{contact_first_name}} regarding their customer record with us. Is {{contact_first_name}} available?

(If not available:) When would be a better time to reach them?

(Click what happens next.)`,
  ],
  [
    'wrong_number',
    'Wrong Number',
    `Thank you for letting me know. I'll update our records.

(Portal action: Wrong Number. End of script — log the call outcome below.)`,
  ],
  [
    'deceased',
    'Customer Deceased',
    `I'm very sorry. Thank you for letting me know. I'll update our records.

(Portal action: update/suppress the customer record. Do not continue the sales conversation. End of script — log the call outcome below.)`,
  ],
]

// Append the concern steps
for (const [key, title, content] of CONCERNS) STEPS.push([key, title, content])

// ---- Choices: [from, label, to, variant] ----
const CHOICES = [
  // open
  ['open', 'Customer answered — continue', 'hub', 'positive'],
  ['open', 'Voicemail', 'voicemail', 'default'],
  ['open', 'Someone else answered', 'gatekeeper', 'default'],
  ['open', 'Wrong number', 'wrong_number', 'negative'],

  // hub
  ['hub', '\u201cEverything is fine\u201d', 'svc_check', 'positive'],
  ['hub', 'They mention a problem or concern', 'problem_picker', 'caution'],
  ['hub', 'Remodeling, addition, or new space', 'plans_picker', 'default'],
  ['hub', 'Moved, renting, or property changes', 'property_hub', 'default'],
  ['hub', '\u201cWe use someone else now\u201d', 'competitor', 'negative'],
  ['hub', '\u201cWe replaced the system\u201d', 'replaced', 'negative'],
  ['hub', '\u201cI wasn\u2019t happy with you last time\u201d', 'recovery', 'objection'],
  ['hub', '\u201cWhy are you calling?\u201d / \u201cIs this sales?\u201d', 'why_calling', 'objection'],
  ['hub', '\u201cNot interested\u201d', 'not_interested', 'objection'],
  ['hub', '\u201cI\u2019m too busy\u201d / \u201cCall me later\u201d', 'obj_busy', 'objection'],
  ['hub', '\u201cDon\u2019t call me again\u201d', 'dnc', 'objection'],
  ['hub', 'URGENT safety issue', 'emergency', 'negative'],

  // problem picker
  ['problem_picker', 'Not cooling properly', 'c_cooling', 'caution'],
  ['problem_picker', 'Not heating properly', 'c_heating', 'caution'],
  ['problem_picker', 'Rooms too hot or cold', 'c_uneven', 'caution'],
  ['problem_picker', 'High energy bills', 'c_bills', 'caution'],
  ['problem_picker', 'Runs constantly', 'c_constant', 'caution'],
  ['problem_picker', 'Turns on and off frequently', 'c_shortcycle', 'caution'],
  ['problem_picker', 'Weak airflow', 'c_airflow', 'caution'],
  ['problem_picker', 'Excessive dust', 'c_dust', 'caution'],
  ['problem_picker', 'Allergies / air quality', 'c_iaq', 'caution'],
  ['problem_picker', 'Strange smell', 'c_odor', 'caution'],
  ['problem_picker', 'Home feels humid', 'c_humid', 'caution'],
  ['problem_picker', 'Home is too dry', 'c_dry', 'caution'],
  ['problem_picker', 'Thermostat problems', 'c_thermostat', 'caution'],
  ['problem_picker', 'System is loud', 'c_noise', 'caution'],
  ['problem_picker', 'Water / leaking', 'c_leak', 'caution'],
  ['problem_picker', 'Breaks down frequently', 'c_breakdowns', 'caution'],
  ['problem_picker', 'Older system', 'c_old', 'caution'],
  ['problem_picker', 'Worried about a breakdown', 'c_breakdown_worry', 'caution'],
  ['problem_picker', 'Wants lower energy costs', 'c_lower_energy', 'caution'],
  ['problem_picker', 'URGENT safety issue', 'emergency', 'negative'],

  // plans picker
  ['plans_picker', 'Remodeling or home addition', 'c_remodel', 'default'],
  ['plans_picker', 'Garage, sunroom, bonus room, or office', 'c_space', 'default'],
  ['plans_picker', 'Just purchased the home', 'c_new_home', 'default'],

  // property hub
  ['property_hub', 'Customer has moved', 'p_moved', 'default'],
  ['property_hub', 'Customer is renting', 'p_renting', 'default'],
  ['property_hub', 'Property is now a rental', 'p_rental', 'default'],
  ['property_hub', 'Owns multiple properties', 'p_multi', 'default'],

  // maintenance path
  ['svc_check', '\u201cRecently\u201d', 'maint_plan', 'positive'],
  ['svc_check', '\u201cIt\u2019s been a while\u201d', 'svc_while', 'caution'],
  ['svc_check', 'Doesn\u2019t know', 'svc_unknown', 'caution'],
  ['svc_check', 'Does their own maintenance', 'diy', 'default'],
  ['svc_check', 'Has a home warranty', 'warranty', 'default'],
  ['maint_plan', 'Yes — on a plan', 'satisfied_check', 'positive'],
  ['maint_plan', 'No maintenance plan', 'maint_rec', 'caution'],
  ['satisfied_check', 'They named a concern', 'problem_picker', 'caution'],
  ['satisfied_check', 'Completely satisfied', 'close_no_appt', 'positive'],

  // status branches
  ['competitor', 'Going well with them', 'satisfied_check', 'default'],
  ['competitor', 'Dissatisfied with them', 'competitor_unhappy', 'caution'],
  ['replaced', 'Maintained and happy', 'satisfied_check', 'positive'],
  ['replaced', 'Not being maintained', 'maint_rec_replaced', 'caution'],
  ['recovery', 'Documented — close the call', 'close_recovery', 'default'],

  // renting continues
  ['p_renting', 'Owner/manager handles it — update records', 'close_no_appt', 'positive'],
  ['p_renting', 'Customer is responsible — continue', 'hub', 'default'],

  // objections
  ['obj_price', 'Resolved — check availability', 'schedule', 'positive'],
  ['obj_price', 'Still hesitant', 'obj_think', 'objection'],
  ['obj_price', '\u201cNot interested\u201d', 'not_interested', 'negative'],
  ['obj_think', 'It\u2019s about price', 'obj_price', 'objection'],
  ['obj_think', 'Resolved — check availability', 'schedule', 'positive'],
  ['obj_think', 'Schedule a follow-up instead', 'close_callback', 'default'],
  ['obj_spouse', 'Follow up after they talk', 'close_callback', 'default'],
  ['obj_spouse', 'Find a time for both — schedule', 'schedule', 'positive'],
  ['obj_busy', 'Callback time set — close', 'close_callback', 'default'],
  ['not_interested', 'Everything working well — close', 'close_no_appt', 'positive'],
  ['not_interested', '\u201cWhat\u2019s been going on?\u201d — they name a problem', 'problem_picker', 'caution'],
  ['why_calling', 'Satisfied — continue the call', 'hub', 'positive'],
  ['why_calling', '\u201cDon\u2019t call me again\u201d', 'dnc', 'objection'],

  // gatekeeper
  ['gatekeeper', 'Customer came to the phone', 'hub', 'positive'],
  ['gatekeeper', 'Not available — note callback time', 'close_callback', 'default'],
  ['gatekeeper', 'Customer is deceased', 'deceased', 'negative'],

  // scheduling & close
  ['schedule', 'Time selected — confirm the appointment', 'confirm', 'positive'],
  ['confirm', 'Details confirmed — final discovery', 'expand', 'positive'],
  ['expand', 'They named another concern', 'problem_picker', 'caution'],
  ['expand', 'Nothing else — close the appointment', 'close_appt', 'positive'],
]

// Maintenance/status recommendation steps share the standard post-rec choices
for (const key of [
  'maint_rec',
  'svc_while',
  'svc_unknown',
  'diy',
  'warranty',
  'competitor_unhappy',
  'maint_rec_replaced',
  'p_moved',
  'p_rental',
  'p_multi',
]) {
  for (const [label, to, variant] of POST_REC) CHOICES.push([key, label, to, variant])
}

// Every concern step gets the standard post-rec choices
for (const [key] of CONCERNS) {
  for (const [label, to, variant] of POST_REC) CHOICES.push([key, label, to, variant])
}

// ---- Write to DB ----
await client.query('begin')
try {
  await client.query('delete from script_flow_choices where niche_id = $1', [HVAC])
  await client.query('delete from script_flow_steps where niche_id = $1', [HVAC])

  let sort = 0
  for (const [key, title, content] of STEPS) {
    await client.query(
      `insert into script_flow_steps (niche_id, step_key, title, content, sort_order)
       values ($1, $2, $3, $4, $5)`,
      [HVAC, key, title, content, sort++],
    )
  }

  const bySrc = new Map()
  for (const [from, label, to, variant] of CHOICES) {
    const n = (bySrc.get(from) ?? 0) + 1
    bySrc.set(from, n)
    await client.query(
      `insert into script_flow_choices (niche_id, from_step_key, label, to_step_key, variant, sort_order)
       values ($1, $2, $3, $4, $5, $6)`,
      [HVAC, from, label, to, variant, n - 1],
    )
  }

  await client.query('commit')
  console.log(`Seeded HVAC master flow: ${STEPS.length} steps, ${CHOICES.length} choices`)
} catch (e) {
  await client.query('rollback')
  throw e
} finally {
  await client.end()
}
