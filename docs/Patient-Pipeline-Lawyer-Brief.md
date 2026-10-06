# Patient Pipeline: Customer Agreement Drafting Brief

Prepared October 6, 2026 | For the owner's lawyer

This is a factual drafting brief and decision checklist, not a customer agreement or legal advice. Have qualified counsel confirm the applicable laws and final language. Current software behavior and template defaults are not proof of approved business terms, enforceability, or regulatory compliance.

## 1. What we need from counsel

Please draft a NEW business-to-business software subscription agreement for Patient Pipeline, owned and operated by Beyond Healthcare LLC and purchased by healthcare practices for use by their own staff. This brief is not a proposed contract and does not ask you merely to approve the app's existing template. Deliver an editable Word master and a final PDF, with a reusable order form for customer-specific commercial terms.

Please also advise whether we need a separate Business Associate Agreement (BAA), data-processing/security addendum, privacy policy, acceptable-use policy, and electronic-signature/payment disclosures. Identify any operational changes required before the agreement can truthfully be used.

Please distinguish contractual protection from operational compliance. A disclaimer or customer indemnity cannot establish HIPAA compliance, cure unlawful outreach, or replace our own required safeguards.

## 2. Product and actual service scope

Patient Pipeline is a staff-led calling and follow-up platform for healthcare practices. Its two product functions are:

- Patient Reactivation: organizing outreach to inactive/past patients with guided scripts tailored to the service they previously received.
- Lead Follow-Up: organizing calls to new inquiries using scripts related to the campaign or offer that generated the inquiry.
- Supporting functions include contact/list import, follow-up queues and scheduling, recording call outcomes and notes, staff training content, and reporting. Confirm the purchased package and any feature limits on the order form.

The practice's staff make the calls and remain responsible for care, clinical judgment, and communications with patients. Do not describe Patient Pipeline as providing medical care, clinical diagnosis, a staffed call center, or autonomous AI calling.

The approved launch positioning offers Reactivation and Lead Follow-Up together. Numeric launch discounts, deadlines, and special pricing have not been established by that positioning; confirm actual offers.

Optional in-browser Twilio calling has been discussed, but must not be promised as an included, delivered feature without release verification. The selected proposed model is practice-owned Twilio accounts with usage billed directly by Twilio; initial scope is computers only and excludes call recording. Any extra Patient Pipeline fee remains undecided.

Confirm what onboarding, script customization, support, implementation, and training we actually commit to provide. Specify seat counts, number of locations, permitted affiliates, integrations, and any exclusions.

## Feature list: Patient Reactivation

Synopsis: a practice's staff work through past/inactive patient contacts using guided, service-specific conversations and a shared follow-up worklist. This is staff-workflow software, not a service that supplies callers or guarantees patients will return.

- Add individual contacts and import CSV patient/contact lists, with field mapping, validation, and duplicate handling.
- Organize contacts by service/niche and track their contact details, pipeline stage, notes, and call history.
- Build calling batches and see contacts due for follow-up.
- Open guided, branching scripts with contact/practice context and service-specific questions and objection handling.
- Record staff-selected outcomes, appointments and follow-up details; maintain a history of outreach.
- Schedule subsequent staff follow-up and manage the practice's shared worklist.
- Practice scripts in a training/practice environment and access video training courses.
- Review recorded calling activity and outcome reports by caller and service/niche.

The UI may use the word "dialer," but that does not establish an automatic phone dialer or integrated telephony. The workflow guides staff calls; the contract should not promise automatic calling.

## Feature list: Lead Follow-Up

Synopsis: a practice organizes incoming campaign inquiries and gives staff offer-specific scripts, due-call queues, and follow-up/appointment workflows, so inquiries do not depend on an individual's memory.

- Create and manage campaigns, including the service/niche, offer, and associated lead-follow-up script.
- Add/import leads and accept structured inbound lead submissions through campaign-specific connection/webhook endpoints.
- Provide connection instructions for GoHighLevel forms/workflows and Facebook/Instagram Instant Form leads routed through GoHighLevel or a connector such as Zapier/Make.
- Show shared queues for Ready to Call, In Progress, Calls Upcoming, and All Leads, with prior activity and next due times.
- Guide staff through branching, campaign/offer-specific conversations and objection handling.
- Log calls and outcomes; schedule retries, requested callbacks, and longer-term follow-up.
- Support appointment-intent, booking-outcome, and confirmation/reschedule workflows using recorded information. Do not promise universal two-way synchronization with an external scheduling/EHR system.
- Provide practice mode and lead-follow-up training.
- Report lead activity, booking outcomes and caller performance; keep confirmation work distinct from new-booking results.

Automatic queue scheduling is not automatic calling. Logged bookings and outcomes are not independent proof of attendance, clinical results, or collected revenue. External connectors require customer setup and may have separate service fees.

## Shared portal and account features

- Separate owner/staff access and administrator management, with product access and staff-seat controls.
- Customer billing views, payment-card management, payment history, remaining-payment information, and end-of-term/billing-period cancellation scheduling.
- Administrative customer/payment-link management, agreement preparation/signing records, subscription management, refunds, and payment-retry tools.
- Electronic signatures, section initials, versioned agreement text, signed snapshots, completion certificates, and signed-copy PDFs.
- Private video training access, course organization, and training/activity reporting.

Features above describe implemented software surfaces; purchased access, permissions and configuration can vary. They are not uptime, security-certification, integration-compatibility, or performance guarantees. No independent end-to-end audit of every feature was conducted for this brief.

## Technology stack and third-party services

- Frontend: React 19 with TypeScript, Vite, Wouter routing, Tailwind CSS, Base UI/Radix UI component primitives, React Hook Form, Zod validation, Recharts reporting charts, and Framer Motion.
- Backend: Node.js with TypeScript and Express 5; shared types/API schemas, Zod validation, Pino logging, and application-specific RPC/REST/webhook endpoints.
- Data/authentication: Supabase authentication and PostgreSQL, accessed through the Supabase JavaScript client and Drizzle ORM. The application uses its existing Supabase database; do not describe it as migrated to a Replit-managed database.
- Payments: Stripe subscriptions, payment methods and checkout components, with server-side payment processing and webhook handling.
- Email: Resend for transactional application email. GoHighLevel is separately used for website sales inquiries/appointments and relevant configured lead-intake connections.
- Media/files: Vercel Blob for existing protected training-media storage/streaming; fixed public marketing videos are served as MP4 assets with the frontend. File-storage architecture must be reviewed by actual data type rather than assumed to contain patient records.
- Agreement PDFs: PDFKit. Electronic-signature consent, versioning and audit records are implemented by the application; there is no assumed DocuSign contract or certification.
- Workspace/build/hosting: Replit environment, a pnpm monorepo, TypeScript builds and Vite; test tooling includes Vitest and React Testing Library. Build/test tools are not automatically patient-data processors.
- Optional connections: GoHighLevel webhooks, Zapier/Make or another compatible customer-configured connector for structured lead intake. These are not guaranteed native integrations with every CRM/EHR.
- Proposed only: Twilio browser calling. No integrated telephony or AI-provider service is promised in the present agreement scope.

Have the technical team map which vendors receive which categories of data and verify actual production deployment, regions, service plans and contracts. This list does not establish vendor HIPAA eligibility, BAAs, security certifications, data residency or ongoing software-version commitments.

## 3. Identify the correct contracting parties

Confirmed by the owner: Beyond Healthcare LLC owns and operates Patient Pipeline. Patient Pipeline is the product/customer-facing brand; do not substitute Reactivation Power as the legal company. The template's company identity and product branding have been corrected for new agreements. Confirm the LLC's state of formation, business address, authorized signatory, and legal-notice contact. Do not assume Patient Pipeline is a registered DBA.

For the customer, obtain its practice legal name and address, locations covered, authorized signatory, and billing/notice contact. Counsel should decide whether an owner guarantee is desired; collecting the owner's name is not itself a personal guarantee.

Confirm where customers will be sold the service, including U.S. states and any foreign markets. Select governing law, venue, and dispute-resolution provisions accordingly.

## 4. Commercial terms: confirm before drafting

The current agreement-generation defaults are:

- Initial term: 12 months.
- Monthly fee: $475.
- Setup fee: $475, editable or waivable for a particular agreement.
- Delay before recurring monthly billing: 30 days from setup-payment activation.
- Separate advance cancellation notice in the updated default template: none (0 days); cancellation takes effect at the applicable term/billing-period end.
- Template account scope: an owner account and up to five staff accounts.

These are SOFTWARE DEFAULTS, not confirmed current pricing, universal customer terms, or proof of live subscriptions. Customer-specific terms can differ. The owner must approve the final commercial schedule.

Clarify whether access during the initial 30 days is a free trial, included onboarding period, or another arrangement; the existing template describes access after signing/setup payment and monthly fees starting later. Do not market it as a cancellable free trial unless that is actually intended and implemented.

Decide: activation/start date when setup is waived; whether the term includes or follows the initial period; precise first and final installment dates; taxes; prorations; fee changes; late fees if any; refunds; failed payments; cure periods; suspension; and any early-termination rights or remaining-fee obligation.

If setup is paid at checkout rather than at signature, use that actual charging event in the agreement. Signing, payment, activation, and recurring-billing commencement are separate events.

## 5. Renewals, cancellation, and payment authorization

The updated default template describes a fixed initial term followed by month-to-month renewal. Customer portal cancellation counts as notice, without an additional advance-notice window or required cancellation letter. During the fixed term, cancellation is scheduled for the term end and remaining installments stay due; early termination requires mutual written agreement except as required by law. During month-to-month renewal, cancellation is effective at the current billing-period end. Counsel must draft the new agreement's rules and assess enforceability, required renewal disclosures/reminders, cancellation methods, and applicable state subscription rules.

The portal already uses those effective dates and asks the owner to acknowledge remaining payments. The standard template and zero-day summary have now been aligned with that implementation; prices, initial term lengths and Stripe cancellation behavior were not changed. Previously signed or individually customized agreements were not rewritten and may contain different terms. Counsel should address any transition or legacy obligations explicitly; a software-template change does not amend an existing contract.

Administrative tools can issue full/partial refunds and cancel immediately or at a term/billing-period end. The agreement should distinguish discretionary exceptions, termination for breach, and customer cancellation rights. Define the effect of suspension and cancellation on access, outstanding fees, refunds, and data.

Stripe processes cards. The current template contemplates primary and backup cards, recurring/off-session charges, and backup-card retries following failure. Counsel should approve clear authorization for the amounts and permitted charging/retry behavior, revocation/update procedures, and payment records. Confirm the actual checkout requirements before describing two cards as universally mandatory.

Do not collect or put payment card numbers into the agreement. Distinguish raw card details held by Stripe from limited billing metadata held by the app.

## 6. Patient data, HIPAA, and security: a priority review

The app can handle identifying contact details, practice association, past-service information, outreach outcomes/notes, appointment/follow-up information, and lead source/campaign data. Counsel should confirm a complete data inventory with the technical team. A past-patient list or a person's association with a healthcare service may be protected information even without a medical chart.

Determine when customers are covered entities, whether we act as a business associate or another regulated service provider, and which separate privacy regimes apply to leads, non-covered practices, or consumer health data.

If a BAA is required, determine both customer-facing and downstream/subcontractor agreements, the covered services, plan eligibility, and actual technical safeguards. Do not assert that Patient Pipeline or its vendor chain is HIPAA-compliant simply because a BAA form exists.

Vendor/services to assess include Supabase (authentication/database), Replit (hosting/development environment), Stripe (payments), Resend (transactional email), Vercel Blob (private training-media storage), and GoHighLevel (website sales inquiries/appointments and relevant customer lead integrations). Twilio is a proposed optional calling service, not an assumed current processor. Map actual data flows: not every vendor necessarily receives patient information.

Ask the technical team for actual facts about access controls, tenant separation, encryption, backups, logging, support/admin access, incident handling, vendor contracts, and storage regions. We have not performed a compliance/security audit for this brief.

Specify data ownership and limited service-use rights; authorized users; permitted/prohibited uploaded content; customer instructions; access/correction/export assistance; retention and backup deletion; incident notification/cooperation; and post-termination retrieval/deletion. Mark unconfirmed safeguards and deadlines as decisions, not promises.

Any analytics or AI use should be specifically verified. Do not authorize advertising reuse, model training, or sale of patient data by assumption. Avoid patient data in tracking events, ordinary marketing emails, shared screenshots, and support materials.

## 7. Outreach and healthcare marketing

Please review federal/state calling, texting, email, do-not-call, consent, revocation, timing, and healthcare-marketing rules for the actual outreach methods. Distinguish past-patient reactivation from new campaign leads, manual staff calls from any future automated features, and treatment-related communications from marketing.

An existing patient relationship, a purchased lead list, or a submitted inquiry should not be treated as blanket permission for every channel or campaign. Allocate responsibility for lawful collection/use of lists, consent evidence, opt-outs, script approval, suppression, and staff conduct without purporting to eliminate our own obligations.

The updated standard template now covers both past-patient reactivation and lawful new-inquiry follow-up, rather than restricting all contacts to an existing customer relationship. Counsel should independently draft appropriate consent, permitted-use and responsibility provisions for the new agreement.

The app does not promise appointments, revenue, a particular conversion rate, reimbursement outcomes, or clinical results. Counsel should review sales materials for statements that could contradict that limitation. Do not include or promise call recording in the present scope.

## 8. Other provisions counsel should settle

- License to the software, scripts, and training; customer ownership of uploaded data; restrictions on account sharing, resale, copying, scraping, and unlawful use.
- Confidentiality and appropriate access by staff and support personnel.
- Support scope, maintenance, outages, third-party dependencies, and any genuinely supported availability commitment.
- Warranties/disclaimers, limitation of liability, insurance requirements, and appropriately scoped indemnities. The old template uses a three-month-fees liability cap; counsel should choose the intended cap and exceptions, not treat that default as approved.
- Termination for breach, notice/cure rights, suspension for risk or nonpayment, remedies, and fees/data treatment after each type of termination.
- Contract hierarchy between the order form, service agreement, BAA, and other addenda; amendments; material-change notices; assignment; notices; dispute resolution; and governing law.

## 9. Electronic signing and app integration

The existing signing workflow supports customer-specific terms, section initials, typed/drawn signatures, electronic-signature consent, a saved signed document snapshot, and audit evidence including timestamps, IP address, and browser information. These features do not themselves prove legal sufficiency; counsel should review signatory authority, disclosures, acceptance, records, and applicable e-sign laws.

Edits to unsigned terms invalidate affected prior acceptance; signed versions must remain historically intact. The signed-copy email is currently sent on subscription activation/completion, rather than immediately upon signature. Counsel should decide whether the signed copy must be provided earlier and specify any required implementation change.

Ask counsel for a clean master organized in headings and paragraphs suitable for the existing signing page. Identify which sections require initials, which fields vary by customer, and whether a countersignature is required. Do not expect the app to preserve arbitrary Word tables or special layout without integration work.

Existing merge fields: full_name, business_name, business_address, phone, owner_name, owner_phone, email, term_months, monthly_amount, setup_fee, start_date, end_date, notice_days, trial_days, company_name, company_email, agreement_date.

Do not replace historical signed agreements with the new master. Decide separately how existing customers consent to any changes.

## 10. Owner's information to send with this brief

- Legal entity/DBA details, business and notice addresses, authorized signer, and chosen counsel/jurisdiction.
- Approved pricing, setup charges, term/renewal structure, cancellation/refund policy, seats/locations, support scope, and launch offer.
- Representative blank checkout/signing screens, payment flow, and customer-facing sales promises. The existing internal template can be supplied separately as reference, but is not a proposed contract or included as the lawyer's drafting starting point here.
- Intended customer types and markets, vendor/service inventory, existing vendor contracts/BAAs if any, and verified security/retention facts.
- Decisions on PHI acceptance, optional calling availability, insurance, guarantees, and handling existing customers.

Use blank or sanitized examples; do not send real patient lists, production credentials, card numbers, or unrelated customer records.

## 11. Requested deliverables and approval

Please return: (1) editable master agreement and order form; (2) final approved PDF; (3) required BAA/DPA and related policies/disclosures; (4) a short list of unresolved owner decisions; and (5) a list of software/operational changes required for the legal documents to match reality.

Approve the legal text and any required implementation changes together before sending the new agreement to customers. This brief does not alter any live agreement, billing terms, or customer records.

