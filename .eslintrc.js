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
