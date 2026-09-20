/**
 * Test environment defaults. These are dummy values — the unit tests never
 * reach a real database or PayMongo. Integration tests opt in by setting
 * DATABASE_URL themselves.
 */
process.env.NODE_ENV ??= "test";
process.env.DATABASE_URL ??= "postgresql://localhost:5432/ezpickle_test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters-long";
process.env.APP_URL ??= "http://localhost:3000";
process.env.PAYMONGO_WEBHOOK_SECRET ??= "whsk_test_secret";
