/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Deep navy blue gray palette for dark mode
        gray: {
          50: "#f8fafc",
          100: "#f1f5f9",
          200: "#e2e8f0",
          300: "#cbd5e1",
          400: "#94a3b8",
          500: "#64748b",
          600: "#475569",
          700: "#293548",
          800: "#1a2640",
          900: "#0f1729",
          950: "#080f1e",
        },
        primary: {
          50: "#f0f9ff",
          100: "#e0f2fe",
          200: "#bae6fd",
          300: "#7dd3fc",
          400: "#38bdf8",
          500: "#0ea5e9",
          600: "#0284c7",
          700: "#0369a1",
          800: "#075985",
          900: "#0c4a6e",
          950: "#082f49",
        },
        accent: {
          keep: "#22c55e", // Green for keep
          reject: "#ef4444", // Red for reject
          skip: "#f59e0b", // Amber for skip/review later
          favorite: "#ec4899", // Pink for favorite
        },
      },
      animation: {
        "swipe-left": "swipeLeft 0.3s ease-out forwards",
        "swipe-right": "swipeRight 0.3s ease-out forwards",
        "fade-in": "fadeIn 0.2s ease-out",
      },
      keyframes: {
        swipeLeft: {
          "0%": { transform: "translateX(0) rotate(0)", opacity: "1" },
          "100%": {
            transform: "translateX(-150%) rotate(-20deg)",
            opacity: "0",
          },
        },
        swipeRight: {
          "0%": { transform: "translateX(0) rotate(0)", opacity: "1" },
          "100%": { transform: "translateX(150%) rotate(20deg)", opacity: "0" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
