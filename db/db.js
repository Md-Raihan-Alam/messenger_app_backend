import dotenv from "dotenv";
dotenv.config();

import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import * as schema from "../schemas/schema.js";

const { Pool } = pkg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on("error", (err) => {
  console.error("Unexpected PG Error:", err);
});

export const db = drizzle(pool, { schema });
