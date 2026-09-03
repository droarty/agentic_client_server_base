export default async function globalSetup() {
  process.env['JWT_SECRET'] = 'test-secret';
  process.env['GOOGLE_CLIENT_ID'] = 'test-client-id';
  process.env['GOOGLE_CLIENT_SECRET'] = 'test-client-secret';
  process.env['NODE_ENV'] = 'test';
}
