module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          extensions: ['.ios.js', '.android.js', '.js', '.ts', '.tsx', '.json'],
          alias: {
            '@engine':     './src/engine',
            '@data':       './src/data',
            '@screens':    './src/screens',
            '@components': './src/components',
            '@hooks':      './src/hooks',
            '@store':      './src/store',
            '@utils':      './src/utils',
            '@assets':     './src/assets',
          },
        },
      ],
      'react-native-reanimated/plugin',  // Must be last
    ],
  };
};
