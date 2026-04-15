'use strict';

// ---- Mock environment before any other imports ----
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests';
process.env.TEST_DATABASE = 'memory';

// ---- Mock email sender so tests don't try to send real emails ----
jest.mock('../email/sender', () => ({
  sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  sendEmailChangeVerification: jest.fn().mockResolvedValue(undefined),
  sendEmailChangeNotification: jest.fn().mockResolvedValue(undefined),
  sendEmail: jest.fn().mockResolvedValue(undefined),
}));

// ---- Suppress console noise during tests ----
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  jest.restoreAllMocks();
});
