import type { Config } from "tailwindcss";

// Wind-tunnel palette: near-black blues, instrument-panel signal colors.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        storm: {
          950: "#05070c",
          900: "#090d15",
          850: "#0d1220",
          800: "#121a2b",
          700: "#1c2740",
          600: "#2b3a5c",
          400: "#51678f",
          300: "#8194b8",
          200: "#b3c1da",
        },
        signal: {
          green: "#34d399",
          yellow: "#fbbf24",
          red: "#fb7185",
          cyan: "#22d3ee",
        },
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
      },
      animation: {
        cellpop: "cellpop 0.3s ease-out",
        pulseglow: "pulseglow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
