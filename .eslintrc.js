module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
  },
  ignorePatterns: [
    'node_modules/',
    'coverage/',
    'logs/',
    // Bundle Vite du SPA web (minifié, servi statiquement sous /feed-app) —
    // pas du code source à linter.
    'src/views/feed-app/',
  ],
  rules: {
    'no-unused-vars': ['warn', {argsIgnorePattern: '^_', varsIgnorePattern: '^_'}],
    'no-console': 'off',
  },
  overrides: [
    {
      files: ['tests/**/*.js', '**/*.test.js'],
      env: {
        jest: true,
        node: true,
      },
    },
  ],
};
