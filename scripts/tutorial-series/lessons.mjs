// Production scripts, not live integrations. All external UI is instructional artwork.
const f = (label, value, kind = "text") => ({ label, value, kind });
const a = (target, at, result, typing = false) => ({ target, at, result, typing });
const shot = (key, title, app, page, narration, fields = [], actions = [], options = {}) =>
  ({ key, title, app, page, narration, fields, actions, ...options });
const campaign = "Back Pain Relief — $49 New Patient Special";
const form = "Back Pain New Patient Form";
const practice = "Example Practice";
const privateUrl = "[Your private campaign connection address]";

const prepare = shot("prepare", "Before we begin", "guide", "Keep three browser tabs open",
  "Before we start, have your actual offer beside you, and make sure you can sign in to the accounts this lesson uses. You'll need permission to edit the connection. Keep Patient Pipeline open in one browser tab and the other service in another. The little plus sign opens a new tab without closing your work. For testing, use your own name and a phone number you control. Existing emails or texts may run, so let your office know you're doing a setup check. Pause here until you're ready.",
  [f("Have ready", "Your actual ad and offer"), f("Account access", "Patient Pipeline Lead Follow-Up and the source service"), f("Test information", "Your own name and phone; no patient information")],
  [a("tab-plus", .20, "New tab"), a("Test information", .67, "Your own details")],
  { checkpoint: "Sign in before continuing. Never show passwords or private links." });
const open = shot("campaigns", "Open a new campaign", "patient", "Lead Follow-Up → Campaigns",
  "Let's start in Patient Pipeline. Choose Lead Follow-Up, rather than Reactivation. Then open Campaigns. On the Campaigns page, click New Campaign. A campaign is the offer that brought someone to your practice. We're going to use the same campaign all the way through this lesson, so the connection and the test stay together. Pause here when the new campaign form is open.",
  [], [a("lead-followup", .13, "Lead Follow-Up"), a("campaigns", .29, "Campaigns"), a("new-campaign", .47, "New campaign")],
  { image: "pp-campaigns.png", checkpoint: "You should be in Lead Follow-Up, with New Campaign open.", screenSequence: ["pp-welcome.png", "pp-campaigns.png", "pp-editor-offer.png"] });
const service = shot("service", "Choose the service", "patient", "New campaign",
  "Click Service type to open the list. Choose the service your ad actually promotes. We're choosing Chiropractic for our back pain example. If your offer is for another service, choose that instead. This choice determines which call script your team will use. Check the selected service before moving on. You don't have to copy our example if it doesn't match your practice.",
  [f("Service type", "Chiropractic", "select")], [a("Service type", .10, "Chiropractic")],
  { image: "pp-editor-offer.png", checkpoint: "The selected service must match your ad." });
const name = shot("name", "Type a recognizable name", "patient", "New campaign",
  "Now click Campaign name. Give this offer a name your team will recognize. We're typing Back Pain Relief, forty-nine-dollar New Patient Special. You can see the words appearing in the field as we type them. For your campaign, use your own offer name. Keep it specific enough that you can recognize it when we return to check the test.",
  [f("Campaign name", campaign)], [a("Campaign name", .20, campaign, true)],
  { image: "pp-editor-offer.png", checkpoint: "Use the same campaign for setup, connection, and testing." });
const included = shot("included", "Enter what the offer includes", "patient", "What's included in the offer",
  "Under What's included in the offer, enter one item on each line. Our example has a consultation, an examination, and a review of findings. Click the first row and type the first item. Use Add a line for another row, then enter the next item. These details become part of what the caller says, so only include what your ad really promises. Pause and compare your entries with the offer.",
  [f("Included item 1", "Consultation"), f("Included item 2", "Examination"), f("Included item 3", "Review of findings"), f("Add a line", "", "button")],
  [a("Included item 1", .14, "Consultation", true), a("Add a line", .37, "Add a line"), a("Included item 2", .45, "Examination", true), a("Included item 3", .64, "Review of findings", true)],
  { image: "pp-editor-offer.png", checkpoint: "One real included item per row." });
const price = shot("price", "Choose Just Y, then type 49", "patient", "Price",
  "For our example, we only want to say the offer price. Click the middle choice, Just Y. Then click Offer price and type 49. Look at the On the call preview: it now says Just forty-nine dollars. That's the wording your caller will use. This does not change your software bill. If your ad compares a regular price with the offer, use Normally X, now Y and enter both real prices instead. For this example, we'll keep Just Y.",
  [f("Price style", "Just Y", "price"), f("Offer price", "49"), f("On the call", "Just $49", "preview")],
  [a("Just Y", .13, "Just Y"), a("Offer price", .30, "49", true)],
  { image: "pp-editor-price.png", checkpoint: "Just Y selected • Offer price 49 • Preview Just $49" });
const save = shot("save", "Save and connect leads", "patient", campaign,
  "Leave the expiration or limited-spots box blank unless your offer really has that restriction. Check your service, campaign name, included items, and price once more. Now click Save and Connect Leads. Wait for the campaign's setup page to open. Saving stores your offer, but it doesn't connect the form by itself. We'll make that connection next. Keep this campaign open in its browser tab.",
  [f("Offer expiration or limited spots", "", "optional"), f("Save & Connect Leads", "", "button")],
  [a("Save & Connect Leads", .44, "Connection setup")],
  { image: "pp-editor-price.png", checkpoint: "Wait until the saved campaign's connection setup opens." });
const copy = (source) => shot("copy", "Copy this campaign's address", "patient", "Finish connecting your lead form",
  `In the campaign setup, choose ${source === "ghl" ? "Go High Level" : "Facebook or Instagram"}. Find this campaign's private connection address and click its Copy button. Don't copy the ordinary page address from the top of your browser. This special address tells the other service where to send the lead. Keep it private, and don't put it in your ad. We're hiding it in this lesson. You'll paste your own full address into the connection shortly.`,
  [f("Where is the form?", source === "ghl" ? "GoHighLevel" : "Facebook / Instagram", "select"), f("This campaign's connection address", privateUrl, "private"), f("Copy", "", "button")],
  [a("Where is the form?", .12, source === "ghl" ? "GoHighLevel" : "Facebook / Instagram"), a("Copy", .33, "Copied")],
  { checkpoint: "Copy the special campaign address—not the browser's page URL." });

const workflow = shot("workflow", "Create a separate workflow", "ghl", "Automation → Workflows",
  "Click your Go High Level browser tab. Check that you're in the right practice. Open Automation, then Workflows. Click Create Workflow and choose Start from scratch. We're making a separate connection workflow so we don't change your existing follow-up messages. Click the workflow name and type Send Back Pain Form to Patient Pipeline. Use a name that identifies your own form. Pause here when the new workflow is open.",
  [f("Create Workflow", "", "button"), f("Start from scratch", "", "button"), f("Workflow name", "Send Back Pain Form to Patient Pipeline")],
  [a("nav-Automation", .12, "Automation"), a("Create Workflow", .29, "Create Workflow"), a("Start from scratch", .39, "Start from scratch"), a("Workflow name", .64, "Send Back Pain Form to Patient Pipeline", true)],
  { checkpoint: "Use a new workflow, not an existing messaging sequence." });
const webhook = shot("webhook", "Choose Webhook—not Custom Webhook", "ghl", "Workflow builder → Add action",
  "Click the plus sign below your saved trigger. In the action search, type webhook. Choose the ordinary action called Webhook, not Custom Webhook and not an inbound webhook. This is the step that sends contact information out to Patient Pipeline. If the screen asks you to buy something or doesn't show this action, stop and check your account's access. Don't choose a different action just because its name is similar.",
  [f("+ Add action", "", "button"), f("Search actions", "webhook"), f("Webhook", "", "button"), f("Custom Webhook", "Not used in this lesson", "note")],
  [a("+ Add action", .08, "Add action"), a("Search actions", .21, "webhook", true), a("Webhook", .35, "Webhook")],
  { checkpoint: "Select the standard outbound Webhook action." });
const destination = shot("destination", "Set POST and paste the address", "ghl", "Webhook",
  "Name the action Send lead to Patient Pipeline. Open Method and choose POST. Then click inside URL and paste the campaign address you copied. On Windows, hold Control and press V. On a Mac, hold Command and press V. If you copied something else in between, switch back to Patient Pipeline, click Copy again, then return here. The whole private address goes in this URL box. Don't type the example text shown in this lesson.",
  [f("Action Name", "Send lead to Patient Pipeline"), f("Method", "POST", "select"), f("URL", privateUrl, "private")],
  [a("Action Name", .08, "Send lead to Patient Pipeline", true), a("Method", .24, "POST"), a("URL", .37, privateUrl)],
  { checkpoint: "Method POST • URL is your campaign's full private address." });
const saveAction = shot("save-action", "Save the sending step", "ghl", "Webhook settings",
  "For this basic connection, leave Headers and Custom Data empty. The standard Webhook action already sends the contact's name and phone, so you don't need to type code or map those ordinary contact fields here. Click Save Action. You should now see your form trigger followed by one Webhook step. We are not adding an email, text message, or phone call to this workflow.",
  [f("Headers", "Leave empty", "note"), f("Custom Data", "Leave empty for this lesson", "note"), f("Save Action", "", "button")],
  [a("Headers", .13, "Empty"), a("Custom Data", .25, "Empty"), a("Save Action", .58, "Action saved")],
  { checkpoint: "One form trigger → one Webhook action. No handwritten JSON." });
const publish = shot("publish", "Allow re-entry, save, and publish", "ghl", "Workflow settings and status",
  "Open the workflow's Settings tab. Turn on Allow Re-entry for this new connection workflow. That lets someone submit again after their previous run has finished. Return to the Builder and click Save. Now change Draft to Publish. If another save indicator appears, click Save again. Saved and published are different: one stores the instructions, and the other allows them to run. Check both before testing.",
  [f("Settings", "", "button"), f("Allow Re-entry", "On", "toggle"), f("Builder", "", "button"), f("Save", "", "button"), f("Draft / Publish", "Publish", "toggle")],
  [a("Settings", .06, "Settings"), a("Allow Re-entry", .19, "On"), a("Builder", .42, "Builder"), a("Save", .51, "Saved"), a("Draft / Publish", .63, "Publish"), a("Save", .83, "Saved")],
  { checkpoint: "Saved AND Published. This demonstration has not activated your account." });

const verify = shot("verify", "Check the receipt, then the lead", "patient", "This campaign → Connection setup",
  "After your real form submission, return to the same campaign in Patient Pipeline. Look for a recent Form submission received message. If it still says it's waiting, give it a moment and refresh the page with your browser's circular-arrow button. Then open this campaign's Leads tab. Match the name and phone you entered. The illustration here is showing where to check, not claiming that a live connection has passed.",
  [f("Latest receipt", "Waiting for a submission from your form", "waiting"), f("Refresh page", "", "button"), f("Leads", "", "button"), f("Match your test", "Name + phone + correct campaign", "note")],
  [a("Latest receipt", .18, "Check the time"), a("Refresh page", .42, "Refresh"), a("Leads", .58, "Leads")],
  { checkpoint: "No success is assumed. Find your own submission in this campaign." });
const duplicates = shot("duplicates", "Recognize a successful repeat test", "patient", "Lead sources → Last 20 received",
  "For a closer check, open Lead sources and look under Last twenty received. Match the delivery time to your test. New lead means a new entry was created. Updated lead can also be successful: that phone number was already in this campaign. A repeat test may not add another row or move the old one to the top. Rejected means something needs fixing. Open that receipt and read the reason before changing settings.",
  [f("Lead sources", "", "button"), f("New lead", "A new campaign lead was created", "legend"), f("Updated lead", "Same campaign + same phone may update the existing lead", "legend"), f("Rejected", "Open the receipt and read the reason", "legend")],
  [a("Lead sources", .11, "Last 20 received"), a("New lead", .29, "Meaning"), a("Updated lead", .44, "Meaning"), a("Rejected", .77, "Read the reason")],
  { checkpoint: "Status explanations—not a fabricated delivery log." });
const internal = shot("internal", "Don't mistake an internal test for proof", "patient", "Only want to check our side?",
  "There are shortcuts that check only part of the connection. Patient Pipeline's internal test checks its own intake. A connector's test action checks a sending step. Neither proves that a new submission to your actual form will arrive automatically. That's why our final check starts with the form itself and ends with the matching campaign lead. Your test entry is a real lead, so let your caller know which entry was the setup check.",
  [f("Send internal test", "Checks only Patient Pipeline's side", "note"), f("Connector action test", "Can send real data; does not prove the trigger", "note"), f("Final check", "Actual form → matching campaign lead", "preview")],
  [a("Send internal test", .22, "Not end-to-end proof"), a("Final check", .65, "Check the complete route")],
  { checkpoint: "Keep private details out of screenshots and shared troubleshooting messages." });
const finish = shot("finish", "Before you call it ready", "guide", "Set up. Connect. Verify.",
  "Before you call this ready, check four things. Your campaign matches the offer. Your connection watches the right form and is turned on. You submitted that actual form after turning it on. And your matching test entry appears in this campaign. Leave the connection active, and make sure your team knows which entry was the test. One successful test confirms that delivery; it isn't a guarantee that every future delivery will work. You now know where to check.",
  [f("1", "Campaign matches the actual offer", "check"), f("2", "Correct form selected; connection is active", "check"), f("3", "Actual form submitted after activation", "check"), f("4", "Matching receipt and lead in the correct campaign", "check")],
  [a("1", .15, "Check your account"), a("2", .29, "Check your account"), a("3", .43, "Check your account"), a("4", .57, "Check your account")],
  { checkpoint: "Complete these checks in your own accounts. No live result is asserted here." });

const ghlIntro = shot("intro", "Connect your GoHighLevel form", "guide", "Lesson 1 • Native GoHighLevel forms",
  "Let's connect your Go High Level form to Patient Pipeline, one step at a time. This lesson is for a form built in Go High Level, even if it's displayed on your website. We'll add your offer, set up the connection, and show you how to verify your own submission. External screens are instructional recreations, so their appearance may differ from your account. Pause whenever you need time to follow along.",
  [f("Your route", "GoHighLevel form → workflow → Patient Pipeline", "preview"), f("We'll show", "Every click, typed entry, and check", "note")], [],
  { checkpoint: "This is a walkthrough—not a recording of a live connected account." });
const findGhlForm = shot("find-form", "Find the exact form", "ghl", "Sites → Forms",
  "In Go High Level, check the practice name first. Click Sites, then Forms, and open the form used by your offer. Our example is Back Pain New Patient Form. Write down your form's exact name. Check that it collects a standard name and phone number. If either is missing, add the normal contact field in the form builder, mark it required, and save. Don't remove consent fields or other requirements already on your form.",
  [f("Forms", "", "button"), f(form, "", "button"), f("Name field", "Standard First Name or Full Name • Required", "note"), f("Phone field", "Standard Phone • Required", "note")],
  [a("nav-Sites", .10, "Sites"), a("Forms", .19, "Forms"), a(form, .32, form), a("Phone field", .64, "Required")],
  { checkpoint: "Use this exact form name in the workflow filter." });
const publicForm = shot("public-form", "Keep the public form open", "ghl", "Form builder → Integrate",
  "Open the page where a visitor actually fills out this form. If your ad already links to a website page, use that published page. For a shared Go High Level form, click Integrate and copy its direct form link. Open a new browser tab, paste that link into the address bar, and press Enter. Keep this form tab open, but don't submit yet. We'll turn on the connection first.",
  [f("Integrate", "", "button"), f("Direct form link", "[Your public form link]", "private"), f("Copy link", "", "button"), f("Browser address bar", "[Your public form link]")],
  [a("Integrate", .27, "Sharing options"), a("Copy link", .40, "Copied"), a("tab-plus", .54, "New tab"), a("Browser address bar", .66, "[Your public form link]")],
  { checkpoint: "Public form link and private campaign address are different." });
const ghlTrigger = shot("trigger", "Choose Form Submitted", "ghl", "Workflow builder → Trigger",
  "Click Add New Trigger. In the search box, type Form Submitted and select that trigger. A trigger tells Go High Level when to start. Now add the Form Is filter and select the exact form name you wrote down earlier. We're choosing Back Pain New Patient Form. Do not leave this set to every form. Save the trigger, then check that the chosen form is still correct.",
  [f("Add New Trigger", "", "button"), f("Search triggers", "Form Submitted"), f("Form Submitted", "", "button"), f("Form Is", form, "select"), f("Save Trigger", "", "button")],
  [a("Add New Trigger", .07, "Trigger settings"), a("Search triggers", .18, "Form Submitted", true), a("Form Submitted", .29, "Form Submitted"), a("Form Is", .48, form), a("Save Trigger", .79, "Trigger saved")],
  { checkpoint: "Native GoHighLevel form: Form Submitted → Form Is → your exact form." });
const submitGhl = shot("submit", "Submit the actual form once", "form", form,
  "Click the tab containing your actual form. Enter your own first name and phone number, plus any other required information. Review the phone carefully. Complete the required consent boxes and any verification check, then click Submit once. Wait for its thank-you message or next page. That only tells us the form accepted the response. Back in Go High Level, open Sites, Forms, this form, and Submissions. Find your entry before we check Patient Pipeline.",
  [f("First Name", "Your first name"), f("Phone", "Your own phone number"), f("Required consent", "Read and complete in your own form", "note"), f("Submit", "", "button"), f("Submissions", "", "button")],
  [a("First Name", .15, "Your first name", true), a("Phone", .29, "Your own phone number", true), a("Submit", .52, "Submit once"), a("Submissions", .79, "Find your actual response")],
  { checkpoint: "Demonstration only. Submit your own real form after publishing." });
const ghlTrouble = shot("troubleshoot", "If nothing arrives", "ghl", "Connection workflow → Execution Logs",
  "If the lead is missing, check in this order. First, find the submission under the correct form in Go High Level. Next, open your connection workflow's Execution Logs and look for the test contact and time. If no run appears, check the exact form filter, Save, and Publish. If the Webhook step failed, check POST and recopy the correct campaign address. Don't click Regenerate URL as a general fix; that invalidates the old address.",
  [f("1 • Submissions", "Correct form and today's response", "note"), f("2 • Execution Logs", "Match the contact and time", "note"), f("3 • Workflow", "Form Is correct; Saved AND Published", "note"), f("4 • Webhook", "POST and the current campaign address", "note")],
  [a("1 • Submissions", .16, "First"), a("2 • Execution Logs", .36, "Then"), a("3 • Workflow", .55, "Check settings"), a("4 • Webhook", .73, "Check destination")],
  { checkpoint: "Fix the first missing step, then repeat the actual form submission." });

const fbIntro = shot("intro", "Facebook leads already in GoHighLevel", "guide", "Lesson 2 • Keep your existing Facebook connection",
  "This lesson is for Facebook or Instagram Instant Forms whose leads already arrive in Go High Level. We won't reconnect an integration that's working. Instead, we'll send the right form's new leads from Go High Level into Patient Pipeline. We'll create the campaign, add one sending workflow, and walk through the checks. The outside-service screens are labeled recreations, not recordings of your accounts. Pause after each step as needed.",
  [f("Your route", "Facebook / Instagram → GoHighLevel → Patient Pipeline", "preview"), f("Before starting", "New Instant Form leads already arrive in the correct practice", "note")], [],
  { checkpoint: "If leads do not reach GoHighLevel, this is not your route." });
const fbIdentify = shot("identify", "Confirm the page and Instant Form", "ghl", "Correct practice → Contacts",
  "Before adding the new connection, find a recent lead from this exact Facebook or Instagram form in Go High Level. Check the name and phone. Write down the Facebook Page name and the Instant Form name used by this offer. An Instagram business account uses its linked Facebook Page for this connection. If the lead never reached Go High Level, pause here and fix that first connection. We shouldn't build the next step on top of a missing first step.",
  [f("Practice", practice, "select"), f("Facebook Page", practice, "select"), f("Instant Form", form, "select"), f("Contacts", "Confirm an actual recent lead and phone", "note")],
  [a("Practice", .10, practice), a("Facebook Page", .36, practice), a("Instant Form", .46, form), a("Contacts", .67, "Verify your own lead")],
  { checkpoint: "No sample contact shown here is proof that your existing integration works." });
const fbTrigger = shot("trigger", "Use Facebook Lead Form Submitted", "ghl", "Workflow builder → Trigger",
  "Click Add New Trigger and search for Facebook Lead Form Submitted. Choose that exact trigger. This is different from Form Submitted, which is for forms built inside Go High Level. Add the Page Is filter and select your connected Facebook Page. Then add Form Is and choose this offer's exact Instant Form. Check both names before you click Save Trigger. Without those filters, unrelated forms can enter the wrong campaign.",
  [f("Add New Trigger", "", "button"), f("Search triggers", "Facebook Lead Form Submitted"), f("Facebook Lead Form Submitted", "", "button"), f("Page Is", practice, "select"), f("Form Is", form, "select"), f("Save Trigger", "", "button")],
  [a("Add New Trigger", .05, "Trigger settings"), a("Search triggers", .15, "Facebook Lead Form Submitted", true), a("Facebook Lead Form Submitted", .30, "Selected"), a("Page Is", .49, practice), a("Form Is", .65, form), a("Save Trigger", .83, "Saved")],
  { checkpoint: "Facebook Lead Form Submitted • Page Is • Form Is" });
const fbSubmit = shot("submit", "Send a new form submission", "meta", "The actual ad → Instant Form",
  "Now open the actual ad or its form preview and complete the same Instant Form a new lead would use. Use your own contact details and read the required consent information. Submit once after the workflow is published. For an end-to-end live-ad check, use the form through the actual ad. Meta's Lead Ads Testing Tool can help with a setup test, but its test leads are not proof that a particular live ad works.",
  [f("Selected Page", practice, "select"), f("Selected Form", form, "select"), f("First name", "Your first name"), f("Phone number", "Your own phone number"), f("Submit", "", "button")],
  [a("Selected Form", .14, form), a("First name", .27, "Your first name", true), a("Phone number", .38, "Your own phone number", true), a("Submit", .54, "Submit once")],
  { checkpoint: "Use the exact form after publishing. Test-tool data is a separate setup check." });
const fbTrace = shot("trace", "Follow the lead through GoHighLevel", "ghl", "Contacts → Workflow Execution Logs",
  "Return to Go High Level and open Contacts. Find the new test person and match the phone number. Then open the connection workflow and its Execution Logs. Look for the same contact and a recent run of the Webhook step. Running Test Workflow with an old contact is not the same test: it bypasses the new Facebook form submission we're checking. Once this new lead has reached Go High Level, continue to Patient Pipeline.",
  [f("Contacts", "", "button"), f("Find your test", "Match the actual name and phone", "note"), f("Execution Logs", "", "button"), f("Webhook step", "Inspect the actual recent run", "note")],
  [a("Contacts", .09, "Contacts"), a("Find your test", .26, "Match phone"), a("Execution Logs", .43, "Execution Logs"), a("Webhook step", .58, "Inspect your run")],
  { checkpoint: "Trace the same new submission, not an unrelated old contact." });
const fbTrouble = shot("troubleshoot", "Find which connection needs attention", "ghl", "Settings → Integrations / Workflow logs",
  "If your test is absent from Go High Level, check the existing Facebook integration, the Page and form selection, and the name and phone field mapping. The account owner may need to restore leads access. If the test is in Go High Level but not Patient Pipeline, check the new workflow's Page Is and Form Is filters, its published status, and the Webhook execution. Fix the first missing part. Don't disconnect a working integration just to start over.",
  [f("Missing in GoHighLevel", "Check Facebook integration, permissions, and field mapping", "note"), f("Present in GoHighLevel", "Check trigger filters and published workflow", "note"), f("Webhook failed", "Check POST and the campaign destination", "note")],
  [a("Missing in GoHighLevel", .15, "First connection"), a("Present in GoHighLevel", .49, "Second connection"), a("Webhook failed", .71, "Sending step")],
  { checkpoint: "Settings → Integrations → Facebook Form Fields Mapping, when needed." });

const zapIntro = shot("intro", "Facebook forms without GoHighLevel", "guide", "Lesson 3 • Connect through Zapier",
  "This lesson connects a Facebook or Instagram Instant Form to Patient Pipeline without Go High Level. We'll use Zapier as the connector and follow one complete route. You do not need to sign up for Go High Level for this method. Facebook Lead Ads on Zapier requires a paid Zapier account, so check your plan first. We'll show each setup step with labeled instructional screen recreations and explain how to verify your own actual submission.",
  [f("Your route", "Facebook / Instagram → Zapier → Patient Pipeline", "preview"), f("Required", "Paid Zapier access for Facebook Lead Ads", "note"), f("Not required", "A GoHighLevel account", "note")], [],
  { checkpoint: "No current price is promised. Check the plan available in your account." });
const zapAccess = shot("access", "Check Page and leads access", "meta", "Facebook Page and Instant Form",
  "Have the Facebook Page and published Instant Form for this offer ready. The Facebook account you connect must have the Page, ad account, and leads access Zapier needs. If your business has customized leads access, the account owner may need to give Zapier CRM access too. For Instagram, use the Facebook Page linked to the business account. Write down the Page and form names so we can select the correct pair.",
  [f("Facebook Page", practice, "select"), f("Instant Form", form, "select"), f("Access", "Manage Pages • Manage Ad Account • Leads Access", "note"), f("Customized leads access", "Allow Zapier CRM access when required", "note")],
  [a("Facebook Page", .17, practice), a("Instant Form", .28, form), a("Access", .48, "Check your permissions")],
  { checkpoint: "Missing permissions cannot be fixed by choosing a different form." });
const zapCreate = shot("zap-create", "Create a Zap and its trigger", "zapier", "New Zap",
  "Open Zapier in another browser tab and sign in. Create a new Zap and give it a name such as Send Back Pain Form to Patient Pipeline. Click the Trigger step. Search for Facebook Lead Ads and select that app. For the trigger event, choose New Lead, then continue. A trigger is what starts the instructions. In our case, it's a new submission to the form we're about to select.",
  [f("Create Zap", "", "button"), f("Zap name", "Send Back Pain Form to Patient Pipeline"), f("Trigger app", "Facebook Lead Ads", "select"), f("Trigger event", "New Lead", "select"), f("Continue", "", "button")],
  [a("Create Zap", .11, "New Zap"), a("Zap name", .26, "Send Back Pain Form to Patient Pipeline", true), a("Trigger app", .48, "Facebook Lead Ads"), a("Trigger event", .66, "New Lead"), a("Continue", .83, "Continue")],
  { checkpoint: "Trigger app Facebook Lead Ads • event New Lead" });
const zapAccount = shot("zap-account", "Connect the correct Facebook account", "zapier", "Trigger → Account",
  "In the trigger's account step, connect your Facebook account, or select the existing connection that owns the right access. Complete Facebook's sign-in and permission prompts in your own account. Never send your password to someone in a message. Return to Zapier and check which account is selected. Then continue to the trigger setup. If your Page is missing later, revisit access rather than selecting a different business by mistake.",
  [f("Account", "Your authorized Facebook account", "select"), f("Sign in", "Complete securely in Facebook", "button"), f("Continue", "", "button")],
  [a("Account", .13, "Choose authorized account"), a("Sign in", .33, "Secure sign-in"), a("Continue", .72, "Continue")],
  { checkpoint: "Sign-in screens are not reproduced. Follow the real permission prompts." });
const zapForm = shot("zap-form", "Select the Page and exact form", "zapier", "Trigger → Configure",
  "Open Page and select the Facebook Page for this offer. Next, open Form and choose the exact Instant Form used by the ad. Don't leave the form choice broad if it would send unrelated offers into this campaign. Check both names carefully, then continue to the test step. The next step needs a sample from this form so we can connect its name and phone fields.",
  [f("Page", practice, "select"), f("Form", form, "select"), f("Continue", "", "button"), f("Test trigger", "", "button")],
  [a("Page", .12, practice), a("Form", .32, form), a("Continue", .68, "Continue"), a("Test trigger", .83, "Look for a sample")],
  { checkpoint: "Choose a specific Page AND Form. Generic sample data is not your live test." });
const zapSample = shot("zap-sample", "Create an identifiable sample", "meta", "Lead Ads Testing Tool",
  "If Zapier doesn't have a useful sample, open Meta's Lead Ads Testing Tool in another tab. Select the same Page and Form. Click Preview Form, enter your own test details, and complete the form's Next and Submit steps. Close the preview and use Create lead as directed by the tool. Then return to Zapier and click Test trigger. Match the sample's name and phone before you use it for field mapping.",
  [f("Page", practice, "select"), f("Form", form, "select"), f("Preview Form", "", "button"), f("Your test details", "Your own name and phone"), f("Next / Submit", "", "button"), f("Create lead", "", "button")],
  [a("Page", .13, practice), a("Form", .25, form), a("Preview Form", .35, "Preview Form"), a("Your test details", .49, "Your own name and phone", true), a("Next / Submit", .63, "Complete and close preview"), a("Create lead", .75, "Create sample")],
  { checkpoint: "developers.facebook.com/tools/lead-ads-testing/ • sample only, not live-ad proof." });
const zapSampleCheck = shot("zap-sample-check", "Find that sample in Zapier", "zapier", "Trigger → Test",
  "Back in Zapier, click Test trigger and select the sample that matches the details you just entered. Make sure a usable name and phone are present. If Meta says a test already exists, its Delete lead button removes the tool's sample, not a real production lead. Remove only that test sample if you need to repeat this setup check. Do not delete customer leads to make a tutorial test work.",
  [f("Test trigger", "", "button"), f("Selected sample", "Match your actual sample", "select"), f("Name", "Must contain a usable value", "note"), f("Phone", "Must contain a usable value", "note")],
  [a("Test trigger", .12, "Fetch samples"), a("Selected sample", .29, "Choose your sample"), a("Phone", .47, "Check the value")],
  { checkpoint: "Do not use an invented generic sample as evidence of the form connection." });
const zapAction = shot("zap-action", "Add Webhooks by Zapier", "zapier", "Action → Setup",
  "Click the plus below the Facebook Lead Ads trigger to add an action. Search for Webhooks by Zapier and select it. For the action event, choose POST, then continue. We're using the ordinary POST action because it gives us simple rows for the information we're sending. Don't choose Custom Request for this lesson. Next, we'll paste the destination and match the form answers.",
  [f("+ Add action", "", "button"), f("Action app", "Webhooks by Zapier", "select"), f("Action event", "POST", "select"), f("Continue", "", "button")],
  [a("+ Add action", .12, "Action"), a("Action app", .29, "Webhooks by Zapier"), a("Action event", .48, "POST"), a("Continue", .63, "Continue")],
  { checkpoint: "Webhooks by Zapier → POST" });
const zapUrl = shot("zap-url", "Paste the URL and choose JSON", "zapier", "POST → Configure",
  "Switch to Patient Pipeline, check your campaign name, and click Copy beside its private connection address. Return to the Zapier tab and click the URL box. Paste with Control V on Windows or Command V on a Mac. Now open Payload Type and select JSON. That is a format choice in the menu; you do not need to write computer code. Leave optional headers and authentication empty for this connection.",
  [f("Patient Pipeline • Copy", "", "button"), f("URL", privateUrl, "private"), f("Payload Type", "JSON", "select"), f("Headers / authentication", "Leave empty for this campaign address", "note")],
  [a("Patient Pipeline • Copy", .12, "Copied"), a("URL", .33, privateUrl), a("Payload Type", .56, "JSON")],
  { checkpoint: "URL from this campaign • Payload Type JSON" });
const zapMap = shot("zap-map", "Match the name and phone fields", "zapier", "POST → Data",
  "Under Data, the left side names the information Patient Pipeline expects. The right side must use an answer from the Facebook trigger, not a name or phone you type yourself. In the first left-hand box, type first underscore name. On its right, open the field picker and choose the form's First Name answer. Add another row. Type phone on the left, then choose the form's Phone Number answer on the right. Pause and check both rows.",
  [f("Data key 1", "first_name"), f("Data value 1", "Facebook Lead Ads → First Name", "mapping"), f("Add row", "", "button"), f("Data key 2", "phone"), f("Data value 2", "Facebook Lead Ads → Phone Number", "mapping")],
  [a("Data key 1", .24, "first_name", true), a("Data value 1", .41, "Facebook Lead Ads → First Name"), a("Add row", .53, "Add row"), a("Data key 2", .63, "phone", true), a("Data value 2", .77, "Facebook Lead Ads → Phone Number")],
  { checkpoint: "Left: first_name / phone • Right: dynamic form answers—not fixed test values." });
const zapFullName = shot("zap-full-name", "If your form has only Full Name", "zapier", "POST → Data • alternative name row",
  "Your form may provide Full Name instead of separate first and last names. In that case, use full underscore name as the left-hand key, and choose the form's Full Name answer on the right. Keep the phone row. Patient Pipeline can split that full name. Use this as an alternative to the first-name row, not a second conflicting name rule. Email is optional; if you include it, select the actual Email answer from the trigger.",
  [f("Alternative name key", "full_name"), f("Alternative name value", "Facebook Lead Ads → Full Name", "mapping"), f("Phone key", "phone", "note"), f("Phone value", "Facebook Lead Ads → Phone Number", "note"), f("Optional email", "email → Facebook Lead Ads Email", "note")],
  [a("Alternative name key", .23, "full_name", true), a("Alternative name value", .40, "Facebook Lead Ads → Full Name"), a("Phone key", .55, "Keep phone mapping")],
  { checkpoint: "Use either first_name or full_name, according to the fields your form supplies." });
const zapTest = shot("zap-test", "Test the sending action", "zapier", "POST → Test",
  "Continue to the action's test step and send the selected sample. This action test really sends information to the campaign, so use only your approved test details. Check Patient Pipeline for the sample and correct phone. If the action reports an error, check the destination, JSON choice, and mapped name and phone. A successful action test is useful, but it does not yet prove the Zap will run automatically for a new form submission.",
  [f("Test step", "", "button"), f("Sample data", "Your selected, authorized test details", "note"), f("Check Patient Pipeline", "Match the sample's phone", "note")],
  [a("Sample data", .15, "Review before sending"), a("Test step", .31, "Send your sample"), a("Check Patient Pipeline", .49, "Check your campaign")],
  { checkpoint: "An action test can create a real lead. It is not end-to-end proof." });
const zapPublish = shot("zap-publish", "Publish and turn the Zap on", "zapier", "Review and publish",
  "Review the Zap from top to bottom. The trigger should be Facebook Lead Ads, New Lead, with your exact Page and Form. The action should be Webhooks by Zapier, POST, with your campaign address and mapped fields. Publish the Zap and check that it's on. The wording of the publish control can vary with the editor. A saved draft is not enough. Once it's active, new matching submissions can be sent automatically.",
  [f("Trigger", "Facebook Lead Ads • New Lead • exact Page and Form", "note"), f("Action", "Webhooks by Zapier • POST • JSON • mapped fields", "note"), f("Publish", "", "button"), f("Zap status", "On", "toggle")],
  [a("Trigger", .15, "Review"), a("Action", .35, "Review"), a("Publish", .53, "Publish"), a("Zap status", .68, "On")],
  { checkpoint: "Publish control is illustrative; confirm active status in your actual editor." });
const zapSubmit = shot("submit", "Now test a new real submission", "meta", "Actual ad → Same Instant Form",
  "After the Zap is on, submit the actual Instant Form again through the ad using your own name and phone. Don't just rerun the action test. Wait for the form's confirmation, then open Zapier's Zap History and look for this new run. Match its time and form details. After that, check the same campaign in Patient Pipeline. A Meta testing-tool sample is useful for setup, but submitting through the actual ad checks the real route your lead will take.",
  [f("Your name", "Your own name"), f("Your phone", "Your own phone number"), f("Submit", "", "button"), f("Zap History", "", "button")],
  [a("Your name", .12, "Your own name", true), a("Your phone", .23, "Your own phone number", true), a("Submit", .40, "Submit once"), a("Zap History", .61, "Find the new run")],
  { checkpoint: "New form submission after activation → new Zap run → campaign lead." });
const zapTrouble = shot("troubleshoot", "If the lead is missing", "zapier", "Zap History",
  "If no Zap run appears, check that the Zap is on, the Page and Form are correct, and Facebook leads access is still available. If a run appears but the action failed, open that run and read the error. Check the URL, JSON format, and that the name and phone rows use real trigger answers. If Patient Pipeline says Updated lead, look for the existing entry with that phone. Don't keep making new campaigns to force another test row.",
  [f("No run", "Check On status, Page, Form, and leads access", "note"), f("Failed action", "Read error; check URL, JSON, and dynamic values", "note"), f("Updated lead", "Find the existing same-phone campaign lead", "note")],
  [a("No run", .15, "Check trigger"), a("Failed action", .42, "Check sending action"), a("Updated lead", .71, "Match phone")],
  { checkpoint: "Fix the first failing step, then submit the actual form again." });

const commonCampaign = [open, service, name, included, price, save];
const commonEnd = [verify, duplicates, internal];
export const lessons = [
  { slug: "patient-pipeline-ghl-forms", number: 1, title: "Connect a GoHighLevel Form", short: "GOHIGHLEVEL FORMS",
    scenes: [ghlIntro, prepare, findGhlForm, publicForm, ...commonCampaign, copy("ghl"), workflow, ghlTrigger, webhook, destination, saveAction, publish, submitGhl, ...commonEnd, ghlTrouble, finish] },
  { slug: "patient-pipeline-facebook-ghl", number: 2, title: "Facebook & Instagram Through GoHighLevel", short: "FACEBOOK → GOHIGHLEVEL",
    scenes: [fbIntro, prepare, fbIdentify, ...commonCampaign, copy("ghl"), workflow, fbTrigger, webhook, destination, saveAction, publish, fbSubmit, fbTrace, ...commonEnd, fbTrouble, finish] },
  { slug: "patient-pipeline-facebook-zapier", number: 3, title: "Facebook & Instagram Without GoHighLevel", short: "FACEBOOK → ZAPIER",
    scenes: [zapIntro, prepare, zapAccess, ...commonCampaign, copy("facebook"), zapCreate, zapAccount, zapForm, zapSample, zapSampleCheck, zapAction, zapUrl, zapMap, zapFullName, zapTest, zapPublish, zapSubmit, ...commonEnd, zapTrouble, finish] },
];
export const voice = { voiceId: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", modelId: "eleven_v3", voiceSettings: { stability: .5, similarity_boost: .75, speed: .96 } };
export const sources = [
  "https://help.gohighlevel.com/support/solutions/articles/155000002550-workflow-trigger-form-submitted",
  "https://help.gohighlevel.com/support/solutions/articles/155000003299-workflow-action-webhook-outbound-",
  "https://help.gohighlevel.com/support/solutions/articles/155000004549-how-to-create-a-contact-form-in-highlevel-",
  "https://help.gohighlevel.com/support/solutions/articles/155000001254",
  "https://help.gohighlevel.com/support/solutions/articles/48001239875-workflow-settings-overview",
  "https://help.gohighlevel.com/support/solutions/articles/155000003095-workflow-trigger-facebook-lead-form-submitted",
  "https://help.gohighlevel.com/support/solutions/articles/48001157632-step-by-step-guide-to-facebook-integration-in-highlevel",
  "https://help.zapier.com/hc/en-us/articles/8496061306253-How-to-get-started-with-Facebook-Lead-Ads-on-Zapier",
  "https://help.zapier.com/hc/en-us/articles/8496061345805-Use-the-Facebook-Lead-Ads-testing-tool-to-create-sample-leads",
  "https://help.zapier.com/hc/en-us/articles/8496326446989-Send-webhooks-in-Zap-workflows",
  "https://developers.facebook.com/docs/marketing-api/guides/lead-ads/testing-troubleshooting/",
];