/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          950: "#0b0e14",
          900: "#11151f",
          800: "#181d2a",
          700: "#232a3d",
          600: "#2f3850",
        },
        accent: {
          400: "#7c9cff",
          500: "#5b7cfa",
          600: "#4460e0",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
