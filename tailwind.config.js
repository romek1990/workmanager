/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'Arial', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#f1faec',
          100: '#e0f4d6',
          200: '#c3e8b0',
          300: '#9dd881',
          400: '#78c85a',
          500: '#59bb4a',
          600: '#459a3a',
          700: '#377b30',
          800: '#2e6229',
          900: '#284f24',
          950: '#0f2a0d',
        },
        lime: '#B7F04C',
        amberx: '#FFB020',
        coral: '#FF5A5F',
        ink: {
          900: '#0B1210',
          800: '#141414',
          700: '#1f1f1f',
        },
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        soft: '0 2px 10px -2px rgba(10, 10, 10, 0.06)',
        card: '0 4px 20px -4px rgba(10, 10, 10, 0.08)',
        glass: '0 8px 30px rgba(15, 40, 25, 0.08)',
        'glass-lg': '0 16px 40px rgba(15, 40, 25, 0.14)',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(14px) scale(.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        rise: 'rise .6s cubic-bezier(.2,.8,.2,1) both',
      },
    },
  },
  plugins: [],
}
