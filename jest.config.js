module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['@testing-library/react-native/extend-expect'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$':
      '<rootDir>/node_modules/@react-native-async-storage/async-storage/jest/async-storage-mock.js',
    '^@engine/(.*)$':     '<rootDir>/src/engine/$1',
    '^@engine$':          '<rootDir>/src/engine',
    '^@data/(.*)$':       '<rootDir>/src/data/$1',
    '^@data$':            '<rootDir>/src/data',
    '^@screens/(.*)$':    '<rootDir>/src/screens/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@components$':      '<rootDir>/src/components/index',
    '^@store/(.*)$':      '<rootDir>/src/store/$1',
    '^@store$':           '<rootDir>/src/store',
    '^@hooks/(.*)$':      '<rootDir>/src/hooks/$1',
    '^@utils/(.*)$':      '<rootDir>/src/utils/$1',
    '^@theme$':           '<rootDir>/src/theme',
    '^expo-haptics$':     '<rootDir>/src/__tests__/__mocks__/expo-haptics.ts',
    '^expo-av$':          '<rootDir>/src/__tests__/__mocks__/expo-av.ts',
    '^react-native-reanimated$': 'react-native-reanimated/mock',
  },
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/__tests__/**/*.test.tsx',
  ],
  collectCoverageFrom: [
    'src/engine/**/*.ts',
    'src/components/**/*.tsx',
    'src/screens/**/*.tsx',
    '!src/engine/types.ts',
  ],
  coverageThreshold: {
    // Global is lower because screen files (0% coverage) are included in collection
    // but require native device context to test meaningfully.
    // Engine and component code exceeds 70%+ individually.
    global: { statements: 45, branches: 38, functions: 40, lines: 47 },
  },
};
