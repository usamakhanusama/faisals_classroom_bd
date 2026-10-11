
require("dotenv").config();
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { migrate } = require("./migrate");

(async () => {
  if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });

  const sql = fs.readFileSync(path.join(__dirname, "..", "sql", "schema.sql"), "utf8");
  await pool.query(sql);
  await migrate(pool);

  const adminEmail = (process.env.ADMIN_EMAIL || "").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || "";
  if (adminEmail && adminPassword) {
    if (adminPassword.length < 12) throw new Error("ADMIN_PASSWORD must be at least 12 chars");
    const hash = await bcrypt.hash(adminPassword, 12);
    await pool.query(
      `INSERT INTO users(name,email,password_hash,role)
       VALUES('Platform Admin',$1,$2,'admin')
       ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin'`,
      [adminEmail, hash]
    );
    console.log("Admin user ensured:", adminEmail);
  }

  console.log("Database initialized.");
  await pool.end();
})().catch(e => {
  console.error(e);
  process.exit(1);
});
