/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#f0fdf9',
          100: '#ccfbef',
          200: '#99f5df',
          300: '#5ee9c7',
          400: '#2dd4aa',
          500: '#10A37F',
          600: '#0d8f6e',
          700: '#0a7059',
          800: '#085745',
          900: '#064032',
        },
        coral: '#FF6584',
        teal:  '#10A37F',
        ink: 'rgb(var(--cc-ink-rgb) / <alpha-value>)',
        fog: 'rgb(var(--cc-fog-rgb) / <alpha-value>)',
        mist: 'rgb(var(--cc-mist-rgb) / <alpha-value>)',
        surface: 'rgb(var(--cc-surface-rgb) / <alpha-value>)',
        page: 'rgb(var(--cc-page-rgb) / <alpha-value>)',
      },
      animation: {
        'fade-in':    'fadeIn 0.4s ease-out forwards',
        'slide-up':   'slideUp 0.4s ease-out forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(16px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } },
      },
    },
  },
  plugins: [],
}
