
require("dotenv").config();
const express = require("express");
const session = require("express-session");
const pgSession = require("connect-pg-simple")(session);
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const path = require("path");
const { Pool } = require("pg");
const { z } = require("zod");
const { migrate, ensureAdmin } = require("./migrate");
const adminRouter = require("./admin");

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL");
  process.exit(1);
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.error("SESSION_SECRET must be at least 32 characters");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

if (isProd) app.set("trust proxy", 1);

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" }
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));

app.use(session({
  store: new pgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true
  }),
  name: "edtech.sid",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

app.use("/api/auth/login", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many failed attempts. Try again in 15 minutes." }
}));
app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));
app.use("/api", rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

app.use(express.static(path.join(__dirname, "..", "public"), {
  etag: true,
  maxAge: isProd ? "1h" : 0
}));

function createCsrf(req) {
  const token = crypto.randomBytes(32).toString("hex");
  req.session.csrfToken = token;
  return token;
}
function requireCsrf(req, res, next) {
  const sent = req.get("x-csrf-token");
  if (!sent || !req.session.csrfToken ||
      !crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(req.session.csrfToken))) {
    return res.status(403).json({ error: "Invalid CSRF token" });
  }
  next();
}
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Authentication required" });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

const passwordRule = z.string().min(10).max(128)
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/[a-z]/, "Password needs a lowercase letter")
  .regex(/[0-9]/, "Password needs a number");
const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160).transform(v => v.toLowerCase()),
  password: passwordRule
});
const loginSchema = z.object({
  email: z.string().trim().email().max(160).transform(v => v.toLowerCase()),
  password: z.string().min(1).max(128)
});
const courseSchema = z.object({
  title: z.string().trim().min(3).max(120),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/).max(120),
  description: z.string().trim().min(10).max(1200),
  level: z.enum(["Beginner", "Intermediate", "Advanced"]),
  category: z.string().trim().min(2).max(80),
  duration_hours: z.coerce.number().int().min(1).max(1000)
});
const progressSchema = z.object({
  progress: z.coerce.number().int().min(0).max(100)
});

app.get("/api/csrf", (req, res) => {
  res.json({ csrfToken: createCsrf(req) });
});

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/auth/register", requireCsrf, async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [data.email]);
    if (existing.rowCount) return res.status(409).json({ error: "Email already registered" });

    const hash = await bcrypt.hash(data.password, 12);
    const q = await pool.query(
      `INSERT INTO users(name,email,password_hash,role)
       VALUES($1,$2,$3,'student')
       RETURNING id,name,email,role`,
      [data.name, data.email, hash]
    );
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.user = q.rows[0];
      createCsrf(req);
      res.status(201).json({ user: q.rows[0], csrfToken: req.session.csrfToken });
    });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0].message });
    next(e);
  }
});

app.post("/api/auth/login", requireCsrf, async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const q = await pool.query(
      "SELECT id,name,email,password_hash,role,disabled FROM users WHERE email=$1",
      [data.email]
    );
    const user = q.rows[0];
    const valid = user ? await bcrypt.compare(data.password, user.password_hash) : false;
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });
    if (user.disabled) return res.status(403).json({ error: "This account is disabled. Contact the administrator." });

    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      createCsrf(req);
      res.json({ user: req.session.user, csrfToken: req.session.csrfToken });
    });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: "Invalid login data" });
    next(e);
  }
});

app.post("/api/auth/logout", requireAuth, requireCsrf, (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("edtech.sid");
    res.json({ ok: true });
  });
});

app.get("/api/courses", async (req, res, next) => {
  try {
    const q = await pool.query(
      `SELECT id,title,slug,description,level,category,duration_hours,created_at
       FROM courses WHERE published=true ORDER BY created_at DESC`
    );
    res.json({ courses: q.rows });
  } catch (e) { next(e); }
});

app.post("/api/courses", requireAdmin, requireCsrf, async (req, res, next) => {
  try {
    const d = courseSchema.parse(req.body);
    const q = await pool.query(
      `INSERT INTO courses(title,slug,description,level,category,duration_hours,published)
       VALUES($1,$2,$3,$4,$5,$6,true)
       RETURNING *`,
      [d.title,d.slug,d.description,d.level,d.category,d.duration_hours]
    );
    res.status(201).json({ course: q.rows[0] });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0].message });
    if (e.code === "23505") return res.status(409).json({ error: "Course slug already exists" });
    next(e);
  }
});

app.post("/api/courses/:id/enroll", requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid course id" });

    const exists = await pool.query("SELECT id FROM courses WHERE id=$1 AND published=true", [id]);
    if (!exists.rowCount) return res.status(404).json({ error: "Course not found" });

    await pool.query(
      `INSERT INTO enrollments(user_id,course_id,progress)
       VALUES($1,$2,0)
       ON CONFLICT(user_id,course_id) DO NOTHING`,
      [req.session.user.id,id]
    );
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get("/api/dashboard", requireAuth, async (req, res, next) => {
  try {
    const q = await pool.query(
      `SELECT c.id,c.title,c.slug,c.level,c.category,c.duration_hours,e.progress,e.enrolled_at
       FROM enrollments e
       JOIN courses c ON c.id=e.course_id
       WHERE e.user_id=$1
       ORDER BY e.enrolled_at DESC`,
      [req.session.user.id]
    );
    res.json({ enrollments: q.rows });
  } catch (e) { next(e); }
});

app.patch("/api/enrollments/:courseId/progress", requireAuth, requireCsrf, async (req, res, next) => {
  try {
    const courseId = Number(req.params.courseId);
    const d = progressSchema.parse(req.body);
    const q = await pool.query(
      `UPDATE enrollments SET progress=$1, updated_at=NOW()
       WHERE user_id=$2 AND course_id=$3
       RETURNING progress`,
      [d.progress, req.session.user.id, courseId]
    );
    if (!q.rowCount) return res.status(404).json({ error: "Enrollment not found" });
    res.json({ progress: q.rows[0].progress });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: "Progress must be 0-100" });
    next(e);
  }
});

app.use("/api/admin", adminRouter({ pool, requireCsrf, passwordRule }));

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.get("/admin", (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.sendFile(path.join(__dirname, "..", "public", "admin.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

migrate(pool)
  .then(() => ensureAdmin(pool))
  .then(() => app.listen(PORT, () => console.log(`EdTech platform running on http://localhost:${PORT}`)))
  .catch(e => {
    console.error("Startup failed", e);
    process.exit(1);
  });
