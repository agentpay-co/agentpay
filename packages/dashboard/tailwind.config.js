/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ap: {
          bg: '#080e1e',
          surface: '#0f1d33',
          'surface-2': '#132040',
          border: '#1e3358',
          primary: '#14b8a6',
          'primary-strong': '#0d9488',
          accent: '#f59e0b',
          sky: '#38bdf8',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        'ap': '0 8px 32px rgba(20,184,166,0.12)',
        'ap-strong': '0 12px 40px rgba(20,184,166,0.18)',
      }
    },
  },
  plugins: [],
}
