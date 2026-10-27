import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0A0A0A", soft: "#121212", card: "#161616", line: "#242424" },
        pickle: {
          50: "#F0FCE9",
          100: "#DDF8C8",
          300: "#A9E86B",
          400: "#8BDC3F",
          500: "#6FCF2B",
          600: "#57A81F",
          700: "#3F7A17",
        },
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      borderRadius: { xl: "0.9rem", "2xl": "1.25rem", "3xl": "1.75rem" },
      boxShadow: {
        glow: "0 0 0 1px rgba(111,207,43,0.35), 0 12px 40px -12px rgba(111,207,43,0.45)",
        card: "0 10px 30px -18px rgba(0,0,0,0.9)",
      },
      keyframes: {
        pulseDot: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        pulseDot: "pulseDot 1.8s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
