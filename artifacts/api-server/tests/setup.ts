// Test environment setup — runs before every test file
// No DATABASE_URL → DB persistence is disabled, in-memory store is used
process.env.NODE_ENV = "test";
process.env.PORT = "0"; // let the OS pick an ephemeral port
process.env.SESSION_SECRET = "test-session-secret-for-jest-only-not-real";
process.env.JWT_SECRET = "test-jwt-secret-for-jest-only-not-real-min-32chars";
// Leave DATABASE_URL unset — DB is disabled in tests
delete process.env.DATABASE_URL;
