// Desk-side teaching approved by the user. Cues locate actions in spoken audio;
// they are not spoken labels or estimated percentages of a chapter.
const entry = (narration, ...cues) => ({ narration, cues });
export const conversation = {
  "1:intro": entry(
    "Okay, let's get your Go High Level form connected to Patient Pipeline together. I'm going to walk you through it as though we're sitting at the same desk, so you can follow along in your own account. This is the route to use when the form was built in Go High Level, even if people fill it out on your website. We'll put your offer into Patient Pipeline, give the form somewhere to send its responses, and then check a submission together. The outside screens are recreations, so yours may look a little different. You can pause whenever you need."),
  prepare: entry(
    "Before we get into the setup, have your actual offer handy. We'll use an example, but the information you enter should match what your own ad promises. You'll also need to be signed in, with permission to edit the connection. If you're wondering how to keep both accounts open, that little plus beside your browser tab opens another tab without closing this one. When we get to testing, use your own name and a phone you control, rather than patient information. Let your office know, too, because existing follow-up messages could run when you submit.",
    "that little plus", "use your own name"),
  campaigns: entry(
    "Let's start in Patient Pipeline. We're going to use Lead Follow-Up, rather than Reactivation, because we're setting up an offer that brings in new inquiries. Once you're in there, open Campaigns. This is how Patient Pipeline keeps each offer and its leads together, so your caller knows which conversation to have. Go ahead and click New Campaign. That brings us to the offer details. We'll keep using this same campaign for the connection and the test, so we don't end up looking for our test person in the wrong place.",
    "use Lead Follow-Up", "open Campaigns", "click New Campaign"),
  service: entry(
    "Now that the offer form is open, the first thing I want you to look at is Service type. Click there to open the choices. I'm choosing Chiropractic because that matches the back pain offer we're using. Yours might be different, and that's completely fine. Just choose the service your ad is actually promoting, because that's what helps Patient Pipeline choose the right call script. Have a quick look at what's selected before we start typing the rest of the offer. We want the script to match the service, not just the name we're about to give it.",
    "Click there to open"),
  name: entry(
    "Now that we've got the service selected, let's give the campaign a name your team will recognize. I'll click Campaign name and type Back Pain Relief, forty-nine-dollar New Patient Special. You don't have to use that wording. The important thing is that when someone on your team sees this name later, they'll know exactly which offer the person asked about. Keeping it specific also makes it easier for us to find the right campaign when we check the connection. Take a moment to enter yours, and then we'll add what the offer includes.",
    "click Campaign name"),
  included: entry(
    "Let's tell your caller what the person actually gets with this offer. I'm putting Consultation in the first row. We'll give each included item its own line, rather than squeezing everything into one sentence. To make room for another item, click Add a line. I'll put Examination in that next row, and then add Review of findings underneath it. Those are just our example's inclusions. Before you move on, compare your entries with the ad itself, because these details become part of what your caller says. We don't want to promise something your practice hasn't actually offered.",
    "putting Consultation", "click Add a line", "put Examination", "add Review of findings"),
  price: entry(
    "Now let's set the price wording your caller will use. Our example only needs to say what the offer costs, so I'm choosing the middle option, Just Y. Once that's selected, I'll click Offer price and type forty-nine. Have a look at the On the call preview underneath. That's where you can check the wording before anyone uses it. This doesn't change your software bill. If your ad really compares two prices, you'd use Normally X, now Y instead and enter both amounts. For our example, we'll leave this at Just forty-nine dollars.",
    "choosing the middle option", "click Offer price"),
  save: entry(
    "We've got the offer details in place now. You'll also see a place for an expiration or limited spots. It's fine to leave that blank if your ad doesn't have that restriction; we don't want to invent urgency. Take a moment to look back over what you've entered. When it matches your offer, click Save and Connect Leads. That saves the campaign and takes us to its connection setup. It hasn't connected the form yet, but now we've got the right destination ready. Leave this campaign open, because we're going to come back to it.",
    "click Save and Connect Leads"),
  "1:copy": entry(
    "Now we're on the campaign's connection page. Because this form was built in Go High Level, choose Go High Level here. Patient Pipeline gives this campaign its own private connection address. Think of it as the destination we're about to give the form, so the response lands in this campaign instead of somewhere else. Click Copy beside that address. You want this special address, not the ordinary page address at the top of the browser. I'm hiding the private value in the lesson. Keep yours out of your ad and out of any screenshots you share.",
    "choose Go High Level here", "Click Copy beside"),
  "2:copy": entry(
    "We've saved the campaign, and now we need somewhere for Go High Level to send these leads. Choose Go High Level on this setup page, because that's the service doing the sending in this route. The private address you see belongs to this particular campaign. Click Copy beside it, and we'll take it over to our new workflow. Don't copy the browser's page address instead; that wouldn't tell the workflow where to deliver the lead. I'm hiding the private value here, but you'll paste your own complete address in a moment. Keep it private.",
    "Choose Go High Level", "Click Copy beside"),
  "3:copy": entry(
    "We've saved the offer, so now let's give Zapier the right destination. Choose Facebook or Instagram on this setup page. The private connection address here belongs to this campaign, which is how Patient Pipeline will know where this form's leads belong. Click Copy beside that address, and keep the campaign tab open while we set up Zapier. Don't use the normal page address from your browser, and don't put this private address in the ad. I'm hiding it in the lesson; when we get to the URL field, you'll paste your own full value.",
    "Choose Facebook or Instagram", "Click Copy beside"),
  workflow: entry(
    "Let's switch to your Go High Level tab now, and make sure you're in the right practice. Open Automation, then Workflows. We're going to make a separate connection workflow, rather than change any messages you already have running. Click Create Workflow and choose Start from scratch. Once that opens, click the workflow name and type Send Back Pain Form to Patient Pipeline, or a name that identifies your own form. That way, if you need to check this later, you'll know which workflow handles the connection. Next, we'll tell it exactly when it should run.",
    "Open Automation", "Click Create Workflow", "choose Start from scratch", "click the workflow name"),
  webhook: entry(
    "We've told the workflow which submission to watch for. Now we need to tell it what to do with that submission. Click the plus below the trigger to add an action, and type webhook into the search. Choose the ordinary action called Webhook. We don't want Custom Webhook or an inbound webhook here, because we're sending contact information out to Patient Pipeline. If this action isn't available, or your account asks you to pay for access, pause and check that before continuing. Choosing a similar-looking action won't give us the same setup.",
    "Click the plus", "type webhook", "ordinary action called Webhook"),
  destination: entry(
    "Now we're in the sending step. I'll name it Send lead to Patient Pipeline so its purpose is clear when we come back. Under Method, choose POST. That's the sending method this connection expects. Then click the URL box and paste the private campaign address we copied earlier. On Windows, that's Control V; on a Mac, Command V. If you've copied something else since then, just return to Patient Pipeline and copy the address again. Don't type the hidden example shown here. We need your own complete campaign address in this box.",
    "name it Send lead", "Under Method", "click the URL box"),
  "save-action": entry(
    "At this point, you might be wondering where to put the name and phone fields. With this standard Webhook action, you don't have to map those ordinary contact fields yourself; it already includes them. So we'll leave Headers empty, and we won't add anything under Custom Data for this basic setup. Review what the action sends before using it with sensitive information. Now click Save Action. Back in the builder, you should have your form trigger followed by this one sending step. We're not adding texts, emails, or calls to this connection workflow.",
    "leave Headers empty", "under Custom Data", "click Save Action"),
  publish: entry(
    "The sending step is saved, but we still need to let the workflow run. Open Settings and turn on Allow Re-entry for this new workflow. That lets someone submit again after their previous run has finished. Then return to the Builder and click Save. Once it's saved, change Draft to Publish. Those aren't the same thing: saving keeps your instructions, while publishing allows new submissions to use them. If another save indicator appears, click Save again. Check that yours is actually published before we try the form; this demonstration hasn't activated anything in your account.",
    "Open Settings", "turn on Allow Re-entry", "return to the Builder", "and click Save", "change Draft to Publish", "click Save again"),
  verify: entry(
    "Now let's return to that same campaign in Patient Pipeline and see what happened to your submission. Look for a recent Form submission received message. If it's still waiting, give it a moment and use your browser's refresh button to check again. Once you can see the receipt, open the campaign's Leads tab and look for the name and phone you used. We're matching your actual details here, not just looking for any new row. The illustration shows where to check; it isn't claiming your connection has passed. That confirmation needs to come from your own submission.",
    "Look for a recent", "browser's refresh button", "campaign's Leads tab"),
  duplicates: entry(
    "If you're testing again and don't see another row, that doesn't necessarily mean something went wrong. Open Lead sources and look under Last twenty received, then match the time to your test. A New lead result means a new entry was created. An Updated lead result can be successful too; that phone was already in this campaign, so Patient Pipeline updated the existing entry. It may not move to the top. If the receipt says Rejected, open it and read the reason before changing settings. That will tell us much more than repeatedly submitting and hoping.",
    "Open Lead sources", "A New lead result", "An Updated lead result", "receipt says Rejected"),
  internal: entry(
    "There's one distinction I want to make before we finish, because it's easy to mistake a partial test for the whole connection working. Patient Pipeline's internal test checks its own intake. Testing a sending action checks that step, and it may create a real lead, but neither proves the actual form will trigger it automatically. That's why we've started our final check at the form itself and followed that same person's details into the campaign. Let your caller know which entry was your setup test, and keep private details out of any troubleshooting screenshots you share.",
    "internal test checks", "started our final check"),
  finish: entry(
    "Before you leave the setup, take one more look at your campaign. Does it match the offer people actually saw? Good. Now make sure the connection is watching the right form and is switched on. The important part is what happened after you activated it: you submitted that actual form, and you found the matching receipt and lead in this campaign. If either part is missing, go back to that point before calling it ready. Leave the connection active, and let your team know which entry was your test. You now know where to look if a future delivery needs attention.",
    "look at your campaign", "connection is watching", "you submitted that actual form", "found the matching receipt"),
  "find-form": entry(
    "Let's find the exact form we're going to connect. In Go High Level, check the practice name, then open Sites and Forms. Find the form used by your offer; ours is called Back Pain New Patient Form. Write down your form's exact name, because we'll need it when we set up the trigger. Have a look at its fields, too. It needs a standard name field and phone field. If either is missing, add the normal contact field in the builder, make it required, and save. Leave existing consent fields and other requirements in place.",
    "open Sites", "and Forms", "Find the form used", "and phone field"),
  "public-form": entry(
    "Now let's keep the visitor's version of that form handy so we can test it later. If your ad links to a published website page, open that page. Otherwise, you can use the form's own direct link: open Integrate in the form builder, and copy the direct form link. Use the plus beside your browser tabs to open another tab, then paste that link into the address bar and press Enter. Leave the form there for now. We haven't turned on the connection yet, so we'll come back and submit it after the workflow is published.",
    "open Integrate", "copy the direct form link", "Use the plus", "paste that link into"),
  "1:trigger": entry(
    "Now let's tell this workflow which form we're interested in. Click Add New Trigger, and search for Form Submitted. Choose Form Submitted from the results. That's what starts the workflow when someone completes a form built in Go High Level. We don't want every form going into this campaign, though, so add the Form Is filter and choose the exact form name you wrote down. I'm using Back Pain New Patient Form. Once yours is selected, click Save Trigger and check the name again. That small filter is what keeps unrelated offers out of this campaign.",
    "Click Add New Trigger", "search for Form Submitted", "Choose Form Submitted", "add the Form Is filter", "click Save Trigger"),
  "1:submit": entry(
    "Now that your workflow is published, let's go back to the actual form we left open. Enter your own first name and a phone number you control, along with any other required information. Double-check the phone so we'll recognize the same entry later. Read and complete the required consent boxes and any verification, then click Submit once. Wait for the thank-you message or next page. That tells us the form accepted the response, but not whether it reached Patient Pipeline. Back in Go High Level, open this form's Submissions under Sites and Forms, and find your entry.",
    "Enter your own first name", "a phone number you control", "click Submit once", "this form's Submissions"),
  "1:troubleshoot": entry(
    "If your entry hasn't arrived, let's find where it stopped rather than changing everything at once. Start with the form's Submissions in Go High Level. If your response is there, open the connection workflow's Execution Logs and find the same contact and time. When there's no run, check the exact form filter and whether the workflow was saved and published. If there is a run but the Webhook failed, check POST and copy the campaign address again. Don't use Regenerate URL as a general fix; it invalidates the old address. Then try the actual form again.",
    "form's Submissions", "workflow's Execution Logs", "check the exact form filter", "Webhook failed"),
  "2:intro": entry(
    "If your Facebook or Instagram form leads already arrive in Go High Level, we can keep that working connection and add Patient Pipeline after it. That's what we'll do together in this lesson. You don't need to disconnect Facebook or rebuild your existing follow-up. We'll create the campaign, add a separate sending workflow, and follow a new submission through both systems so you know where to check. The outside screens are instructional recreations, not recordings of your account. Pause whenever you need to catch up, and use the matching controls in your own account.",
  ),
  identify: entry(
    "Before we add anything, let's make sure we're starting from a connection that's already working. In Go High Level, check that you're in the right practice. We need the Facebook Page and exact Instant Form for this offer; write down both names so we can select them later. For Instagram, you'll use the linked Facebook Page. Now find a recent lead from that form in Contacts and check that the name and phone arrived. If they didn't, pause here and fix that first connection. Adding our workflow won't repair a lead that never reaches Go High Level.",
    "right practice", "Facebook Page", "exact Instant Form", "in Contacts"),
  "2:trigger": entry(
    "Here's where this route differs from a form built inside Go High Level. Click Add New Trigger, then search for Facebook Lead Form Submitted. Choose that exact result, not the ordinary Form Submitted trigger. Now add Page Is and choose the connected Facebook Page you wrote down. Under Form Is, choose this offer's exact Instant Form. We want both filters, otherwise another form could send people into the wrong campaign. When those names match your offer, click Save Trigger. Now the workflow knows which incoming Facebook submission should start our sending step.",
    "Click Add New Trigger", "search for Facebook Lead Form Submitted", "Choose that exact result", "add Page Is", "Under Form Is", "click Save Trigger"),
  "2:submit": entry(
    "Now that the workflow is published, let's send something new through the actual route. Open the ad or its form preview, and make sure it's the same Instant Form we selected. Enter your own first name and phone number, and read the required consent information before submitting once. To check a particular live ad end to end, submit through that actual ad. Meta's Lead Ads Testing Tool can help with a setup check, but its sample isn't proof that the live ad works. We're going to follow this new submission, rather than reuse an old contact.",
    "same Instant Form", "your own first name", "and phone number", "submitting once"),
  trace: entry(
    "Let's see whether that new submission made it through the first part. Back in Go High Level, open Contacts and find your test person. Check the phone number, so we know we're following the same submission. Then open your connection workflow's Execution Logs and look for a recent run. Inspect the Webhook step for that contact. Using Test Workflow with an old contact isn't the same check; it skips the new Facebook submission we care about. Once you've found this new person and their run, we'll return to Patient Pipeline and check the campaign.",
    "open Contacts", "Check the phone number", "workflow's Execution Logs", "Inspect the Webhook step"),
  "2:troubleshoot": entry(
    "If something is missing, we can narrow it down by where the lead stopped. When the test never reaches Go High Level, look at the existing Facebook integration, permissions, Page and form selection, and name and phone mapping. The owner may need to restore leads access. When the test is in Go High Level but not Patient Pipeline, look at our new workflow's filters, published status, and execution. If its Webhook failed, check POST and the campaign address. Fix that first missing part, then submit again. There's no need to disconnect an integration that's already working.",
    "test never reaches", "test is in Go High Level", "its Webhook failed"),
  "3:intro": entry(
    "Let's connect your Facebook or Instagram form to Patient Pipeline without using Go High Level. We'll do it through Zapier, which passes the form response into the right campaign for us. You don't need to sign up for Go High Level for this route. You will need paid Zapier access for Facebook Lead Ads, so check that before we start. I'll take you through the setup and then show you how to follow your own test submission. The outside screens are labeled recreations; your account may look a little different, but we'll explain what you're looking for.",
  ),
  access: entry(
    "Let's make sure we've got the right Facebook details before we open Zapier. Find the Page for this offer and the published Instant Form the ad uses, and keep both names handy. If you're advertising on Instagram, use its linked Facebook Page. The Facebook account we connect needs permission for that Page, the ad account, and leads access. If your business has customized leads access, the owner may also need to allow Zapier as a CRM. It's worth sorting that out now, because a missing permission won't be fixed by choosing a different form later.",
    "Find the Page", "published Instant Form", "needs permission"),
  "zap-create": entry(
    "Now let's open Zapier in another browser tab and create a new Zap. I'll give it the name Send Back Pain Form to Patient Pipeline, so we can recognize it later. A Zap starts with a trigger, which just means the event it's waiting for. Click that trigger step and choose Facebook Lead Ads as the app. For the event, choose New Lead. That's how we'll ask Zapier to watch for a new form response. Click Continue, and we'll connect the Facebook account that can actually see the Page and form we want.",
    "create a new Zap", "give it the name", "choose Facebook Lead Ads", "choose New Lead", "Click Continue"),
  "zap-account": entry(
    "Now we're choosing which Facebook account Zapier can use. Open the account selection, and use an existing connection if it already has the access we need. Otherwise, choose the sign-in option and complete Facebook's own sign-in and permission prompts. Do that privately in your account; you don't need to share your password with anyone helping you. Once you're back in Zapier, check which account is selected, then continue. If your Page doesn't appear on the next screen, we'll come back and check access rather than accidentally choose another business.",
    "Open the account selection", "choose the sign-in option", "then continue"),
  "zap-form": entry(
    "With the account connected, let's tell Zapier exactly which form belongs to this campaign. Open Page and choose the Facebook Page you wrote down. Then open Form and choose the Instant Form used by this particular ad. We don't want a broad selection that could send unrelated offers into the same campaign. Once both names look right, click Continue. Now we'll use Test trigger to find a sample from that form. We need a usable sample because, in a moment, we'll show Zapier which answers contain the person's name and phone.",
    "Open Page", "open Form", "click Continue", "use Test trigger"),
  "zap-sample": entry(
    "If there's no useful sample yet, we can make one with Meta's Lead Ads Testing Tool. Open it in another tab and select the same Page and Form. Click Preview Form, and fill it in with your own test details. Work through Next and Submit as the form asks, then close the preview and use Create lead as directed by the tool. That gives us setup data to work with. It isn't a live-ad check yet. We'll go back to Zapier next and make sure it finds the sample you actually entered, rather than an unrelated example.",
    "select the same Page", "and Form", "Click Preview Form", "your own test details", "through Next and Submit", "use Create lead"),
  "zap-sample-check": entry(
    "Back in Zapier, click Test trigger again. When the results appear, select the sample that matches your details. Before we use it, make sure the phone and a usable name are actually present. If Meta says a test already exists and you need a new sample, its Delete lead control removes the testing tool's sample. That's the only sample we're talking about removing here, not a customer's real lead. Once you can identify your sample in Zapier, we're ready to tell the sending step which answers to use.",
    "click Test trigger", "select the sample", "make sure the phone"),
  "zap-action": entry(
    "We've got a form response to work with, so now let's add the step that sends it to Patient Pipeline. Click the plus below the Facebook trigger, and choose Webhooks by Zapier as the action app. For its event, choose POST, then click Continue. We're using the ordinary POST action, not Custom Request, because it lets us enter the information in simple rows. You don't need to write code for this. We'll give it the campaign's private address first, and then match the name and phone answers from the form.",
    "Click the plus", "choose Webhooks by Zapier", "choose POST", "click Continue"),
  "zap-url": entry(
    "Let's get that destination again so we know we're using the right one. Switch to Patient Pipeline, check the campaign name, and click Copy beside its private address. Back in Zapier, click the URL box and paste it with Control V on Windows, or Command V on a Mac. Now choose JSON under Payload Type. That's just a format in the menu; it doesn't mean you need to type computer code. Leave the optional headers and authentication empty for this campaign address. Next we'll tell Zapier which form answers to send there.",
    "click Copy beside", "click the URL box", "choose JSON"),
  "zap-map": entry(
    "Now we're matching the form answers to what Patient Pipeline expects. Under Data, type first underscore name in the left-hand box. On its right, open the field picker and choose the First Name answer from the Facebook trigger. That makes it change for each person, rather than always sending your test name. Add another row, and type phone on the left. Then choose the trigger's Phone Number answer on the right. Take a moment to compare both rows: labels on the left, changing form answers on the right. Don't type a fixed name or phone into those value boxes.",
    "type first underscore name", "open the field picker", "Add another row", "type phone on the left", "choose the trigger's Phone Number"),
  "zap-full-name": entry(
    "You might not see a separate First Name answer in your form, and that's okay. If it gives you Full Name instead, change that name key on the left to full underscore name. Then choose the form's Full Name answer on the right. Patient Pipeline can split that for you. Keep the phone row we just set up. We're replacing the first-name mapping here, not adding a second conflicting name rule. If you'd like to send email too, that's optional; use the email key with the actual Email answer from the trigger, rather than typing your own address.",
    "change that name key", "choose the form's Full Name", "Keep the phone row"),
  "zap-test": entry(
    "We've given Zapier its destination and matched the fields, so let's try the sending step. Check that the selected sample contains your approved test details, because this test really sends them into the campaign. Continue to the action's test step and send the sample. Then check Patient Pipeline for the same phone number. If the action reports an error, check the URL, JSON choice, and mapped name and phone. Even if this test succeeds, we haven't proved automatic delivery yet. We've checked the sending step; next we'll switch the Zap on and try a new form submission.",
    "selected sample contains", "action's test step", "check Patient Pipeline"),
  "zap-publish": entry(
    "Before we turn this on, let's look back over what we've connected. At the top, the Facebook Lead Ads trigger should use New Lead with your exact Page and Form. Beneath it, the Webhooks by Zapier action should use POST, your campaign address, and the mapped answers we just checked. When that's right, publish the Zap and confirm that it's on. The button wording may differ in your editor, but a saved draft isn't enough. Once it's active, a new matching submission can run through these steps without us pressing the test button.",
    "Facebook Lead Ads trigger", "Webhooks by Zapier action", "publish the Zap", "confirm that it's on"),
  "3:submit": entry(
    "Now that the Zap is on, let's check the route a new lead will actually take. Open the same Instant Form through the actual ad, enter your own name and phone, and complete any required consent or verification. Submit once and wait for the form's confirmation. Then open Zap History in Zapier and look for a new run at the time you just submitted. Match its form details before we check Patient Pipeline. We're not rerunning the action test here. This new submission is what tells us whether the form starts the active Zap automatically.",
    "enter your own name", "and phone", "Submit once", "open Zap History"),
  "3:troubleshoot": entry(
    "If your lead hasn't arrived, start with Zap History. When there's no new run, check that the Zap is on and watching the right Page and Form, and that Facebook leads access is still available. If there is a run but the action failed, open it and read the error. Then check the URL, JSON format, and dynamic name and phone answers. If Patient Pipeline says Updated lead, look for the existing entry with that phone. You don't need a new campaign to force another row. Fix the first failing part, then try the actual form again.",
    "there's no new run", "the action failed", "says Updated lead"),
};

export function conversationalLesson(original) {
  const lesson = structuredClone(original);
  for (const scene of lesson.scenes) {
    const rewrite = conversation[`${lesson.number}:${scene.key}`] ?? conversation[scene.key];
    if (!rewrite) throw Error(`Missing conversational rewrite: ${lesson.number}/${scene.key}`);
    if (rewrite.cues.length !== scene.actions.length) throw Error(`Cue count mismatch: ${lesson.number}/${scene.key}`);
    scene.narration = rewrite.narration;
    scene.actions.forEach((action, i) => {
      const cue = rewrite.cues[i];
      if (!scene.narration.toLowerCase().includes(cue.toLowerCase())) throw Error(`Missing cue ${scene.key}: ${cue}`);
      delete action.at;
      action.cue = cue;
    });
  }
  return lesson;
}