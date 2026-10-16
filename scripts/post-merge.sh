#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Supabase is shared with production: apply only reviewed migrations, never
# synchronize the whole schema with drizzle-kit push.
pnpm --filter @workspace/db run migrate
