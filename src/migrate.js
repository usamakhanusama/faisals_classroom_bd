const bcrypt = require("bcryptjs");

async function migrate(pool) {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id BIGSERIAL PRIMARY KEY,
      admin_id BIGINT,
      admin_email VARCHAR(160) NOT NULL,
      action VARCHAR(60) NOT NULL,
      target VARCHAR(200),
      detail JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit(created_at DESC)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS enrollments_course_idx ON enrollments(course_id)`);
}

async function ensureAdmin(pool) {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const pass = process.env.ADMIN_PASSWORD || "";
  if (!email || !pass) return;
  if (pass.length < 12) {
    console.warn("ADMIN_PASSWORD is shorter than 12 characters, admin bootstrap skipped");
    return;
  }
  const hash = await bcrypt.hash(pass, 12);
  const q = await pool.query(
    `INSERT INTO users(name,email,password_hash,role)
     VALUES('Platform Admin',$1,$2,'admin')
     ON CONFLICT(email) DO NOTHING
     RETURNING id`,
    [email, hash]
  );
  if (q.rowCount) console.log("Admin account created:", email);
}

module.exports = { migrate, ensureAdmin };
