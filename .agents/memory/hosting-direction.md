---
name: Development and hosting direction
description: Keep Replit for development while targeting Vercel for production hosting.
---
The user wants to continue building in Replit and publish/host the application on Vercel.

**Why:** The user explicitly clarified that changing production hosting is not a move away from Replit development.

**How to apply:** Preserve Replit development and preview workflows while preparing Vercel-compatible production builds and GitHub delivery. Do not treat this direction as authorization to switch DNS or publish. Keep development/preview side effects isolated from production.

The domain switch is deferred until after Vercel preparation and testing.

**Why:** The user explicitly agreed to do the domain transfer afterward.

**How to apply:** Keep the live domain and existing hosting unchanged during preparation. Moving the domain's hosting/DNS is a separate later approval, not a registrar transfer requirement.

The user chose to keep the Vite SPA + Express API as they are on Vercel, not rewrite to Next.js (Oct 2026).

**Why:** the user picked "keep the app as is and run it on Vercel" when asked.

**How to apply:** Do not propose a Next.js rewrite for hosting. Vercel Preview shares the production database, so every new job, worker, outbound message or payment path must go through the shared Preview-safety check and must not claim production queue rows from Preview.
