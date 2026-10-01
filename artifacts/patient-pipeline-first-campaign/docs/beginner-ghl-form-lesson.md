# Connect Your GoHighLevel Form to Patient Pipeline

## Beginner walkthrough — script for review

**Status:** Research-checked draft, not a filmed or live-tested connection. Existing videos and the downloaded MP4 are unchanged.

**Audience:** An office owner or team member with little computer experience. The viewer already has access to Patient Pipeline Lead Follow-Up and a GoHighLevel account containing the form they want to connect.

**Finish line:** Submit that actual form, see the corresponding delivery in the correct Patient Pipeline campaign, and find the matching name and phone in its Leads tab. A saved workflow, a thank-you message, or an internal test alone is not enough.

**One route only:** A form created in GoHighLevel → a dedicated Form Submitted workflow → the standard Webhook action → one Patient Pipeline campaign. No Facebook setup, tags, Zapier, Make, JSON typing, or API keys in this lesson.

**Length:** Let the complete demonstration determine the runtime. Pause points are deliberate; viewers may need considerably longer than the video's playing time.

## What has been verified

- HighLevel documents the Form Submitted trigger and the Form Is filter for forms created in HighLevel. [1]
- Its standard outbound Webhook action sends contact details, including names and phone, automatically. Patient Pipeline's intake parser and existing tests support those standard fields. Manual mapping of ordinary name/phone fields is not the starting procedure. [2, A]
- Saved and Published are separate states in HighLevel. Both must be checked. [3]
- HighLevel documents real form submission as a better end-to-end check than relying on Test Workflow. [3]
- Patient Pipeline distinguishes successful external deliveries from its internal test. Repeated submissions with the same normalized phone in the same campaign update an existing lead rather than necessarily creating another row. [A]
- Focused local intake, field-mapping, and notification tests passed: 34 tests across three files. These use fixtures/mocks; they do not prove a live GoHighLevel connection.

## What still needs a real rehearsal before filming

- The exact current GoHighLevel screens, account/location selector, form-sharing controls, and permission settings in an authorized demo account. Official documentation supports the route, but that is not the same as interacting with the account.
- Availability and account-specific charges. The lesson uses Webhook, not Custom Webhook. Do not promise “free,” universal plan availability, or ask viewers to purchase an upgrade without checking the actual account. [2, 5]
- An actual standard Webhook delivery from the selected live form to an authorized campaign on the published Patient Pipeline app.
- The resulting receipt, field values, matching lead, and any test-related notifications. No external workflow was created or published and no real lead was submitted during this research.
- The existing in-app GoHighLevel guide starts with tags and ends by testing a tag, although it also mentions Form Submitted. Before filming, align that guide with this form-only route or explicitly resolve the discrepancy. Do not silently copy the tag-testing instruction into this lesson.

## Recording and teaching rules

- Use a computer-sized view. This lesson is not an untested phone-browser tutorial.
- Keep the same form, campaign, and workflow throughout. Use real recordings from an authorized demonstration setup, with sensitive values masked.
- Narrate one action, show it, then let the resulting screen settle. Never cut past a menu, save confirmation, tab change, or error.
- Keep enough surrounding screen visible for orientation; zoom for small controls. The cursor tip must actually land on the control being named.
- Say “pause here” at checkpoints and hold a readable card. The exported MP4 cannot wait for the viewer automatically.
- Do not narrate the labels “On screen,” “Pause,” or “Check” below; those are directions for producing the video.
- Use the warm, connected American-English delivery approved for the revised tutorial. Do not read these directions as bullet points.
- Example campaign: **Back Pain Relief — $49 New Patient Special**. Example form: **Back Pain New Patient Form**. Viewers use their own service, offer, and actual form name.
- Preserve privacy: mask sign-in information, private connection addresses, personal contact information, and unrelated records. Never show a real patient or medical history. The standard Webhook can send additional standard/custom contact fields, not just name and phone. Use a clean demonstration contact and confirm appropriate data-sharing permissions.
- No public webhook-inspection service is needed. Do not send real contact information to one for this lesson.

## Chapter 1 — Get ready without guessing

### 01. Explain the result

**Narration:** “We're going to connect a form you already use in GoHighLevel to Patient Pipeline. We'll do it together, one step at a time. At the end, you'll fill out your own form and find that same entry inside your campaign. That's how we'll know it worked. You don't need to know any coding. Whenever you need time to catch up, pause the video.”

**On screen:** Show the actual selected form, the campaign page, and the place where the matching lead will appear. If showing a successful entry here, use the result from the completed authorized rehearsal, not a mock result.

**Pause:** “You can pause after every step.”

**Check:** The viewer understands the task is connecting an existing GoHighLevel form, not creating an advertisement or learning the whole product.

### 02. Check access and protect the test

**Narration:** “Have your GoHighLevel sign-in link and your Patient Pipeline sign-in link ready. You'll also need the ad or offer you're connecting. Use your own name and a phone number you control for the test—not a patient's details. Your form may already send emails or texts when someone fills it out. Those can happen during this test too, so let your office know you're checking the setup.”

**On screen:** Show a short readiness card: both accounts accessible; permission to edit forms and workflows; access to Lead Follow-Up; actual offer available; personal test details ready. Explain that account access problems must be resolved by the person controlling that account, not by purchasing random upgrades or repeatedly trying different logins.

**Pause:** “Pause here until you can sign into both accounts.”

**Check:** Required menus are accessible. Do not proceed if the account is locked or the viewer lacks editing access.

### 03. Open GoHighLevel in the correct practice

**Narration:** “Open the GoHighLevel sign-in link you normally use. Your login page may have your provider's name on it. Sign in, then check which practice is open. If you manage more than one, select the practice whose form you want to connect. We need to stay in that same practice while we set this up.”

**On screen:** Demonstrate the actual approved sign-in route and practice/location selector. Pause recording or mask credential entry. Show the practice name after selection. Do not use a guessed login address or agency-wide screen as if it were the practice account.

**Pause:** “Your correct practice should be open.”

**Check:** The selected practice owns the intended form.

### 04. Find the exact form

**Narration:** “In the menu on the left, click Sites. Then open Forms. Find the form people complete for this offer and open it. Ours is called Back Pain New Patient Form. Write down your form's name exactly as you see it. We'll choose that same name again in a few minutes.”

**On screen:** Show Sites → Forms → the actual form. If the current interface includes a Builder/list intermediary, show that click in the verified recording. Show its name, not merely a similar-looking design. [4]

**Pause:** “Pause and find your form.”

**Check:** The form is the one used for this offer, not a general contact form, survey, Facebook Instant Form, or unrelated practice form.

### 05. Check the fields and keep the real form page ready

**Narration:** “Look for the boxes that ask for the person's name and phone number. We need both. Now open the page where someone would actually fill out this form. If your ad already goes to a website page, use that page. Keep it open, but don't submit anything yet. We're going to connect it first.”

**On screen:** Confirm the form's standard Name/First Name and Phone fields are collected. For a shared form, show Integrate and the actual direct-link copy control; click the browser's + tab button, paste the public form link into the address bar, and press Enter. For an embedded form, open the actual published page and identify the matching form. Label the recording's chosen route plainly. [4]

**Pause:** “Your actual form page should be open in another tab.”

**Check:** A visitor-facing form is available and can collect a usable name and phone. If a required field is missing, use recovery section R6 before continuing. A generic editor preview is not a substitute for testing the actual page people will use.

## Chapter 2 — Create the campaign that receives these leads

### 06. Open Patient Pipeline without losing your place

**Narration:** “At the top of your browser, click the little plus sign to open another tab. Open your Patient Pipeline sign-in link and sign in. The tabs along the top let us switch between these pages without closing them. Leave your GoHighLevel tab and your form tab open.”

**On screen:** Show the +, the address bar, the approved Patient Pipeline sign-in destination, and the three recognizable browser tabs. Keep credentials off the recording. Provide a small caption: Windows paste is Ctrl+V; Mac paste is Command+V.

**Pause:** “Pause until Patient Pipeline is open.”

**Check:** Patient Pipeline, the GoHighLevel editor, and the actual form remain available in separate tabs.

### 07. Open New Campaign

**Narration:** “In Patient Pipeline, choose Lead Follow-Up, not Reactivation. Open Campaigns, then click New Campaign. This is where we tell Patient Pipeline which offer these people are asking about.”

**On screen:** Show every click from the actual welcome/navigation state. Hold on the New campaign form. [A]

**Pause:** “You should be looking at a new campaign.”

**Check:** Service type and Campaign name are visible. If Lead Follow-Up is unavailable, resolve account/product access rather than choosing Reactivation as a substitute.

### 08. Choose the service

**Narration:** “Click the Service type box to open the list. Choose the service your ad is promoting. We're choosing Chiropractic for our back pain example. If your offer is for something else, choose the service that matches your offer instead.”

**On screen:** Open the actual dropdown, scroll only if needed, click Chiropractic, and show the selected value after the list closes.

**Pause:** “Choose your service before continuing.”

**Check:** The closed field shows the intended service. Do not silently use Chiropractic for an unrelated offer.

### 09. Name the campaign

**Narration:** “Click Campaign name. Give it a name that will make sense to your team later. We're typing Back Pain Relief, forty-nine-dollar New Patient Special. Use a name that identifies your own offer. This is the campaign name we'll look for when we check the test.”

**On screen:** Type the example character by character. Keep the completed name visible long enough to read.

**Pause:** “Enter a name you'll recognize.”

**Check:** The campaign has a distinctive name; the same campaign will be used through the final test.

### 10. Enter what is included

**Narration:** “Under What's included in the offer, enter one item on each line. Our example includes a consultation, an examination, and a review of findings. Use only what your own ad actually offers. If you need another row, click Add a line.”

**On screen:** Focus each row and enter each item separately. Show Add a line if demonstrating an extra row. Do not promise a service that is not in the actual offer.

**Pause:** “Compare these items with your ad.”

**Check:** Items match the ad, rather than being copied unquestioningly from the example.

### 11. Choose Just Y and enter the offer price

**Narration:** “Now look at the three price choices. For our example, we only want the caller to mention the offer price, so we're choosing the middle option, Just Y. Click the box labeled Offer price below it and type 49. Look underneath: the preview now says Just forty-nine dollars. That's what the caller will say. Use your actual offer price.”

**On screen:** The cursor clicks inside Just Y; its radio/card becomes selected. Then click Offer price—not Regular price—and type 49. Show the resulting “Just $49” preview. Briefly explain in a caption that Normally X, now Y also requires a real regular price; no need to teach all three routes here.

**Pause:** “Check the selected price style and the offer price.”

**Check:** Just Y is selected and the preview matches the actual offer. Explain that this changes the call script, not the customer's software bill.

### 12. Save the campaign and open its setup

**Narration:** “Leave the expiration or limited-spots box empty unless your offer really has that restriction. Check the service, name, included items, and price once more. Then click Save & Connect Leads. Saving creates the campaign. The next steps connect the form.”

**On screen:** Click Save & Connect Leads and wait for the resulting campaign setup page. Keep the same campaign name in view. If a validation message appears, explain and correct it instead of cutting it out. [A]

**Pause:** “Your saved campaign and its connection setup should now be visible.”

**Check:** The campaign has actually saved. No switch to a different saved demo campaign is permitted.

### 13. Select GoHighLevel and locate the private address

**Narration:** “When Patient Pipeline asks where people fill out the form, choose GoHighLevel. That's correct even if the form is displayed on your website, because this form was built in GoHighLevel. Find the connection address for this campaign. Keep it private. We'll copy it into one specific place in GoHighLevel—not into your ad.”

**On screen:** Select GoHighLevel and identify the campaign's address and its copy control. If setup was closed, first show Continue setup. Keep the private value masked, while leaving its label and copy button visible.

**Pause:** “Check that you're still in the campaign you just created.”

**Check:** The destination belongs to this campaign. Choosing GoHighLevel alone does not establish the connection.

## Chapter 3 — Tell GoHighLevel what to send, and when

### 14. Create a separate workflow

**Narration:** “Click your GoHighLevel browser tab. In the left menu, open Automation, then Workflows. Click Create Workflow and choose Start from scratch. A workflow is simply a set of instructions that runs automatically. We're making a new one so we don't change your existing follow-up messages.”

**On screen:** Demonstrate the current account's creation sequence, including any final create/continue confirmation. Use a new, empty workflow. The labels above are documented in Patient Pipeline's current guide; confirm the current GoHighLevel creation interface during rehearsal. [A, 3]

**Pause:** “You should have a new, empty workflow.”

**Check:** Do not edit or duplicate a live nurturing workflow. This dedicated workflow will contain only the selected form trigger and one outbound Webhook action.

### 15. Give the workflow a recognizable name

**Narration:** “Click the workflow's name and replace it with Send Back Pain Form to Patient Pipeline. For yours, use the name of your form. This will help you find the connection later if you need to check it.”

**On screen:** Show the actual rename control and completed name. Do not assume the edit was saved; show any confirmation required by the current interface.

**Pause:** “Name your workflow.”

**Check:** The name identifies the source form and Patient Pipeline.

### 16. Choose Form Submitted

**Narration:** “Click Add New Trigger. A trigger tells GoHighLevel when to start these instructions. Search for Form Submitted and select it. We're choosing this because we want the instructions to run when someone fills out our form.”

**On screen:** Click Add New Trigger, type the search phrase, and choose Form Submitted. Do not choose Contact Tag, Facebook Lead Form Submitted, or an inbound Webhook trigger. [1]

**Pause:** “Your selected trigger should say Form Submitted.”

**Check:** The trigger belongs to native GoHighLevel forms.

### 17. Select only this form

**Narration:** “Now we'll tell it which form to watch. Open the filter controls and choose Form Is. Open the form list and choose the exact form name you wrote down earlier. Ours is Back Pain New Patient Form. This prevents an unrelated form from sending people into the wrong offer.”

**On screen:** Show the filter-add control, Form Is, and the actual selected form. Record the exact current filter controls rather than inventing an intermediate label. [1]

**Pause:** “Compare the selected name with your actual form.”

**Check:** The filter selects the intended form. Do not leave it as all forms or select one solely because its name looks similar.

### 18. Save the trigger

**Narration:** “Save the trigger. Back on the workflow, you should see the Form Submitted step. Open it once more if you need to check the form name. It should still show the form you selected.”

**On screen:** Click the current trigger-save button and show the saved trigger. Reopen briefly to verify the persisted filter, then close the panel.

**Pause:** “Check that the form selection was saved.”

**Check:** The specific form filter survives closing and reopening the trigger.

### 19. Add the ordinary Webhook action

**Narration:** “Click the plus sign directly below the trigger. In the action search box, type webhook. Choose the option called Webhook—not Custom Webhook. This is the step that sends the person's information to Patient Pipeline.”

**On screen:** Show the actual + under the saved trigger, action search, and standard Webhook selection. Do not select a Marketplace lookalike. [2]

**Pause:** “You should see the Webhook settings.”

**Check:** Method and URL are available. A paid-upgrade prompt or a different action panel is a stop-and-check condition, not an instruction to buy something.

### 20. Set the action name and method

**Narration:** “Name this action Send lead to Patient Pipeline. Check the Method box and choose POST if it isn't already selected. You don't need to learn what those letters mean for this setup. It's simply the sending method this connection uses.”

**On screen:** Fill Action Name; open Method if needed and select POST. Keep the URL field empty until the next step. [2]

**Pause:** “The Method should say POST.”

**Check:** The method is POST, not GET.

### 21. Copy the campaign's address

**Narration:** “Leave this panel open and click your Patient Pipeline tab. Check the campaign name, then click the copy button beside its connection address. That stores the whole address for us. Don't try to type the long address yourself.”

**On screen:** Switch tabs without closing the unfinished action. Use the real copy control and show its success feedback. If browser clipboard permission fails, demonstrate selecting and copying the full value safely rather than pretending it worked. Mask the address in the recording.

**Pause:** “Copy the address from your own campaign.”

**Check:** The copied value is the private campaign destination, not the ordinary page address in the browser bar. Do not click Regenerate URL.

### 22. Paste it into URL

**Narration:** “Switch back to GoHighLevel. Click inside the Webhook's URL box. Paste the address you just copied. On Windows, hold Control and press V. On a Mac, hold Command and press V. The box should now contain the address from your campaign. Your address will be different from the one in this recording.”

**On screen:** Return to the same unfinished action, focus URL, and paste once. If replacing an existing value, show select-all inside that field before pasting. Keep passwords and the private address obscured. Never paste this destination into the browser's address bar. [2, A]

**Pause:** “Confirm the URL box is filled.”

**Check:** No extra quotes, spaces, or manually typed fragments. The destination has not been regenerated since copying it.

### 23. Save the action without extra technical fields

**Narration:** “For this basic setup, we don't need to type code or add extra rows. The ordinary Webhook action already sends the contact's details, including their name and phone. Leave Headers and Custom Data empty for this lesson. Click Save Action.”

**On screen:** Show the empty extra-data/header areas if present, then Save Action. Show the workflow containing the form trigger followed by this one sending action. No SMS, email, call, delay, or bulk-enrollment action is added. [2, A]

**Pause:** “You should see the saved sending step below the form trigger.”

**Check:** The name and phone are standard form/contact fields. Do not imply that arbitrary custom fields always map automatically. Extra requested-time/message mapping is outside this first lesson.

### 24. Allow a later submission to run again

**Narration:** “Open the workflow's Settings tab. Find Allow Re-entry and turn it on. In this small workflow, that lets a person submit the form again after their previous run has finished. Patient Pipeline recognizes the same phone number within this campaign, so you should not expect a second lead row every time.”

**On screen:** Settings → Allow Re-entry, enabled. Return to Builder. Demonstrate only this new, one-action workflow; do not change re-entry across existing marketing workflows. [6, A]

**Pause:** “Allow Re-entry should be on for this connection workflow.”

**Check:** A contact cannot re-enter while still active in the same workflow. A repeat submission does not necessarily reset the lead's calling status, update its displayed name, or move it to the top.

### 25. Save, publish, and confirm both

**Narration:** “Click Save at the top. Now set the workflow to Publish instead of Draft. If a save indicator appears after that change, click Save again. These are two separate things: saved means the instructions are stored; published means they're allowed to run. Once it's published, new submissions to the selected form can start arriving.”

**On screen:** Show Save, the Draft/Publish control, any second Save, and the final saved/published state. Do not enroll old contacts. Do not show Test Workflow as proof the form works. [3]

**Pause:** “Pause and check: saved AND published.”

**Check:** No unsaved-change indicator remains, Publish is active, the correct form filter remains, and the dedicated workflow has only its intended action.

## Chapter 4 — Prove the whole connection

### 26. Submit the actual form once

**Narration:** “Click the tab containing the form your visitor would use. Enter your own name and phone number, and complete any other required boxes. Review the number carefully. Click the form's submit button once. Wait until you see its confirmation message or thank-you page. That tells us the form accepted the entry. We still need to check that it reached Patient Pipeline.”

**On screen:** Complete the actual published form, any required consent controls and CAPTCHA, then submit. Use only an authorized person's test details; do not invent consent or use a patient's information. Show the real confirmation. Remind viewers that existing GoHighLevel messages and enabled office alerts may run.

**Pause:** “Submit your own test once, then continue.”

**Check:** No required-field validation errors remain. Do not fabricate a confirmation or submit repeatedly because the next page is still loading.

### 27. Confirm GoHighLevel recorded it

**Narration:** “Switch back to GoHighLevel. Open Sites, then Forms, and reopen that same form. Click Submissions. Find the entry you just sent and check its name and phone number. This confirms we tested the right form and GoHighLevel received the information.”

**On screen:** Show the complete navigation from the workflow back to the form and its Submissions tab. Set an appropriate date filter or search if needed; show the actual matching response. [4]

**Pause:** “Find your test submission.”

**Check:** Match the phone and submission time as well as the name. If the entry is absent, use R1 before assuming Patient Pipeline rejected it.

### 28. Check this campaign's latest delivery

**Narration:** “Switch to Patient Pipeline and check the campaign name. In the setup section, look for Form submission received. The page checks while it's waiting for its first successful delivery. Give it a short moment. If it still says it's waiting, refresh the page using your browser's circular-arrow button.”

**On screen:** Return to the same campaign. Show the real waiting-to-received change when it occurs. If necessary, reopen Continue setup. Keep the receipt time readable. Explain that an old green message is not evidence of this new test. [A]

**Pause:** “Look for a recent receipt for your test.”

**Check:** The displayed receipt corresponds to the current attempt. Do not claim guaranteed delivery within a fixed number of seconds or continuous future monitoring.

### 29. Find the matching lead

**Narration:** “Now click this campaign's Leads tab. Look for the person you just submitted. Check the phone number against the one you typed into the form. When that entry is in the correct campaign with the right details, you've shown that the information made the whole trip.”

**On screen:** Click Leads (with its current count); identify the matching row and open its detail if needed to see the phone. Keep private details masked in the public video while using a clear, consistent test identity. [A]

**Pause:** “Find your test person and match the phone.”

**Check:** The entry belongs to this campaign, not merely All Leads or an unrelated campaign. Do not insist it is the newest row when a previous test used the same phone.

### 30. Confirm this delivery, not an older entry

**Narration:** “For one final check, open this campaign's Lead sources tab. Under Last 20 received, find the delivery from the time you submitted the form. New lead means a new entry was created. Updated lead means that phone number was already in this campaign. Either can be a successful delivery. Rejected means there's something to fix.”

**On screen:** Show Lead sources → Last 20 received. Refresh if necessary. Expand the matching receipt only as needed to associate the test details and time; mask the private address and unrelated payload data. A source badge may help, but it is not the pass/fail test. [A]

**Pause:** “Check the latest test's time and result.”

**Check:** A successful non-internal receipt and the matching campaign lead both exist. A GoHighLevel Test Workflow request could also count as external receipt, so production evidence must include the actual form submission itself.

### 31. Finish with a specific readiness check

**Narration:** “Let's check what you've done. Your GoHighLevel workflow is saved and published. It watches the correct form. You filled out that actual form, and the matching entry arrived in this campaign. That's the connection we wanted to prove. Leave the workflow published. Tell your caller which entry was your setup test, so they don't treat it as a new patient inquiry.”

**On screen:** Recap the actual saved/published workflow, chosen form, successful receipt, and matching lead. Show only genuinely completed checks. Finish on the same campaign, not a different demo record.

**Pause:** “Only call it ready when all four checks are true.”

**Check:** The test entry is a real lead and can appear in a calling queue; internal tests also persist as leads. Do not book, call, or change a test lead's status merely to make the tutorial look complete. Agree on authorized cleanup with the demo account owner before filming.

## Recovery chapter — When your screen or result is different

Show each recovery as a labeled chapter viewers can jump to. Record actual controls and real or clearly labeled demonstration failures. Keep raw private payloads out of the public recording.

### R1. The form says thank you, but the response is missing in GoHighLevel

**Narration:** “Start with the form itself. In GoHighLevel, open Sites, Forms, and the form you intended to use. Open Submissions and check today's entries. If yours isn't there, compare the page you submitted with this form. You may have opened a different form, or your submission may not have finished.”

**On screen:** Check the practice, exact form, date range, and form-page validation. Do not alter the Patient Pipeline destination before establishing that the source received the submission.

**Pause:** “First find the response in the correct GoHighLevel form.”

**Check:** Resolve the source-form mismatch before proceeding to workflow troubleshooting.

### R2. The submission exists, but the workflow did not run

**Narration:** “Open the connection workflow we created and look at Execution Logs. Find your test contact and the time of your submission. If there's no run, return to the builder. Check that the trigger says Form Submitted, its Form Is selection matches your form, and the workflow is saved and published. If this is a repeat test, also check Allow Re-entry.”

**On screen:** Show Automation → Workflows → the named connection workflow → Execution Logs, then the specific checks. [1, 3, 6]

**Pause:** “Correct one setting, save it, then submit the actual form again.”

**Check:** Let an active run finish before expecting the same contact to re-enter. Do not substitute manually adding a tag or using Test Workflow for the form test.

### R3. The workflow ran, but the sending action shows an error

**Narration:** “Open the Webhook step. Check that the method is POST. In Patient Pipeline, open the intended campaign and copy its connection address again. Paste that into the URL field, save the action, and save the workflow. Make sure it's still published before you repeat the form test.”

**On screen:** Inspect the actual logged error before changing anything. Explain separately if the campaign is archived, the address was replaced, or the provider reports a temporary service error. Do not press Regenerate URL as a generic repair. [2, A]

**Pause:** “Keep the destination tied to the same campaign.”

**Check:** A regenerated address makes old copies invalid. A temporary provider outage is not repaired by repeatedly changing campaign settings.

### R4. Patient Pipeline shows Rejected

**Narration:** “Open the rejected delivery and read the reason. Check that the form collected a name and a usable phone number. For this basic setup, those should be the normal GoHighLevel contact fields, not unrelated custom questions with similar labels.”

**On screen:** Show a privacy-safe real rejection and its cause. Verify the required form fields using R6. Verify the action is the standard Webhook and that no custom Patient Pipeline field mapping overrides the defaults. Advanced mapping fixes require their own verified demonstration, not unexplained JSON instructions.

**Pause:** “Correct the reported missing information and submit the real form again.”

**Check:** The next receipt succeeds and its values reach the intended lead.

### R5. A second test did not create another lead

**Narration:** “If you used the same phone number again, look for the entry that's already there. Patient Pipeline avoids making another lead with that phone number in the same campaign. Check Last 20 received for Updated lead and the time of your latest test. The old row may keep its original name, date, and calling status.”

**On screen:** Pair a recent Updated lead receipt with the existing lead's matching phone. Do not invent fresh test phone numbers or delete records to force a count increase. [A]

**Pause:** “Match the phone and the new delivery time.”

**Check:** No new row is not, by itself, a connection failure.

### R6. The form is missing a name or phone field

**Narration:** “Return to Sites and Forms and open the form. Add the normal First Name or Name field and the normal Phone field if they're missing. Make these required so people can't send an incomplete entry. Save the form. Then reopen the actual form page and check that the fields are visible before testing again.”

**On screen:** Required live-rehearsal insert: show the current standard-field picker, drag/add operation, required-field control, Save, and public-page refresh. HighLevel documents these capabilities; the exact controls and any additional publish step must be captured in the authorized account before recording this passage. Do not remove existing consent fields or other business requirements. [4]

**Pause:** “Check the public form, not just the editor.”

**Check:** Both values feed standard contact fields. Custom-field naming and full-name splitting need checking with the actual form if it differs from the demonstration.

### R7. You cannot find Forms, Automation, or the needed action

**Narration:** “Check that you're in the correct practice account first. If the menu is still missing or you're told you can't edit it, your account may not have the access this setup needs. The person who controls that GoHighLevel account must enable the appropriate access. Don't buy an upgrade or change other practices' settings just to make your screen match.”

**On screen:** Show the current practice selector and a clearly labeled permissions example. Identify this as an access prerequisite, not a webhook error. Verify the actual permission names before filming.

**Pause:** “Resume after the required account access is available.”

**Check:** A video cannot bypass permissions, a suspended account, an unavailable feature, or a service outage. These exceptions must be honest even though the lesson aims to eliminate avoidable support questions.

### R8. No office email arrived

**Narration:** “An email is not our proof that the connection worked. Office alerts may be turned off, and email delivery has its own settings. Check the campaign's receipt and matching lead first. If those are there, you've confirmed this form delivery.”

**On screen:** Return to the actual successful receipt and lead. Do not enable notifications or send extra messages solely for the recording. [A]

**Pause:** “Use the in-app evidence to check the connection.”

**Check:** No promise that every office receives an alert, that a phone auto-dials, or that one successful test guarantees all future deliveries.

## Filming approval checklist

- Approved lesson depth, wording, and scope.
- Authorized demo GoHighLevel practice and Patient Pipeline campaign.
- Exact current UI recorded for all GoHighLevel clicks, including form link, new workflow, trigger filter, re-entry, and publishing.
- Account-specific access and any charges checked before introducing the route as self-service.
- Existing in-app tag-based instructions reconciled with this form-based lesson.
- One real form submission traced through GoHighLevel, the outbound action, Patient Pipeline receipt, and the matching campaign lead.
- Test notifications anticipated; no unrelated contacts enrolled; approved cleanup of the test lead.
- Private addresses, credentials, phone numbers, and unrelated records masked.
- No narration says the connection passed until the corresponding real evidence exists.
- Each recovery path is either actually demonstrated or clearly labeled as a draft requiring rehearsal. No hidden missing clicks in the finished film.
- Revised film exported and its actual MP4 checked separately from preview playback.

## Sources and verification notes

**[1] HighLevel — Workflow Trigger: Form Submitted.** Documents the native-form trigger and Form Is filter. Updated August 25, 2025.
https://help.gohighlevel.com/support/solutions/articles/155000002550-workflow-trigger-form-submitted

**[2] HighLevel — Workflow Action: Webhook (Outbound).** Documents Automation, standard Webhook, POST, URL, Save Action, included contact data, and Execution Logs. Updated March 16, 2026.
https://help.gohighlevel.com/support/solutions/articles/155000003299-workflow-action-webhook-outbound-

**[3] HighLevel — Workflow Builder Walkthrough.** Distinguishes Save from Publish and warns that Test Workflow alone is not a perfect end-to-end test. Updated September 7, 2026.
https://help.gohighlevel.com/support/solutions/articles/155000001254

**[4] HighLevel — How to Create and Manage a Contact Form.** Documents Sites → Forms, standard fields, required fields, Submissions, Integrate, direct links, and embedded forms. Updated September 10, 2026.
https://help.gohighlevel.com/support/solutions/articles/155000004549-how-to-create-a-contact-form-in-highlevel-

**[5] HighLevel — Custom Webhook.** Confirms this is a different, more configurable action. No claim is made that every account includes the chosen standard action at no extra cost.
https://help.gohighlevel.com/support/solutions/articles/155000003305-workflow-action-custom-webhook

**[6] HighLevel — Workflow Settings Overview.** Documents Allow Re-entry, completed-run requirements, and the Settings tab. Updated September 3, 2026.
https://help.gohighlevel.com/support/solutions/articles/48001239875-workflow-settings-overview

**[A] Current Patient Pipeline implementation, read-only review.** Campaign form, campaign details, connection panel, lead sources, lead table, shared webhook parser, intake route, duplicate handling, and notification behavior were reviewed. The relevant local intake/mapping/notification test suites passed. No live third-party delivery, published endpoint, email inbox, or authenticated GoHighLevel UI was tested.

**Important evidence limitation:** Patient Pipeline's green receipt indicates a successful non-internal delivery to that campaign, not which form generated it and not continuous connection monitoring. GoHighLevel's standard action can also be invoked by Test Workflow. That is why this lesson requires the actual form submission, its time/details, the receipt, and the matching campaign lead together.