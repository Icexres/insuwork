import type { Config } from "tailwindcss";

// Tokens from the InsuWork Figma file (dark workspace + light printable "paper").
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#08090a",
        surface: "#0f1011",
        raised: "#161718",
        line: "#23252a",
        edge: "#383b3f",
        fg: "#d0d6e0",
        muted: "#8a8f98",
        faint: "#62666d",
        accent: "#e4f222",
        paper: "#f6f6f4",
        "paper-2": "#eaeae6",
        ink: "#1a1b1e",
        "ink-2": "#5a5d63",
        rule: "#d5d5d2",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
