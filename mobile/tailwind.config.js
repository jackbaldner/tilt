/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        background: "#0f0f0f",
        surface: "#1a1a1a",
        card: "#222222",
        border: "#2a2a2a",
        primary: "#10b981", // emerald-500
        "primary-dark": "#059669",
        accent: "#6366f1", // indigo
        win: "#10b981",
        loss: "#ef4444",
        gold: "#f59e0b",
        text: {
          primary: "#f9fafb",
          secondary: "#9ca3af",
          muted: "#6b7280",
        },
      },
    },
  },
  plugins: [],
};
