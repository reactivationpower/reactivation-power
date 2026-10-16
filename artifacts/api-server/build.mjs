import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { rm, mkdir, copyFile } from "node:fs/promises";
import { bundleOptions } from "./esbuild.config.mjs";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

const PUBLIC_VIDEO_FILES = [
  "patient-pipeline-introduction.mp4",
  "patient-pipeline-walkthrough.mp4",
  "patient-pipeline-walkthrough-preview.mp4",
];

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });
  // Replit streams the public marketing videos through the API, so package only
  // the explicitly public ones, independently of the web build. On Vercel the
  // CDN serves the same files from the web build's /videos/ and the function
  // redirects there, so the 58 MB of video stays out of the function bundle.
  if (!process.env.VERCEL) {
    const videoDir = path.join(distDir, "public-videos");
    await mkdir(videoDir, { recursive: true });
    for (const name of PUBLIC_VIDEO_FILES) {
      await copyFile(path.resolve(artifactDir, "../reactivation-power/public/videos", name), path.join(videoDir, name));
    }
  }

  await esbuild({
    ...bundleOptions(),
    // index: Replit server (app.listen). vercel: Vercel function wrapper used by
    // /api/index.mjs at the repo root. seed-super-admin: explicit one-off setup.
    entryPoints: ["index", "vercel", "seed-super-admin"].map((name) => path.resolve(artifactDir, `src/${name}.ts`)),
    outdir: distDir,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
