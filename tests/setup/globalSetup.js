const { MongoMemoryServer } = require('mongodb-memory-server');

module.exports = async function globalSetup() {
  process.env.NODE_ENV = 'test';
  process.env.STEAM_API_KEY = process.env.STEAM_API_KEY || 'test-steam-api-key';
  process.env.NOTIFICATION_PROVIDER = 'simulation';
  process.env.LOG_LEVEL = 'silent';
  process.env.SENTRY_DSN = '';
  process.env.ADMIN_TOKEN =
    process.env.ADMIN_TOKEN || 'a'.repeat(64);
  process.env.ADMIN_SESSION_SECRET =
    process.env.ADMIN_SESSION_SECRET || 'b'.repeat(64);
  process.env.MOBILE_REDIRECT_SCHEME = 'steamnotif';
  process.env.CORS_ORIGINS = '*';

  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();

  globalThis.__MONGOD__ = mongod;
};
