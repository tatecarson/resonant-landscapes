import type { Config } from '@jest/types';

const config: Config.InitialOptions = {
  preset: 'jest-puppeteer',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  transformIgnorePatterns: [
    // Transform OpenLayers ES modules
    '/node_modules/(?!(ol|.*\\.mjs$))'
  ],
  moduleNameMapper: {
    // Handle module aliases and JSON imports
    '^ol/(.*)$': '<rootDir>/node_modules/ol/$1',
    '\\.json$': '<rootDir>/node_modules/identity-obj-proxy'
  },
  testEnvironment: 'jest-environment-puppeteer',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testTimeout: 30000,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};

export default config;