import { Router, type IRouter, type Request, type Response } from "express";
import { accessOwnerId, getCurrentParticipant } from "@/lib/data/participants";
import { getOwnerNiches } from "@/lib/data/reactivation";
import { getOwnerSectors } from "@/lib/data/courses";
import { suggestNicheForService } from "@/lib/niche-match";
import { runWithRequestContext } from "@/lib/request-context";
import { isRedirectSignal } from "@/shims/next-navigation";

const router: IRouter = Router();

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
function csvRow(cells: string[]): string {
  return cells.map(csvCell).join(",");
}

const NICHE_SAMPLES: Record<string, { service: string; complaint: string }> = {
  Chiropractic: { service: "Adjustment", complaint: "Lower back pain" },
  Decompression: { service: "Spinal Decompression", complaint: "Herniated disc L4-L5" },
  Neuropathy: { service: "Neuropathy Treatment", complaint: "Numbness in both feet" },
  "Joint Pain": { service: "Knee Injection", complaint: "Right knee pain" },
  "Acoustic Wave Therapy": { service: "Softwave", complaint: "Plantar fasciitis" },
  Acupuncture: { service: "Acupuncture", complaint: "Migraines" },
  "Massage Therapy": { service: "60 min Massage", complaint: "Neck and shoulder tension" },
  "Gut Health": { service: "Gut Health Program", complaint: "Bloating and IBS" },
  ChiroThin: { service: "ChiroThin", complaint: "" },
  "Weight Loss (Not ChiroThin)": { service: "Weight Loss Program", complaint: "" },
  "GLP Patients": { service: "Semaglutide", complaint: "" },
  "Skin Tightening": { service: "RF Skin Tightening", complaint: "" },
  "Cellulite Reduction": { service: "Cellulite Treatment", complaint: "" },
  "Red Light / Body Contouring": { service: "Red Light Therapy", complaint: "" },
  "Laser Hair Removal": { service: "Laser Hair Removal", complaint: "" },
  "Body Waxing": { service: "Brazilian Wax", complaint: "" },
  Botox: { service: "Botox 40u", complaint: "" },
  Fillers: { service: "Lip Filler 1 syringe", complaint: "" },
  "IPL / Photofacial": { service: "IPL Photofacial", complaint: "" },
  "Microneedling / RF Microneedling": { service: "RF Microneedling", complaint: "" },
  "Laser Resurfacing": { service: "Laser Resurfacing", complaint: "" },
  "Acne / Acne Scarring": { service: "Acne Treatment", complaint: "" },
  "Pigmentation / Sun Damage": { service: "Pigmentation Treatment", complaint: "" },
  "Rosacea / Redness": { service: "Rosacea Treatment", complaint: "" },
  "Chemical Peels": { service: "Chemical Peel", complaint: "" },
  "Facials / HydraFacial": { service: "HydraFacial", complaint: "" },
  "Medical-Grade Skincare": { service: "Skincare Consult", complaint: "" },
  "Teeth Whitening": { service: "Zoom Whitening", complaint: "" },
  "Clear Aligners": { service: "Invisalign Consult", complaint: "" },
  "Orthodontics / Braces": { service: "Braces Consult", complaint: "" },
  "Dental Implants": { service: "Implant Consult", complaint: "Missing molar" },
  HVAC: { service: "AC Tune-Up", complaint: "" },
  Plumbing: { service: "Water Heater Service", complaint: "" },
};

const PEOPLE = [
  ["Maria", "Gonzalez", "Prefers mornings"], ["James", "Whitaker", ""],
  ["Priya", "Natarajan", "Ask about her daughter"], ["Robert", "Chen", ""],
  ["Angela", "Brooks", "Moved last spring, still local"], ["Marcus", "Reed", ""],
  ["Linda", "Okafor", "Call after 3pm"], ["Daniel", "Kim", ""],
  ["Susan", "Alvarez", "Referred by her sister"], ["Thomas", "Nguyen", ""],
  ["Karen", "Fitzgerald", ""], ["Miguel", "Santos", "Works nights"],
  ["Rachel", "Adler", ""], ["Kevin", "Patel", ""],
  ["Denise", "Harmon", "Leave voicemail OK"], ["Anthony", "Rossi", ""],
  ["Jessica", "Thornton", ""], ["Brian", "Delgado", ""],
  ["Patricia", "Lindqvist", "Snowbird — back in October"], ["George", "Abara", ""],
  ["Heather", "Moss", ""], ["Samuel", "Ortiz", ""], ["Nicole", "Bergman", ""],
] as const;

function samplePhone(i: number): string {
  const areas = ["407", "813", "561", "904", "727", "321", "941", "850"];
  return `(${areas[i % 8]}) 555-${String(100 + ((i * 37) % 900)).padStart(4, "0")}`;
}
function sampleEmail(first: string, last: string): string {
  return `${first}.${last}@example.com`.toLowerCase().replace(/[^a-z0-9.@]/g, "");
}

router.get("/templates/contacts", async (req: Request, res: Response) => {
  await runWithRequestContext(req, res, async () => {
    // A billing-blocked account redirects; for a file download that is a 401.
    const participant = await getCurrentParticipant().catch((err) => {
      if (isRedirectSignal(err)) return null;
      throw err;
    });
    if (!participant) {
      res.status(401).send("Not signed in");
      return;
    }
    const variant = req.query.variant === "services" ? "services" : "niche";
    const ownerId = accessOwnerId(participant);
    const sectors = await getOwnerSectors(ownerId);
    const niches = await getOwnerNiches(ownerId, sectors);
    const headers = variant === "niche"
      ? ["First Name", "Last Name", "Phone", "Email", "Niche", "Last Service", "Previously Treated For", "Notes"]
      : ["First Name", "Last Name", "Phone", "Email", "Last Service", "Previously Treated For", "Notes"];
    const lines = [csvRow(headers)];
    niches.forEach((niche, i) => {
      const person = PEOPLE[i % PEOPLE.length];
      const sample = NICHE_SAMPLES[niche.name];
      let service = sample?.service ?? niche.name;
      if (variant === "services") {
        const hit = suggestNicheForService(service, niches);
        if (!hit || hit.id !== niche.id) service = niche.name;
      }
      const cells = [person[0], person[1], samplePhone(i), sampleEmail(person[0], person[1])];
      if (variant === "niche") cells.push(niche.name);
      cells.push(service, sample?.complaint ?? "", person[2]);
      lines.push(csvRow(cells));
    });
    const filename = variant === "niche"
      ? "reactivation-power-demo-with-niche.csv"
      : "reactivation-power-demo-services-only.csv";
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    }).send(`${lines.join("\r\n")}\r\n`);
  });
});

export default router;
