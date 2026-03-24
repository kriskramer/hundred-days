module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:react-native/all',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'react-native'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  rules: {
    // TypeScript
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',

    // React
    'react/react-in-jsx-scope': 'off',       // Not needed with new JSX transform
    'react/prop-types': 'off',               // We use TypeScript for prop types

    // React Native
    'react-native/no-inline-styles': 'warn', // Prefer NativeWind classes
    'react-native/no-color-literals': 'off', // We use the design system
    'react-native/no-raw-text': 'off',

    // General
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  env: {
    browser: false,
    node: true,
    es2022: true,
  },
  ignorePatterns: ['node_modules/', '.expo/', 'dist/', '*.config.js'],
};
