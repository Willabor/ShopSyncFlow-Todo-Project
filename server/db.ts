import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Create PostgreSQL pool with search_path for shared schema
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

// Set search_path to include shared schema for all connections
pool.on('connect', (client) => {
  client.query('SET search_path TO shared, public');
});

// Create Drizzle instance with node-postgres
export const db = drizzle(pool, { schema });
