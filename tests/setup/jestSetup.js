const mongoose = require('mongoose');

jest.mock('../../src/utils/logger', () => ({
  trace: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(function child() {
    return this;
  }),
}));

beforeAll(async () => {
  if (mongoose.connection.readyState === 0) {
    const workerId = process.env.JEST_WORKER_ID || '1';
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: `test_w${workerId}`,
    });
  }

  // Force la création des indexes uniques (compound, TTL) avant les tests.
  // Sans ça, Mongoose les crée paresseusement et les tests d'unicité
  // peuvent passer alors qu'ils devraient échouer.
  await Promise.all(
    Object.values(mongoose.models).map((m) => m.syncIndexes()),
  );
});

afterEach(async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    await Promise.all(
      Object.values(collections).map((collection) =>
        collection.deleteMany({}),
      ),
    );
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
});
