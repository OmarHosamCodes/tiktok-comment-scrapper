import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./src/db/schema.ts",
	out: "./src/db/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url:
			process.env.DATABASE_URL ||
			process.env.POSTGRES_URL ||
			"postgres://tcs_user:tcs_password@localhost:5432/tcs_db",
	},
	verbose: true,
	strict: true,
});
