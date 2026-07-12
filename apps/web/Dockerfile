# --- build stage --------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm install --no-audit --no-fund

COPY apps/web .
# Only NEXT_PUBLIC_* is baked into the browser bundle at build time (the anon
# key is safe to expose — it cannot bypass RLS). Server-side secrets
# (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, FIREWORKS_API_KEY,
# NVIDIA_API_KEY) are read at request time by the API Route Handlers and are
# provided at `docker run` time, never baked into the image.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build

# --- runtime stage -------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Server-side env (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET,
# INFERENCE_PROVIDER, NVIDIA_API_KEY, …) is supplied at `docker run` time or via
# docker-compose — never baked into the image.

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
