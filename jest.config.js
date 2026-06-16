module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jestSetup.js'],
  globalSetup: '<rootDir>/tests/setup/globalSetup.js',
  globalTeardown: '<rootDir>/tests/setup/globalTeardown.js',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/views/**',
    '!src/config/cron/index.js',
    '!src/utils/logger.js',
  ],
  coverageThreshold: {
    // Seuils alignés sur la couverture réelle (juin 2026), avec ~1-2 pts de marge
    // sous le niveau actuel pour servir de garde-fou anti-régression sans flaker.
    // À remonter au fur et à mesure que la couverture augmente (cible : 80% global).
    global: { branches: 65, functions: 75, lines: 75, statements: 75 },
    './src/services/steam/': {
      branches: 80,
      functions: 90,
      lines: 88,
      statements: 88,
    },
    './src/services/newsFeed/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/services/notifications/': {
      branches: 73,
      functions: 85,
      lines: 84,
      statements: 85,
    },
    './src/middleware/': {
      branches: 80,
      functions: 90,
      lines: 87,
      statements: 87,
    },
  },
  coverageReporters: ['text-summary', 'lcov', 'html'],
  clearMocks: true,
  restoreMocks: true,
  maxWorkers: '50%',
  testTimeout: 15000,
};
