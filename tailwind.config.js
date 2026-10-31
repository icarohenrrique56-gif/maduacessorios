/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        blush: '#F8E9EF',
        lilac: '#E7CDE1',
        mauveLight: '#D3B4D0',
        mauve: '#B88FB7',
        plum: '#8B5E7C',
        ink: '#2D1D25',
      },
      boxShadow: {
        soft: '0 16px 32px rgba(139, 94, 124, 0.12)',
      },
    },
  },
  plugins: [],
};
