/**
 * Seeded, deterministic RNG — the TypeScript analogue of Python's
 * `random.Random(seed_string)`.
 *
 * It does NOT reproduce CPython's Mersenne Twister byte-for-byte (nor does it
 * need to — no test asserts specific reaction values). What matters is that the
 * whole engine is internally deterministic: the same (seed, stimulus,
 * persona_count, market, category) always produces the same personas,
 * reactions, and report. That lets the SSE stream replay a completed run and
 * lets the same storm re-open identically.
 *
 * Implementation: a string is folded to a 32-bit seed (cyrb128-ish) and driven
 * through mulberry32. Gaussian sampling uses Box–Muller with a cached spare.
 * IMPORTANT: this module never calls Math.random() — every draw flows from the
 * seed, which is what makes it Vercel-serverless-safe and reproducible.
 */

function seedFromString(str: string): number {
  // FNV-1a 32-bit hash of the string → seed.
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  // Guarantee a non-zero seed.
  return (h || 0x9e3779b9) >>> 0;
}

export class RNG {
  private state: number;
  private spare: number | null = null;

  constructor(seed: string | number) {
    this.state = typeof seed === "number" ? seed >>> 0 || 0x9e3779b9 : seedFromString(seed);
  }

  /** mulberry32: uniform float in [0, 1). */
  random(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [lo, hi]. */
  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.random();
  }

  /** Integer in [lo, hi] inclusive (like Python's random.randint). */
  randint(lo: number, hi: number): number {
    return lo + Math.floor(this.random() * (hi - lo + 1));
  }

  /** One element of `arr`. */
  choice<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.random() * arr.length)];
  }

  /** k unique elements without replacement (partial Fisher–Yates). */
  sample<T>(arr: readonly T[], k: number): T[] {
    const n = arr.length;
    const kk = Math.min(k, n);
    const pool = arr.slice();
    for (let i = 0; i < kk; i++) {
      const j = i + Math.floor(this.random() * (n - i));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, kk);
  }

  /** In-place Fisher–Yates shuffle. */
  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }

  /** Gaussian sample with the given mean and standard deviation. */
  gauss(mean: number, std: number): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return mean + std * s;
    }
    // Box–Muller.
    let u1 = this.random();
    const u2 = this.random();
    if (u1 < 1e-12) u1 = 1e-12;
    const mag = Math.sqrt(-2.0 * Math.log(u1));
    const z0 = mag * Math.cos(2.0 * Math.PI * u2);
    const z1 = mag * Math.sin(2.0 * Math.PI * u2);
    this.spare = z1;
    return mean + std * z0;
  }
}
