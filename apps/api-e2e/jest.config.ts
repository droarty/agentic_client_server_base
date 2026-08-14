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
    '^@agentic-client-server-base/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
    '^@agentic-client-server-base/access-control$': '<rootDir>/../../libs/access-control/src/index.ts',
    '^@agentic-client-server-base/workflow-configs$': '<rootDir>/../../libs/workflow-configs/src/index.ts',
    '^@agentic-client-server-base/db-schema/test-helpers$': '<rootDir>/../../libs/db-schema/src/test-helpers/embedded-postgres.ts',
    '^@agentic-client-server-base/db-schema$': '<rootDir>/../../libs/db-schema/src/index.ts',
  },
};
