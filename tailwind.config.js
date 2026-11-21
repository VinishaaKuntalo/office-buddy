import forms from '@tailwindcss/forms';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#15263f',
        mint: '#16845b',
        canvas: '#f7f9fc',
      },
      boxShadow: {
        soft: '0 8px 28px rgba(21, 38, 63, 0.07)',
      },
    },
  },
  plugins: [forms],
};
