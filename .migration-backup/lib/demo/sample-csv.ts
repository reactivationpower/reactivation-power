/**
 * The one-click sample export for the demo account's Upload Contacts dialog.
 *
 * Deliberate design:
 * - Realistic "EHR export" headers, including columns we ignore (Account #,
 *   Last Appt) so the auto-detection has something to show off.
 * - A Niche column mixing the four enabled demo niches, plus TWO rows tagged
 *   "Massage Therapy" — a real niche that is NOT enabled on the demo account,
 *   which triggers the red "not turned on for this account" warning so the
 *   presenter can explain how entitlements work. (User confirmed 9/4/2026
 *   he wants this warning to appear during the demo — do not "fix" it.)
 * - Two rows share a phone with an existing seeded patient so the dedupe
 *   count is non-zero.
 * - Names are distinct from the 100 seeded patients.
 *
 * Nothing here is ever written: importContacts short-circuits for is_demo.
 */
export const DEMO_SAMPLE_CSV = `Account #,Patient Last Name,Patient First Name,Mobile Phone,Email Address,Niche,Chief Complaint,Last Appt Date
10421,Alderson,Gwen,(303) 555-0142,gwen.alderson@example.com,Chiropractic,Lower back pain,03/14/2025
10433,Brightwater,Neil,(303) 555-0187,neil.b@example.com,Decompression,Sciatica,01/22/2025
10440,Castellanos,Rosa,(720) 555-0113,rosa.castellanos@example.com,Joint Pain,Right knee pain,11/05/2024
10457,Dwyer,Colin,(303) 555-0165,colin.dwyer@example.com,ChiroThin,Weight management,02/10/2025
10462,Ekwueme,Adaeze,(720) 555-0198,adaeze.e@example.com,Chiropractic,Neck stiffness,04/02/2025
10478,Fontaine,Marc,(303) 555-0129,marc.fontaine@example.com,Decompression,Herniated disc L4-L5,12/18/2024
10481,Gallagher,Sheila,(720) 555-0176,sheila.g@example.com,Massage Therapy,Shoulder tension,03/28/2025
10495,Hutchins,Dale,(303) 555-0151,dale.hutchins@example.com,Joint Pain,Hip pain,10/09/2024
10502,Iqbal,Farah,(720) 555-0134,farah.iqbal@example.com,Chiropractic,Headaches,02/25/2025
10517,Jankowski,Peter,(303) 555-0108,peter.j@example.com,ChiroThin,Weight management,01/07/2025
10523,Kirkland,Maureen,(720) 555-0182,maureen.k@example.com,Decompression,Numbness in legs,11/30/2024
10538,Lindstrom,Erik,(303) 555-0147,erik.lindstrom@example.com,Chiropractic,Mid-back pain,03/03/2025
10544,Moreau,Celeste,(720) 555-0119,celeste.moreau@example.com,Massage Therapy,Stress and tension,04/11/2025
10559,Nwosu,Chidi,(303) 555-0193,chidi.nwosu@example.com,Joint Pain,Left shoulder pain,09/21/2024
10566,Oakes,Trevor,(720) 555-0156,trevor.oakes@example.com,Chiropractic,Lower back pain,02/14/2025
10571,Pellegrino,Dana,(303) 555-0171,dana.p@example.com,ChiroThin,Weight management,12/02/2024
10589,Quezada,Luis,(720) 555-0124,luis.quezada@example.com,Decompression,Sciatica,01/16/2025
10594,Rasmussen,Ingrid,(303) 555-0138,ingrid.r@example.com,Joint Pain,Knee pain both sides,10/27/2024
10608,Sethi,Priya,(720) 555-0162,priya.sethi@example.com,Chiropractic,Neck pain after accident,03/19/2025
10615,Thackeray,Owen,(303) 555-0185,owen.t@example.com,Decompression,Bulging disc,11/14/2024
10622,Ulrich,Hannah,(720) 555-0109,hannah.ulrich@example.com,Chiropractic,Lower back pain,04/05/2025
10637,Vance,Gordon,(303) 555-0154,gordon.vance@example.com,Joint Pain,Hip and knee pain,09/08/2024
10649,Whitcombe,Elaine,(720) 555-0141,elaine.w@example.com,ChiroThin,Weight management,02/03/2025
10655,Ybarra,Tomas,(303) 555-0177,tomas.ybarra@example.com,Chiropractic,Headaches and neck pain,03/25/2025
`
