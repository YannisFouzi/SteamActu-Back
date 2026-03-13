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
    'no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
    'no-console': 'off',
  },
};
