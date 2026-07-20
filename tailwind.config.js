/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          50:  '#e8ecf3',
          100: '#c5cfe0',
          200: '#9eafcc',
          300: '#778fb8',
          400: '#5a78a9',
          500: '#3d619a',
          600: '#355890',
          700: '#2b4c83',
          800: '#213f76',
          900: '#1B2A4A',
          950: '#111c32',
        },
        brand: '#1B2A4A',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
