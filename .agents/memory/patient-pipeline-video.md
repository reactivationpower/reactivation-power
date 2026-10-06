---
name: Patient Pipeline video positioning
description: Brand and content boundaries for videos explaining both Reactivation and Lead Follow-Up.
---

The user's goal is for prospects to be able to watch the longer walkthrough before a sales call. They are considering having sales staff use it as the generic demo, followed by questions and targeted live demonstrations; this is discussion, not an approved implementation.

**Why:** The user wants the walkthrough available before the call and is evaluating a consistent recorded demonstration with live follow-up for specific functionality questions.

**How to apply:** Keep the short landing-page video distinct from the longer walkthrough. Do not assume the walkthrough should only be available after booking, or that discussing its placement authorizes page changes.

The user approved using the short landing video near the top of the landing page, retaining the full walkthrough on the page, and sending the walkthrough with the thank-you email to information submitters whether or not they book. They requested a GHL setup handoff, not live GHL workflow changes.

**Why:** The walkthrough should help unbooked prospects become ready to schedule and help booked prospects prepare for a focused conversation.

**How to apply:** Make viewing available without another form or login. Distinguish the initial information-submission email from appointment confirmation, and avoid asking booked prospects to book again. Treat GHL workflow configuration as unverified until its owner tests it.

For the landing film's service list, “Chiro family” means the complete practice-family bundle, not just the public catalog's chiropractic category or representative examples.

**Why:** The user requested every Chiro-family service. The bundle includes services categorized elsewhere in the public catalog; its chiropractic group alone would omit supported weight-loss and body-contouring services.

**How to apply:** Check current Chiro practice-family membership, then use public display names. Keep every label readable rather than heavily dimming unselected services.

Use the official Patient Pipeline logo, not the Reactivation Power logo, when a video presents both Reactivation and Lead Follow-Up together. The short two-product launch film can function as a social ad, but the main explanation should show more of the process and distinguish dynamic, prior-service-specific Reactivation conversations (Chiropractic, ChiroThin, SoftWave/shock wave) from campaign-specific Lead Follow-Up conversations.

Patient Pipeline is also the brand for the actual software, including demo and authenticated screens; Reactivation and Lead Follow-Up remain product names.

**Why:** The user explicitly approved replacing all remaining Reactivation Power logos in the software first, then recapturing its screens for the walkthrough.

**How to apply:** Fix branding at its software source before refreshing promotional captures. Do not merely cover old logos inside the walkthrough or rename legitimate Reactivation product/process wording.

For the longer walkthrough, show the complete actual caller viewport, not a cut-down script card. Animate an editorial cursor moving to a button that truly exists on that screen, then reveal the resulting full caller screen. Limit the number of demonstrated script steps, and blur the seeded names, contact details, staff identity and form text. Keep the 16:9 cut as the approval version; do not start a 9:16 adaptation until it has been reviewed.

**Why:** The user corrected the logo and said the short film undersells how the program works; they then explicitly preferred recognizing the whole working call screen and watching the team click a real response. They deferred the vertical adaptation pending approval of the landscape cut.

**How to apply:** In future dual-product video work, use branded but privacy-safe seeded examples, preserve enough screen context to show the actual caller workflow, and avoid a full tour of proprietary scripts or patient records. Do not treat the optional landing page as an approved build until the user chooses it.

For tutorial narration, prioritize connected American-English conversation and real sentence pauses over a short runtime. Write explanations with transitions and reasons, not spoken bullet labels. The performance should sound like someone sitting beside the viewer at a desk, explaining how the completed step leads into the next. This applies to all three connection lessons, not just the native GoHighLevel lesson. Shorten dead air between chapters without compressing or removing pauses inside the performance.

**Why:** The user rejected a first-campaign narration that sounded like disconnected bullet reading, with unnatural rhythm and insufficient punctuation pauses, and raised the same issue after hearing the GoHighLevel tutorial. Warm voice settings and non-bulleted paragraph text alone did not solve it.

The user explicitly approved the 85-second desk-side teaching audition for all three lessons. Its natural explanation of why a campaign matters, followed by connected service/name setup, is the speaking-style reference—not the earlier rejected chapter recordings. The approved reference is `attached_assets/generated_audio/patient-pipeline-desk-side-audition.mp3`, with its text in `scripts/tutorial-series/conversational-audition.txt`.

For long tutorial exports, keep resumable frame captures inside the workspace rather than `/tmp`.

**Why:** A workspace restart discarded temporary frame captures during an export even though the authored videos and generated narration survived. Reusing workspace-backed captures then avoided repeating completed capture work.

**How to apply:** Use an ignored workspace capture directory for each distinct render; keep source/audio signature validation. An interrupted MP4 without a finalized container is not a deliverable—check it and resume encoding from the saved frames.

**How to apply:** Confirm the speaking style with a short actual-setup audition before generating another full series. Preserve the approved voice identity and speaking pace, use connected explanations rather than a chain of commands, and retain breathing and sentence endings. Rebuild each lesson's scene durations and action timings from the new audio: clicks, typing, and screen changes must follow the relevant spoken instructions, not old timings or a uniformly stretched timeline. Do not claim that waveform checks establish subjective voice quality.

For long tutorial delivery, distinguish a working preview from a finished, downloadable MP4. When workspace exports lose progress, an explicitly authorized direct render can provide a project-saved file and a download card.

**Why:** The user reported two workspace exports appearing to reset after they walked away and approved a direct MP4 render instead. Preview checks and the absence of a local MP4 cannot establish whether a separate platform export job completed.

**How to apply:** Do not claim access to platform export history or the user's browser downloads. Verify the actual rendered file's duration, video and audio streams, decoding, and representative frames before presenting it. Preserve the current narration and approved visual corrections during export; do not shorten the tutorial merely to make rendering easier.

Check the actual export capture route, not just the workspace screenshot, before rendering a long film.

**Why:** The public development URL injected a blue preview banner and displaced the film, clipping its footer, while the workspace screenshot looked clean. Successful layout checks alone did not establish clean export pixels.

**How to apply:** Inspect an image captured by the exporter itself and assert that the entire film fits the viewport before committing to a full render. Keep platform development notices out of the rendered artwork.

Beginner campaign-connection teaching uses three standalone walkthroughs with a simple route-selection guide: GoHighLevel forms; Facebook/Instagram forms already feeding GoHighLevel; Facebook/Instagram forms without that connection. Preserve the existing overview separately.

**Why:** The user explicitly approved three complete lessons rather than one branching video. The goal is self-service completion by someone with no technical background, reducing avoidable support requests—not merely explaining the concepts.

**How to apply:** Each lesson must include every external setup step, copying/pasting and tab changes, pause points, expected results, a real authorized form submission into the same campaign, and specific troubleshooting. Do not assume Facebook leads already reach GoHighLevel, invent a successful external test, or require viewers to combine several lessons. Structure approval alone is not authorization to modify external accounts or launch live automations.

The three beginner lessons must match the approved first-campaign video's voice, speaking speed, animated cursor clicks, visible typing, zooms, pauses, and branding. The agent is responsible for producing the videos; do not shift that work to the user by asking them to make tutorial recordings.

**Why:** The user initially selected real-recording footage, but clarified that they have no such recordings and expected the agent to make the videos. Their explicit visual requirement is the earlier animated-cursor tutorial's style, not raw screencasts.

**How to apply:** Reuse the approved production treatment and voice settings. When external screens must be recreated from documentation, disclose that clearly in the lesson; never present a recreation as a genuine authenticated recording or verified delivery.

For the native-GoHighLevel-form lesson, teach one dedicated Form Submitted workflow filtered to the exact form, followed by the ordinary outbound Webhook action. Do not mix in a tag-based route, Custom Webhook, or manual JSON entry.

**Why:** A single form-based route minimizes beginner decisions and makes the triggering event match the required end-to-end form test. Documentation/code compatibility is evidence for the draft, not a substitute for an authorized live rehearsal.

**How to apply:** Before filming, verify the actual account's menus, access, charges, outgoing data, and matching form-to-campaign delivery. Resolve any conflicting in-app instructions rather than silently skipping them in the video. Use the same saved campaign throughout; keep the earlier overview and its MP4 separate.

For the landing-page sales video, use the same voice as the Patient Pipeline demo walkthrough, conversational narration rather than spoken bullet points, a visible virtual cursor for every demonstrated button click, and animated typing whenever text entry is shown.

**Why:** The user explicitly requested this treatment after approving the concept of a modest illustrative revenue-opportunity segment connecting Reactivation and Lead Follow-Up. The goal is to request a conversation; the video explains the example while the homepage calculator lets viewers personalize it.

**How to apply:** Confirm the walkthrough's actual voice identity/settings before generating narration; do not substitute a merely similar voice or the connection lessons' reference without checking. Synchronize cursor movement, clicks, visible typing, and resulting screens with natural narration. Keep revenue assumptions visible and distinguish potential revenue from profit. The user subsequently authorized production of the separate landing-page video; that did not authorize changing the landing page or overwriting the walkthrough.

Leave out the persistent on-screen label “Illustrative example · First-year revenue per patient · Not profit or a forecast” from the landing-page video.

**Why:** The user explicitly rejected that overlay while reviewing the script.

**How to apply:** Show the patient counts, revenue assumption, and combined opportunity without that disclaimer overlay. Keep the remaining narration unchanged unless separately revised; removing the overlay does not authorize presenting hypothetical results as actual results.

The walkthrough narrator is ElevenLabs' premade **Matilda — Knowledgable, Professional**, voice ID `XrExE9yKIg1WjnnlVkGX`, not Sarah. The original walkthrough's detailed generation settings were never persisted.

**Why:** The landing-video voice match required checking both the original walkthrough metadata and the provider's live voice search; setup tutorials use a different narrator.

**How to apply:** Preserve Matilda's voice identity when the user asks to match the walkthrough. Save explicit generation settings for new work, but do not describe them as recovered original settings. Match timing to the natural reading, rather than creating long gaps after each short paragraph.

For the landing-video financial example, frame both workstreams as **additional results in one month**, above the office's existing reactivation efforts and lead bookings. Do not spread the example over a year.

**Why:** The user corrected annual revenue framing and emphasized that the benefit must be incremental to what the office already does, not all of its patients or bookings.

**How to apply:** State the month, the incremental baseline for each product, and the assumed per-patient value. Describe the sum as potential additional patient value from that month's patients, not guaranteed cash collected, profit, or a claim that most offices achieve no results.

For the landing film, explain supported niches and patient-service-specific scripts before showing the chiropractic example. The product shot itself starts at the connected-call opening question, then demonstrates an actual response and branch. Privacy masks cover individual identifiers, not whole paragraphs or seeded offer-context banners.

**Why:** The user found the mid-script opening confusing and the large blur blocks visually excessive. They also worried a chiropractic-only screen would make viewers miss the other niches and service-tailored scripts.

**How to apply:** Preserve real UI button wording and surrounding script context. Mask names (including staff names inside call-history text), phones and emails locally. Show several complete queue rows without clipping them. Use synthetic demo captures, not actual patient data.

CDP screencasts emit changed frames, not a constant frame stream; an intentional final still can produce no events at later review checkpoints.

**Why:** A complete playback with a correct final invitation was flagged incomplete solely because the last hold did not repaint.

**How to apply:** Explicitly screenshot review checkpoints during static holds and retain real capture timestamps. For encoding, hold the verified final static frame to the canonical end; do not invent missing motion or claim a held frame was freshly captured later.

In landing-video messaging, reactivation means past patients inactive for three months or longer—not someone who merely missed a few visits. Prior trust supports the easier-return explanation; lower acquisition cost is a rule of thumb, not a guarantee.

**Why:** The user explicitly corrected the opener because “haven’t been back in a while” suggested short-term missed visits and omitted the reason this audience is valuable.

**How to apply:** State the three-month threshold in voice and on the same opening visual, explain prior trust, and qualify cost comparisons. This is messaging guidance, not permission to change patient eligibility or scheduling logic.

Narration pacing changes should preserve the approved voice/takes and vocal pitch, while leaving music tempo unchanged. Retiming must also preserve visible clicks and readable character-by-character typing.

**Why:** The user requested a modest increase in speaking speed, not a different voice or faster music. Regenerating approved paragraphs would unnecessarily change their delivery.

**How to apply:** Apply a pitch-preserving speech tempo adjustment, retime scene beats to it, and generate only newly added wording. Keep source generation settings distinct from playback tempo so later work does not accidentally apply the speed-up twice.

Browser audio can naturally end before the JavaScript player's final timer reports completion; `paused` alone is not evidence of an audio failure.

**Why:** The capture checker rejected a complete soundtrack at its canonical end while waiting for the final recording-stop signal; all final review frames and footage had already been captured.

**How to apply:** Distinguish `ended` at the expected media time from an early pause or playback error. Continue waiting for the recording-stop signal; if recovering saved footage, independently verify the final hold and do not invent an observed stop signal. Reload also creates a fresh audio element whose metadata may briefly be unready despite successful preloading; allow only a bounded startup grace without excusing errors or blocked playback.