// Vercel function for everything under /api (see vercel.json rewrites).
// The Express app is bundled by `pnpm --filter @workspace/api-server run build`
// during the Vercel build; this file only re-exports that bundle's handler.
export { default } from "../artifacts/api-server/dist/vercel.mjs";
