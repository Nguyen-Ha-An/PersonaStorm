import type { Config } from "tailwindcss";

// Wind-tunnel palette v2 — "premium research instrument".
// storm-*  = neutral ink+surface ramp (950 darkest surface → 100 near-white text)
// signal-* = semantic accents; ALSO referenced as raw hex/rgb() by chart code,
//            so any change here MUST be mirrored in the chart files listed in §2.3.
// surface/line/ink/accent = semantic aliases for NEW components (same hexes).
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        storm: {
          950: "#0B0E14", // page base (surface-base)
          900: "#10141C", // panel / elevated surface
          850: "#151A23", // card / raised tile / input surface
          800: "#1C212B", // hairline border (subtle)
          750: "#232A35", // hover border / stronger divider
          700: "#2A313D", // card border (strong)
          600: "#39414F", // outline / button border
          500: "#5A6478", // mid / disabled text
          400: "#6F7A8E", // muted / hint text
          300: "#A7B0C0", // secondary text
          200: "#C9D0DB", // body text
          100: "#F4F7FA", // headings / near-white
        },
        signal: {
          green: "#4CC38A", // adoption / success
          yellow: "#D6A84F", // risk / attention (amber)
          red: "#EF6A7A", // blocker / failure
          cyan: "#35C7D9", // primary accent (sparingly)
          violet: "#8B7CF6", // insight / AI-derived
        },
        // Semantic aliases for new components (identical hexes; use freely).
        surface: {
          base: "#0B0E14",
          panel: "#10141C",
          card: "#151A23",
          subtle: "#0F141C",
        },
        line: {
          subtle: "rgba(255,255,255,0.08)",
          strong: "rgba(255,255,255,0.14)",
        },
        ink: {
          primary: "#F4F7FA",
          secondary: "#A7B0C0",
          muted: "#6F7A8E",
        },
        accent: {
          primary: "#35C7D9",
          insight: "#8B7CF6",
          risk: "#D6A84F",
          success: "#4CC38A",
          danger: "#EF6A7A",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "InterVariable",
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "SF Mono",
          "JetBrains Mono",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        lg: "0.625rem",
        xl: "0.875rem",
        "2xl": "1rem",
      },
      boxShadow: {
        // Softer, more premium than the old neon set. No colored glows by default.
        card: "0 1px 0 0 rgba(255,255,255,0.02) inset, 0 1px 2px 0 rgba(0,0,0,0.4)",
        "card-hover":
          "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 28px -14px rgba(0,0,0,0.7)",
        panel: "0 12px 40px -20px rgba(0,0,0,0.8)",
        accent: "0 6px 20px -12px rgba(53,199,217,0.30)",
      },
      keyframes: {
        cellpop: {
          "0%": { transform: "scale(0.4)", opacity: "0.3" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        pulseglow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        cellpop: "cellpop 0.3s ease-out",
        pulseglow: "pulseglow 2s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
        "fade-up": "fade-up 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};
export default config;
