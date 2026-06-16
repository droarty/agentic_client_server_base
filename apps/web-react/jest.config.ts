export default {
  displayName: 'web',
  preset: '../../jest.preset.js',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'html'],
  coverageDirectory: '../../coverage/apps/web',
  moduleNameMapper: {
    '^@multiplayer-base/shared-types$': '<rootDir>/../../libs/shared-types/src/index.ts',
    '\\.css$': '<rootDir>/../../tools/__mocks__/styleMock.js',
  },
};
