/**
 * Database Migration Runner
 *
 * Runs Drizzle ORM migrations from the /migrations directory.
 * Can be used standalone (npm run db:migrate) or imported for programmatic use.
 *
 * Usage:
 *   npm run db:generate   # Generate migration from schema changes
 *   npm run db:migrate    # Apply pending migrations
 *   npm run db:push       # Dev-only: push schema directly (no migration files)
 */

import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './db.js';

export async function runMigrations(): Promise<void> {
  console.log('[migrate] Running database migrations...');

  try {
    await migrate(db, { migrationsFolder: './migrations' });
    console.log('[migrate] Migrations completed successfully');
  } catch (error) {
    console.error('[migrate] Migration failed:', error);
    throw error;
  }
}

// Run directly if executed as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => {
      console.log('[migrate] Done');
      pool.end();
      process.exit(0);
    })
    .catch((err) => {
      console.error('[migrate] Fatal error:', err);
      pool.end();
      process.exit(1);
    });
}
