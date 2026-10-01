import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { lessons, voice, sources } from "./lessons.mjs";
const root = process.cwd();
const slug = process.argv[2] || lessons[0].slug;
const lesson = structuredClone(lessons.find((l) => l.slug === slug));
if (!lesson) throw Error(`Unknown lesson ${slug}`);
const dir = path.join(root, "artifacts", slug);
if (!fs.existsSync(path.join(dir, "package.json"))) throw Error("Create the artifact before preparing its film");
for (const p of ["public/images", "public/audio", "src/components/video"]) fs.mkdirSync(path.join(dir, p), { recursive: true });
const original = path.join(root, "artifacts/patient-pipeline-first-campaign/public");
for (const file of fs.readdirSync(path.join(original, "images")).filter((f) => f.endsWith(".png"))) {
  fs.copyFileSync(path.join(original, "images", file), path.join(dir, "public/images", file));
}
let elapsed = 0;
for (const scene of lesson.scenes) {
  scene.audioId = crypto.createHash("sha256").update(scene.narration).digest("hex").slice(0, 12);
  scene.voiceMs = scene.narration.split(/\s+/).length / 2.05 * 1000;
  scene.durationMs = Math.ceil((scene.voiceMs + 3150) / 500) * 500;
  scene.startMs = elapsed;
  elapsed += scene.durationMs;
}
lesson.durationMs = elapsed;
lesson.voice = voice;
lesson.sources = sources;
lesson.illustrated = true;
fs.writeFileSync(path.join(dir, "src/components/video/lesson.json"), JSON.stringify(lesson, null, 2));
const header = `# Patient Pipeline — ${lesson.title}\n\n## Director's treatment\n\n16:9 landscape, matching the approved first-campaign film. Navy #092a3b, cream #f8f5ed, teal #69d7ca; DM Sans and Space Grotesk; existing official Patient Pipeline logo. Sarah / eleven_v3 / stability 0.5 / similarity 0.75 / speed 0.96, uncompressed breathing and sentence endings. Reuse the existing restrained music bed at low volume. Full tutorial length is intentional: the user's complete beginner walkthrough takes precedence over short-ad pacing.\n\nThe hero is the working interface: original Patient Pipeline demo screens where available, with example-entry overlays; outside-service panels are explicitly labeled instructional recreations throughout. No live external test, account change, or verified delivery is claimed. Private destinations are nonfunctional explanatory placeholders. A recurring animated cursor moves to actual rendered control bounds, clicks with the approved teal pulse, and fields visibly type or paste. Opening and closing use the existing navy/cream branded treatment. Clean interface continuity rather than distracting cinematic transitions.\n\nThe numeric beat positions below are fractions of each uncut narration take, measured after generation. Lead-in 650 ms. A checkpoint holds after speech. Final measured timings and narration live in lesson.json and TIMING.md. These estimated timings are the preproduction plan, not a claim that audio has already been generated.\n\n## Variety and coverage review\n\nEach action develops the screen through navigation, dropdown selection, typed values, paste or saved-state instruction. Wide interface frames preserve orientation; focused field closeups keep small entries readable. Branded opening and readiness ending differ from the interface chapters. Do not create blank transitions or fabricated success states. Patient Pipeline example text is illustrated; test status remains waiting and status definitions are not an invented receipt log.\n\n`;
const shots = lesson.scenes.map((s, i) => `## ${i + 1}. ${s.title}\n\nEstimated ${Math.round(s.startMs / 1000)}–${Math.round((s.startMs + s.durationMs) / 1000)} seconds. Purpose: ${s.page}.\n\n**Narration:** ${s.narration}\n\n**Composition:** ${s.app === "guide" ? "Cream/navy brand card with three-tab orientation and sequential focus." : `Recognizable ${s.app} workspace, full navigation context, large illustrated control panel; ${s.image ? `original demo still ${s.image} as background with readable example overlays` : "instructional UI recreation"}, stable browser tabs.`} Header title: “${s.title}”. Page label: “${s.page}”.\n\n**Exact field text:** ${s.fields.map(f => `${f.label}: ${f.value || "(button)"}`).join("; ")}.\n\n**Choreography:** ${s.actions.length ? s.actions.map(a => `${Math.round(a.at * 100)}% of speech: move cursor to “${a.target}”, click, ${a.typing ? "type character by character" : "select/paste/reveal"} “${a.result}”`).join("; ") : "Reveal route and purpose in sequence during narration."} End on readable checkpoint: “${s.checkpoint}”.\n\n**Handoff:** Keep brand header/browser framing; next scene replaces contents in a short opacity/scale settle. No blank frame. Final scene returns to branded opening on preview loop.\n\n**Sound:** Same approved Sarah voice and speed; original instrumental quietly underneath. No automatic phone sound, fake success chime, or simulated recorded response.\n`).join("\n");
fs.writeFileSync(path.join(dir, "SCRIPT.md"), header + shots + "\n## Official sources\n\n" + sources.map(s => `- ${s}`).join("\n") + "\n");
fs.writeFileSync(path.join(dir, "public/images/asset-inventory.txt"), "Original Patient Pipeline stills and logo copied from patient-pipeline-first-campaign. Prior capture provenance is retained there; these stills do not demonstrate this lesson's external connection. All overlays are example entries. External UIs are instructional recreations based on sources in SCRIPT.md. No real credentials, private tokens, or patient details added.\n");
console.log(JSON.stringify({ slug, scenes: lesson.scenes.length, estimatedSeconds: elapsed / 1000, voice }));