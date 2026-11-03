// The slate palette is driven by CSS variables so the whole UI flips between dark and light
// by changing one attribute: <html data-theme="light">. See src/index.css.
const v = n => `rgb(var(--s-${n}) / <alpha-value>)`;
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: { colors: { slate: {
    50: v(50), 100: v(100), 200: v(200), 300: v(300), 400: v(400),
    500: v(500), 600: v(600), 700: v(700), 800: v(800), 900: v(900), 950: v(950),
  } } } },
  plugins: [],
};
