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
    // Global : 80% lines/statements/functions, 70% branches (cleanup multi-cas
    // sur les services FCM et chemins d'erreur peu déterministes).
    global: { branches: 65, functions: 80, lines: 80, statements: 80 },
    './src/services/steam/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/services/newsFeed/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    './src/services/notifications/': {
      branches: 75,
      functions: 85,
      lines: 85,
      statements: 85,
    },
    './src/middleware/': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  coverageReporters: ['text-summary', 'lcov', 'html'],
  clearMocks: true,
  restoreMocks: true,
  maxWorkers: '50%',
  testTimeout: 15000,
};
