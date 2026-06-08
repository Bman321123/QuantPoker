/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#0B0F14", // near-black canvas
          800: "#0F141B",
          700: "#151C26",
          600: "#1C2532",
          500: "#28323F",
        },
        felt: {
          dark: "#0E2A24",
          DEFAULT: "#12362E",
          light: "#16463A",
        },
        emerald: { glow: "#10B981" },
        violet: { glow: "#8B5CF6" },
        cyan: { glow: "#22D3EE" },
        gold: { glow: "#F5C451" },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      gridTemplateColumns: {
        13: "repeat(13, minmax(0, 1fr))",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(16,185,129,0.5), 0 0 24px -4px rgba(16,185,129,0.45)",
        "glow-violet": "0 0 0 1px rgba(139,92,246,0.5), 0 0 24px -4px rgba(139,92,246,0.45)",
        card: "0 6px 18px -6px rgba(0,0,0,0.6)",
        panel: "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 12px 32px -12px rgba(0,0,0,0.7)",
      },
      keyframes: {
        dealIn: {
          "0%": { transform: "translateY(-18px) scale(0.9)", opacity: "0" },
          "100%": { transform: "translateY(0) scale(1)", opacity: "1" },
        },
        popIn: {
          "0%": { transform: "scale(0.96)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        pulseGlow: {
          "0%,100%": { boxShadow: "0 0 0 1px rgba(16,185,129,0.5), 0 0 18px -6px rgba(16,185,129,0.5)" },
          "50%": { boxShadow: "0 0 0 1px rgba(16,185,129,0.8), 0 0 30px -2px rgba(16,185,129,0.7)" },
        },
      },
      animation: {
        dealIn: "dealIn 0.35s cubic-bezier(0.22,1,0.36,1) both",
        popIn: "popIn 0.2s ease-out both",
        pulseGlow: "pulseGlow 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
