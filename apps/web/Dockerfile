# --- build stage --------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY apps/web .
# NEXT_PUBLIC_* is baked into the browser bundle at build time. The backend
# address is NOT one of these anymore — BACKEND_API_BASE is read server-side,
# at request time, by the /api/backend proxy route, so it belongs in the
# runtime stage's environment (or `docker run -e`), not here.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# --- runtime stage -------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Server-only: where the proxy route forwards storm/billing/admin calls.
# Set at `docker run` time (e.g. -e BACKEND_API_BASE=http://api:8000) — never
# baked into the image, so the same image works against any backend.
ENV BACKEND_API_BASE=

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
