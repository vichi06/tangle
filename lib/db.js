import { createClient } from '@libsql/client';

let db = null;

export function getDb() {
  if (!db) {
    if (!process.env.TURSO_DATABASE_URL) {
      throw new Error('TURSO_DATABASE_URL environment variable is not set');
    }
    db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return db;
}

export default {
  execute: (...args) => getDb().execute(...args)
};
