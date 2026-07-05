import "./only";

/**
 * Domain errors for the server API. Route handlers translate these into HTTP
 * responses via `toResponse` (see http.ts). Mirrors apps/api/app/services/errors.py.
 */

/** A carrier for an HTTP status + user-facing detail string. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** A Supabase / PostgREST call failed unexpectedly (→ 502). */
export class SupabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseError";
  }
}

/** A wallet adjustment would drive the balance below zero. */
export class InsufficientCreditsError extends Error {
  constructor(
    readonly balance: number,
    readonly needed: number,
  ) {
    super(`Insufficient credits: balance ${balance} cannot cover ${needed} credits.`);
    this.name = "InsufficientCreditsError";
  }
}

/** A real inference/analyst provider was selected but its config is missing. */
export class ProviderNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderNotConfiguredError";
  }
}
