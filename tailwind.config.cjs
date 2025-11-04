/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        emerald: {
          50: '#ecfdf5',
          600: '#047857',
          700: '#065f46'
        }
      }
    }
  },
  plugins: []
}
