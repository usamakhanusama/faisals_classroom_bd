const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");

const id = z.coerce.number().int().positive();
const page = z.coerce.number().int().min(1).max(100000).catch(1);
const text = z.string().trim().max(80).catch("");
const level = z.enum(["Beginner", "Intermediate", "Advanced"]);

const courseBase = z.object({
  title: z.string().trim().min(3).max(120),
  slug: z.string().trim().regex(/^[a-z0-9-]+$/, "Slug can use a-z, 0-9 and - only").max(120),
  description: z.string().trim().min(10).max(1200),
  level,
  category: z.string().trim().min(2).max(80),
  duration_hours: z.coerce.number().int().min(1).max(1000),
  published: z.boolean()
});
const courseCreate = courseBase.partial({ published: true });
const courseUpdate = courseBase.partial().strict();

function build(d, cols) {
  const f = [];
  const v = [];
  for (const k of cols) {
    if (d[k] !== undefined) {
      v.push(d[k]);
      f.push(`${k}=$${v.length}`);
    }
  }
  return { f, v };
}

function adminRouter({ pool, requireCsrf, passwordRule }) {
  const r = express.Router();

  r.use(rateLimit({ windowMs: 60 * 1000, limit: 150, standardHeaders: "draft-7", legacyHeaders: false }));

  r.use(async (req, res, next) => {
    try {
      const u = req.session.user;
      if (!u) return res.status(401).json({ error: "Authentication required" });
      const q = await pool.query("SELECT role,disabled FROM users WHERE id=$1", [u.id]);
      if (!q.rowCount || q.rows[0].role !== "admin" || q.rows[0].disabled) {
        return res.status(403).json({ error: "Admin access required" });
      }
      next();
    } catch (e) { next(e); }
  });

  async function audit(req, action, target, detail) {
    try {
      await pool.query(
        "INSERT INTO admin_audit(admin_id,admin_email,action,target,detail) VALUES($1,$2,$3,$4,$5)",
        [req.session.user.id, req.session.user.email, action, target || null, detail ? JSON.stringify(detail) : null]
      );
    } catch (e) { console.error("audit failed", e.message); }
  }

  async function killSessions(userId) {
    try {
      await pool.query("DELETE FROM user_sessions WHERE (sess->'user'->>'id')=$1", [String(userId)]);
    } catch (e) {
      if (e.code !== "42P01") console.error("session cleanup failed", e.message);
    }
  }

  async function otherAdmins(excludeId) {
    const q = await pool.query(
      "SELECT COUNT(*)::int AS n FROM users WHERE role='admin' AND disabled=false AND id<>$1",
      [excludeId]
    );
    return q.rows[0].n;
  }

  function fail(res, e, next) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: e.issues[0].message });
    if (e.code === "23505") return res.status(409).json({ error: "That value already exists" });
    if (e.code === "23503") return res.status(400).json({ error: "Related record not found" });
    next(e);
  }

  r.get("/stats", async (req, res, next) => {
    try {
      const [a, b, c, d, e] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS users,
                           COUNT(*) FILTER (WHERE role='admin')::int AS admins,
                           COUNT(*) FILTER (WHERE disabled)::int AS disabled,
                           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS new_week
                    FROM users`),
        pool.query(`SELECT COUNT(*)::int AS courses,
                           COUNT(*) FILTER (WHERE published)::int AS published
                    FROM courses`),
        pool.query(`SELECT COUNT(*)::int AS enrollments,
                           COALESCE(ROUND(AVG(progress)),0)::int AS avg_progress,
                           COUNT(*) FILTER (WHERE progress=100)::int AS completed
                    FROM enrollments`),
        pool.query(`SELECT c.id,c.title,c.category,COUNT(e.user_id)::int AS n
                    FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id
                    GROUP BY c.id ORDER BY n DESC,c.title LIMIT 5`),
        pool.query(`SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC LIMIT 5`)
      ]);
      res.json({ ...a.rows[0], ...b.rows[0], ...c.rows[0], top: d.rows, recent: e.rows });
    } catch (err) { next(err); }
  });

  r.get("/courses", async (req, res, next) => {
    try {
      const q = await pool.query(
        `SELECT c.id,c.title,c.slug,c.description,c.level,c.category,c.duration_hours,c.published,c.created_at,
                COUNT(e.user_id)::int AS enrolled
         FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id
         GROUP BY c.id ORDER BY c.created_at DESC LIMIT 500`
      );
      res.json({ courses: q.rows });
    } catch (e) { next(e); }
  });

  r.post("/courses", requireCsrf, async (req, res, next) => {
    try {
      const d = courseCreate.parse(req.body);
      const q = await pool.query(
        `INSERT INTO courses(title,slug,description,level,category,duration_hours,published)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,title,slug`,
        [d.title, d.slug, d.description, d.level, d.category, d.duration_hours, d.published ?? true]
      );
      await audit(req, "course.create", q.rows[0].title, { id: q.rows[0].id });
      res.status(201).json({ course: q.rows[0] });
    } catch (e) { fail(res, e, next); }
  });

  r.patch("/courses/:id", requireCsrf, async (req, res, next) => {
    try {
      const cid = id.parse(req.params.id);
      const d = courseUpdate.parse(req.body);
      const { f, v } = build(d, ["title", "slug", "description", "level", "category", "duration_hours", "published"]);
      if (!f.length) return res.status(400).json({ error: "Nothing to update" });
      v.push(cid);
      const q = await pool.query(`UPDATE courses SET ${f.join(",")} WHERE id=$${v.length} RETURNING id,title`, v);
      if (!q.rowCount) return res.status(404).json({ error: "Course not found" });
      await audit(req, "course.update", q.rows[0].title, { id: cid, fields: Object.keys(d) });
      res.json({ ok: true });
    } catch (e) { fail(res, e, next); }
  });

  r.delete("/courses/:id", requireCsrf, async (req, res, next) => {
    try {
      const cid = id.parse(req.params.id);
      const q = await pool.query("DELETE FROM courses WHERE id=$1 RETURNING title", [cid]);
      if (!q.rowCount) return res.status(404).json({ error: "Course not found" });
      await audit(req, "course.delete", q.rows[0].title, { id: cid });
      res.json({ ok: true });
    } catch (e) { fail(res, e, next); }
  });

  r.get("/users", async (req, res, next) => {
    try {
      const p = page.parse(req.query.page);
      const s = text.parse(req.query.q);
      const role = req.query.role === "admin" || req.query.role === "student" ? req.query.role : null;
      const lim = 15;
      const like = `%${s.replace(/[\\%_]/g, m => "\\" + m)}%`;
      const where = "WHERE (u.name ILIKE $1 OR u.email ILIKE $1) AND ($2::text IS NULL OR u.role=$2)";
      const [rows, cnt] = await Promise.all([
        pool.query(
          `SELECT u.id,u.name,u.email,u.role,u.disabled,u.created_at,
                  (SELECT COUNT(*)::int FROM enrollments e WHERE e.user_id=u.id) AS enrolled
           FROM users u ${where}
           ORDER BY u.created_at DESC LIMIT $3 OFFSET $4`,
          [like, role, lim, (p - 1) * lim]
        ),
        pool.query(`SELECT COUNT(*)::int AS n FROM users u ${where}`, [like, role])
      ]);
      res.json({ users: rows.rows, total: cnt.rows[0].n, page: p, pages: Math.max(1, Math.ceil(cnt.rows[0].n / lim)) });
    } catch (e) { next(e); }
  });

  const userCreate = z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(160).transform(v => v.toLowerCase()),
    password: passwordRule,
    role: z.enum(["student", "admin"])
  });

  r.post("/users", requireCsrf, async (req, res, next) => {
    try {
      const d = userCreate.parse(req.body);
      const hash = await bcrypt.hash(d.password, 12);
      const q = await pool.query(
        "INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,email",
        [d.name, d.email, hash, d.role]
      );
      await audit(req, "user.create", q.rows[0].email, { id: q.rows[0].id, role: d.role });
      res.status(201).json({ ok: true });
    } catch (e) { fail(res, e, next); }
  });

  const userUpdate = z.object({
    name: z.string().trim().min(2).max(80),
    role: z.enum(["student", "admin"]),
    disabled: z.boolean()
  }).partial().strict();

  r.patch("/users/:id", requireCsrf, async (req, res, next) => {
    try {
      const uid = id.parse(req.params.id);
      const d = userUpdate.parse(req.body);
      const self = uid === req.session.user.id;
      const cur = await pool.query("SELECT email,role,disabled FROM users WHERE id=$1", [uid]);
      if (!cur.rowCount) return res.status(404).json({ error: "User not found" });
      const t = cur.rows[0];
      const losesAdmin = t.role === "admin" && ((d.role && d.role !== "admin") || d.disabled === true);
      if (self && losesAdmin) return res.status(400).json({ error: "You can't remove your own admin access" });
      if (losesAdmin && (await otherAdmins(uid)) < 1) {
        return res.status(400).json({ error: "At least one active admin must remain" });
      }
      const { f, v } = build(d, ["name", "role", "disabled"]);
      if (!f.length) return res.status(400).json({ error: "Nothing to update" });
      v.push(uid);
      await pool.query(`UPDATE users SET ${f.join(",")} WHERE id=$${v.length}`, v);
      if (!self && (d.role !== undefined || d.disabled !== undefined)) await killSessions(uid);
      await audit(req, "user.update", t.email, { id: uid, changes: d });
      res.json({ ok: true });
    } catch (e) { fail(res, e, next); }
  });

  r.post("/users/:id/password", requireCsrf, async (req, res, next) => {
    try {
      const uid = id.parse(req.params.id);
      const d = z.object({ password: passwordRule }).strict().parse(req.body);
      const hash = await bcrypt.hash(d.password, 12);
      const q = await pool.query("UPDATE users SET password_hash=$1 WHERE id=$2 RETURNING email", [hash, uid]);
      if (!q.rowCount) return res.status(404).json({ error: "User not found" });
      if (uid !== req.session.user.id) await killSessions(uid);
      await audit(req, "user.password_reset", q.rows[0].email, { id: uid });
      res.json({ ok: true });
    } catch (e) { fail(res, e, next); }
  });

  r.delete("/users/:id", requireCsrf, async (req, res, next) => {
    try {
      const uid = id.parse(req.params.id);
      if (uid === req.session.user.id) return res.status(400).json({ error: "You can't delete your own account" });
      const cur = await pool.query("SELECT email,role,disabled FROM users WHERE id=$1", [uid]);
      if (!cur.rowCount) return res.status(404).json({ error: "User not found" });
      const t = cur.rows[0];
      if (t.role === "admin" && !t.disabled && (await otherAdmins(uid)) < 1) {
        return res.status(400).json({ error: "At least one active admin must remain" });
      }
      await pool.query("DELETE FROM users WHERE id=$1", [uid]);
      await killSessions(uid);
      await audit(req, "user.delete", t.email, { id: uid });
      res.json({ ok: true });
    } catch (e) { fail(res, e, next); }
  });

  r.get("/enrollments", async (req, res, next) => {
    try {
      const p = page.parse(req.query.page);
      const s = text.parse(req.query.q);
      const cid = req.query.course_id ? id.catch(0).parse(req.query.course_id) : 0;
      const lim = 15;
      const like = `%${s.replace(/[\\%_]/g, m => "\\" + m)}%`;
      const where = `WHERE (u.name ILIKE $1 OR u.email ILIKE $1) AND ($2::bigint=0 OR e.course_id=$2)`;
      const base = `FROM enrollments e JOIN users u ON u.id=e.user_id JOIN courses c ON c.id=e.course_id ${where}`;
      const [rows, cnt] = await Promise.all([
        pool.query(
          `SELECT e.user_id,e.course_id,e.progress,e.enrolled_at,u.name,u.email,c.title
           ${base} ORDER BY e.updated_at DESC LIMIT $3 OFFSET $4`,
          [like, cid, lim, (p - 1) * lim]
        ),
        pool.query(`SELECT COUNT(*)::int AS n ${base}`, [like, cid])
      ]);
      res.json({ enrollments: rows.rows, total: cnt.rows[0].n, page: p, pages: Math.max(1, Math.ceil(cnt.rows[0].n / lim)) });
    } catch (e) { next(e); }
  });

  r.post("/enrollments", requireCsrf, async (req, res, next) => {
    try {
      const d = z.object({ user_id: id, course_id: id }).strict().parse(req.body);
      await pool.query(
        "INSERT INTO enrollments(user_id,course_id,progress) VALUES($1,$2,0) ON CONFLICT DO NOTHING",
        [d.user_id, d.course_id]
      );
      await audit(req, "enrollment.create", `user ${d.user_id} -> course ${d.course_id}`);
      res.status(201).json({ ok: true });
    } catch (e) { fail(res, e, next); }
  });

  r.patch("/enrollments/:uid/:cid", requireCsrf, async (req, res, next) => {
    try {
      const uid = id.parse(req.params.uid);
      const cid = id.parse(req.params.cid);
      const d = z.object({ progress: z.coerce.number().int().min(0).max(100) }).strict().parse(req.body);
      const q = await pool.query(
        "UPDATE enrollments SET progress=$1,updated_at=NOW() WHERE user_id=$2 AND course_id=$3 RETURNING 1",
        [d.progress, uid, cid]
      );
      if (!q.rowCount) return res.status(404).json({ error: "Enrollment not found" });
      await audit(req, "enrollment.progress", `user ${uid} / course ${cid}`, { progress: d.progress });
      res.json({ ok: true });
    } catch (e) { fail(res, e, next); }
  });

  r.delete("/enrollments/:uid/:cid", requireCsrf, async (req, res, next) => {
    try {
      const uid = id.parse(req.params.uid);
      const cid = id.parse(req.params.cid);
      const q = await pool.query("DELETE FROM enrollments WHERE user_id=$1 AND course_id=$2", [uid, cid]);
      if (!q.rowCount) return res.status(404).json({ error: "Enrollment not found" });
      await audit(req, "enrollment.delete", `user ${uid} / course ${cid}`);
      res.json({ ok: true });
    } catch (e) { fail(res, e, next); }
  });

  r.get("/audit", async (req, res, next) => {
    try {
      const p = page.parse(req.query.page);
      const lim = 20;
      const [rows, cnt] = await Promise.all([
        pool.query(
          "SELECT id,admin_email,action,target,detail,created_at FROM admin_audit ORDER BY created_at DESC,id DESC LIMIT $1 OFFSET $2",
          [lim, (p - 1) * lim]
        ),
        pool.query("SELECT COUNT(*)::int AS n FROM admin_audit")
      ]);
      res.json({ logs: rows.rows, total: cnt.rows[0].n, page: p, pages: Math.max(1, Math.ceil(cnt.rows[0].n / lim)) });
    } catch (e) { next(e); }
  });

  return r;
}

module.exports = adminRouter;
