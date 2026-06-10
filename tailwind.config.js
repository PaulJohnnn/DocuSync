/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // App design system maps to these custom variables defined in index.css
        ds: {
          bg: {
            base: "var(--ds-bg-base)",
            elevated: "var(--ds-bg-elevated)",
            overlay: "var(--ds-bg-overlay)",
          },
          surface: {
            DEFAULT: "var(--ds-surface)",
            hover: "var(--ds-surface-hover)",
          },
          border: {
            DEFAULT: "var(--ds-border)",
            strong: "var(--ds-border-strong)",
          },
          text: {
            primary: "var(--ds-text-primary)",
            secondary: "var(--ds-text-secondary)",
            muted: "var(--ds-text-muted)",
          },
          accent: {
            DEFAULT: "var(--ds-accent)",
            hover: "var(--ds-accent-hover)",
            subtle: "var(--ds-accent-subtle)",
          },
          success: {
            DEFAULT: "var(--ds-success)",
            subtle: "var(--ds-success-subtle)",
          },
          warning: {
            DEFAULT: "var(--ds-warning)",
            subtle: "var(--ds-warning-subtle)",
          },
          danger: {
            DEFAULT: "var(--ds-danger)",
            subtle: "var(--ds-danger-subtle)",
          },
        },
      },
      borderRadius: {
        'ds-sm': 'var(--ds-radius-sm)',
        'ds-md': 'var(--ds-radius-md)',
        'ds-lg': 'var(--ds-radius-lg)',
      },
    },
  },
  plugins: [],
};
