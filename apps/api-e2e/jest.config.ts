export default {
  displayName: 'api-e2e',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  globalSetup: './src/global-setup.ts',
  globalTeardown: './src/global-teardown.ts',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: '../../coverage/apps/api-e2e',
  moduleNameMapper: {
    '^@multiplayer-base/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
  },
};
