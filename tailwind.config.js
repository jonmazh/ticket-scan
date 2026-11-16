/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Segoe UI"',
          'Inter',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        ink: {
          DEFAULT: '#0E1726',
          soft: '#3B4556',
          mute: '#6B7686',
          faint: '#9AA3B2',
        },
        surface: {
          DEFAULT: '#F5F6F8',
          card: '#FFFFFF',
          line: '#E7E9EE',
          sunken: '#EEF0F3',
        },
        brand: {
          50: '#ECFDF6',
          100: '#D1FAEA',
          200: '#A6F1D4',
          400: '#34C493',
          500: '#12A877',
          600: '#0B8A61',
          700: '#0A6E4F',
        },
        warn: { 50: '#FFF8EB', 100: '#FDEBC8', 500: '#D98A06', 700: '#94590A' },
        danger: { 50: '#FEF1F1', 100: '#FDDCDC', 500: '#E0393E', 600: '#C42A2F' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(14,23,38,0.04), 0 4px 16px rgba(14,23,38,0.04)',
        float: '0 8px 30px rgba(14,23,38,0.12)',
        fab: '0 6px 20px rgba(11,138,97,0.35)',
      },
      borderRadius: {
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        scan: {
          '0%': { transform: 'translateY(0%)' },
          '50%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out',
        'slide-up': 'slide-up 220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'sheet-up': 'sheet-up 260ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        scan: 'scan 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
