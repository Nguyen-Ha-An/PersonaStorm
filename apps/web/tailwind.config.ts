import type { Config } from "tailwindcss";

// Wind-tunnel palette: deep slate-blues for surfaces, instrument-panel signal
// colors for verdicts. Signal hexes are intentionally stable — several charts
// reference them as raw rgb() strings — so tuning happens in the `storm` ramp
// (surfaces / borders / text) where the "premium, less-neon" feel lives.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        storm: {
          950: "#05070d", // page base
          900: "#0a0e17", // card surface
          850: "#0f1420", // raised tile / input surface
          800: "#171d2b", // hairline border / divider
          750: "#202839", // hover border / stronger divider
          700: "#2a3448", // card border
          600: "#3b4761", // outline / button border
          500: "#566481", // mid
          400: "#6d7c99", // muted / hint text
          300: "#9aa8c4", // secondary text
          200: "#c6d0e2", // body text
          100: "#e8ecf5", // headings / near-white
        },
        signal: {
          green: "#34d399",
          yellow: "#fbbf24",
          red: "#fb7185",
          cyan: "#22d3ee",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Inter",
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
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)",
        "card-hover":
          "0 1px 0 0 rgba(255,255,255,0.05) inset, 0 12px 32px -12px rgba(0,0,0,0.7)",
        accent: "0 8px 24px -10px rgba(34,211,238,0.35)",
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
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
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
