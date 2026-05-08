import type { Config } from "tailwindcss";

// Neon green palette used across all pages — safelisted so Tailwind always
// emits these classes regardless of per-page JIT compile order in dev mode.
const neonGreen = "#00ff41";
const neonSafelist = [
  `text-[${neonGreen}]`,
  `bg-[${neonGreen}]`,
  `border-[${neonGreen}]`,
  `placeholder-[${neonGreen}]/20`,
  `focus:border-[${neonGreen}]`,
  `hover:text-[${neonGreen}]`,
  `hover:bg-[${neonGreen}]`,
  `hover:bg-[${neonGreen}]/90`,
  `hover:bg-[${neonGreen}]/10`,
  `hover:bg-[${neonGreen}]/5`,
  `hover:border-[${neonGreen}]/60`,
  `bg-[${neonGreen}]/[0.02]`,
  `bg-[${neonGreen}]/5`,
  `bg-[${neonGreen}]/10`,
  `bg-[${neonGreen}]/20`,
  `border-[${neonGreen}]/10`,
  `border-[${neonGreen}]/20`,
  `border-[${neonGreen}]/30`,
  `border-[${neonGreen}]/40`,
  `border-[${neonGreen}]/60`,
  `text-[${neonGreen}]/20`,
  `text-[${neonGreen}]/25`,
  `text-[${neonGreen}]/30`,
  `text-[${neonGreen}]/40`,
  `text-[${neonGreen}]/50`,
  `text-[${neonGreen}]/60`,
  `text-[${neonGreen}]/70`,
  `text-[${neonGreen}]/80`,
];

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: neonSafelist,
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [],
};
export default config;
