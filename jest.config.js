module.exports = {
  testEnvironment: 'node',
  collectCoverageFrom: [
    'routes/**/*.js',
    'services/**/*.js',
    'utils/**/*.js',
    'middleware/**/*.js',
    'config/**/*.js',
    '!**/node_modules/**',
    '!**/coverage/**',
    '!**/logs/**',
    '!**/temp/**',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js',
  ],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
};