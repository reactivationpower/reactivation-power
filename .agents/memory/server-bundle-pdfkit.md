---
name: Server bundle and pdfkit
description: Why pdfkit is bundled with a font-loader rewrite and why @swc/helpers must not be external.
---
pdfkit is bundled into the server (not external) and its private `#standard-fonts/*` requires are rewritten by an esbuild onLoad plugin to the public `pdfkit/standard-fonts/*` export so font metrics are inlined.

**Why:** With pdfkit external, a Vercel function has no node_modules beside the bundle; with it bundled but unpatched, Node fails at render time with "Cannot find module '#standard-fonts/Helvetica'" because the loader uses `createRequire(import.meta.url)`.

**How to apply:** Keep the plugin in the shared esbuild config and keep the bundling test that renders a PDF from a freshly built bundle. Do not re-add `@swc/*` as an external glob: fontkit (pulled in by pdfkit) imports the plain-JS `@swc/helpers`, which is not resolvable from the artifact's node_modules under pnpm; only `@swc/core` may be external.
