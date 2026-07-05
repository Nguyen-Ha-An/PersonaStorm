/**
 * Server-only guard.
 *
 * We deliberately avoid the `server-only` npm package (an extra dependency /
 * lockfile churn) and use this lightweight guard instead. Any module that
 * touches SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, or NVIDIA_API_KEY
 * imports this first. If such a module is ever bundled into a Client Component,
 * this throws in the browser instead of silently shipping.
 *
 * Note: Next.js already strips every non-`NEXT_PUBLIC_` env var from the client
 * bundle, so the secrets themselves can never reach the browser regardless —
 * this is defense in depth plus a loud failure signal during development.
 */
if (typeof window !== "undefined") {
  throw new Error(
    "A PersonaStorm server-only module was imported into client code. " +
      "Modules under lib/server/* may only be used from Route Handlers.",
  );
}

export {};
