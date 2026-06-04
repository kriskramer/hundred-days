const tokens = require('./src/tokens');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './app/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ...tokens,
        'ink-light': tokens.inkLight,
        'parchment-dark': tokens.parchDark,
        'parchment-deep': tokens.parchDeep,
        'gold-light': tokens.goldLight,


        // Morale tier colours
        morale: {
          inspired:   '#5A8A6A',
          steady:     '#5A8A6A',
          weary:      '#888780',
          desperate:  '#AA4444',
          broken:     '#8B1A1A',
        },

        // Reputation tier colours
        rep: {
          hero:        '#4A7C59',
          honorable:   '#6AAA7A',
          neutral:     '#888780',
          disreputable:'#AA7744',
          infamous:    '#8B1A1A',
        },

        // Item rarity colours
        rarity: {
          common:    '#888780',
          uncommon:  '#4A7C59',
          rare:      '#2A4A8A',
          unique:    '#B8860B',
        },
      },
      fontFamily: {
        // Loaded via expo-font — referenced as className="font-display"
        display: ['Cinzel_400Regular'],
        'display-bold': ['Cinzel_600SemiBold'],
        body:    ['CrimsonText_400Regular'],
        'body-italic': ['CrimsonText_400Regular_Italic'],
        'body-bold':   ['CrimsonText_600SemiBold'],
      },
    },
  },
  plugins: [],
};
