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
        // Grace Church School — Primary palette (Navy #003882 / White)
        navy: {
          50:  '#eef4fb',
          100: '#dbe7f5',
          200: '#b8cfeb',
          300: '#8fb3de',
          400: '#6698d0',
          500: '#3d7dc2',
          600: '#2a6cb5',
          700: '#175ba8',
          800: '#0a4a97',
          900: '#003882', // official Grace Navy (Pantone 2955C, #003882)
          950: '#001c40',
        },
        brand: '#003882',
        // Secondary palette
        grace: {
          grey: '#C1C1C1', // Pantone 428U
          // Tertiary palette — accents / highlights only
          lightblue: '#adcff1', // Pantone 277U
          orange: '#f79b2e',    // Pantone 130U
          green: '#d5e6a4',     // Pantone 2288U
          purple: '#ccacd2',    // Pantone 2563U
        },
      },
      fontFamily: {
        // Open Sans = body/UI, Asul = display/headline (both Google Fonts)
        sans: ['"Open Sans"', 'system-ui', 'sans-serif'],
        display: ['Asul', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
}
