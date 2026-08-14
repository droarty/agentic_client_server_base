export default {
  displayName: 'event-processor',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/event-processor',
  moduleNameMapper: {
    '^@agentic-client-server-base/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
    '^@agentic-client-server-base/access-control$': '<rootDir>/../../libs/access-control/src/index.ts',
    '^@agentic-client-server-base/workflow-configs$': '<rootDir>/../../libs/workflow-configs/src/index.ts',
    '^@agentic-client-server-base/db-schema$': '<rootDir>/../../libs/db-schema/src/index.ts',
    '^@agentic-client-server-base/db-schema/test-helpers$': '<rootDir>/../../libs/db-schema/src/test-helpers/embedded-postgres.ts',
  },
};
