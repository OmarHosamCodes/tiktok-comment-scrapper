import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Get database URL from environment
const databaseUrl =
	process.env.DATABASE_URL ||
	process.env.POSTGRES_URL ||
	"postgres://tcs_user:tcs_password@localhost:5432/tcs_db";

// Create postgres connection
const client = postgres(databaseUrl, {
	max: 10, // Connection pool size
});

// Create drizzle instance with schema
export const db = drizzle(client, { schema });

// Export client for raw queries if needed
export { client };
