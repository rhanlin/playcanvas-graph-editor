import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        // PlayCanvas Editor Color Palette
        pc: {
          // Background colors
          darkest: "#20292b",
          darker: "#293538",
          dark: "#2c393c",
          primary: "#364346",

          // Text colors
          "text-darkest": "#5b7073",
          "text-dark": "#9ba1a3",
          "text-secondary": "#b1b8ba",
          "text-primary": "#fff",
          "text-active": "#f60",

          // Error colors
          error: "#fb222f",
          "error-secondary": "#d34141",

          // Border colors
          "border-primary": "#232e30",

          // Placeholder
          placeholder: "#829193",
        },
      },
      fontFamily: {
        // PlayCanvas Editor Font System
        sans: ["'Helvetica Neue'", "Arial", "Helvetica", "sans-serif"],
        regular: ["'Helvetica Neue'", "Arial", "Helvetica", "sans-serif"],
        bold: ["'Helvetica Neue'", "Arial", "Helvetica", "sans-serif"],
        light: ["'Helvetica Neue'", "Arial", "Helvetica", "sans-serif"],
        thin: ["'Helvetica Neue'", "Arial", "Helvetica", "sans-serif"],
        mono: [
          "inconsolatamedium",
          "Monaco",
          "Menlo",
          "'Ubuntu Mono'",
          "Consolas",
          "source-code-pro",
          "monospace",
        ],
      },
      fontWeight: {
        regular: "normal",
        light: "200",
        thin: "100",
      },
    },
  },
  plugins: [],
} satisfies Config;
