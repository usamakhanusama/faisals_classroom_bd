# Faisal’s Classroom — Bangladesh-Focused Secure EdTech Platform

A minimal premium learning platform designed for Bangladeshi students.

## Target learners

- SSC
- HSC
- University / Engineering Admission
- Programming beginners
- CSE students
- Web development learners

## Included

- Student registration / login / logout
- PostgreSQL database
- Secure server-side sessions
- HttpOnly / SameSite cookies
- CSRF protection
- bcrypt password hashing
- Zod validation
- Helmet / Content Security Policy
- API rate limiting
- Admin panel at `/admin` (courses, students, enrollments, activity log)
- Admin-protected API routes
- Course enrollment
- Student dashboard
- Course progress tracking
- Bangladesh-focused seeded courses
- Dockerfile
- Render deployment blueprint
- Responsive minimal premium UI

## Brand

**Faisal’s Classroom**  
**Tagline:** Learn. Practice. Grow.

The visual direction is intentionally minimal and academic:
- white / soft gray foundation
- deep teal primary color
- restrained gold accent
- clean typography
- no distracting gaming-style visual effects
- Bengali-friendly font support

## Local setup

1. Install PostgreSQL and create a database.

2. Copy:

```cmd
copy .env.example .env
```

3. Update `.env`:
- `DATABASE_URL`
- `SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`

4. Install dependencies:

```cmd
npm install
```

5. Initialize database:

```cmd
npm run db:init
```

6. Run:

```cmd
npm start
```

Open:

`http://localhost:3000`

## Admin panel

Open `/admin` (for example `http://localhost:3000/admin`) and sign in with the admin account.

The first admin is created automatically on startup from `ADMIN_EMAIL` and `ADMIN_PASSWORD`
(password must be 12+ characters). If that email already exists, nothing is overwritten.
`npm run db:init` also creates or resets that admin.

What an admin can do:
- Overview: users, courses, enrollments, average progress, top courses
- Courses: create, edit, publish or hide, delete
- Students: search, add, make admin or student, disable or enable, reset password, delete
- Enrollments: enroll a student, set progress, remove
- Activity: audit log of every admin action (passwords are never logged)

Security built in:
- Every admin API call re-checks the admin role in the database, not only the session
- Role change, disable, password reset and delete sign that user out everywhere
- You cannot demote, disable or delete yourself, and the last active admin is protected
- CSRF token on every change, strict Zod validation, parameterized SQL, paginated lists
- Login allows 10 failed attempts per 15 minutes per IP, admin API is rate limited
- `/admin` is marked noindex

After the first login, remove `ADMIN_PASSWORD` from your hosting environment variables.
Turn on admin MFA before real students use the platform.

Note: `npm run db:init` re-adds the 6 seeded courses if you deleted them.

## Production deployment

The included `render.yaml` can deploy:
- Node.js web service
- PostgreSQL database

Before going public, also add:
- email verification
- password reset
- admin MFA
- automated backups
- logging / monitoring
- privacy policy and terms
- payment integration if selling courses
- video storage / streaming if hosting lessons

No public application is completely secure from code alone; production security also depends on infrastructure, secrets, monitoring and operational practices.
