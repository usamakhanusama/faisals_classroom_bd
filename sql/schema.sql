
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courses (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  slug VARCHAR(120) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  level VARCHAR(20) NOT NULL CHECK (level IN ('Beginner','Intermediate','Advanced')),
  category VARCHAR(80) NOT NULL,
  duration_hours INTEGER NOT NULL CHECK(duration_hours > 0),
  published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS enrollments (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(user_id,course_id)
);

INSERT INTO courses(title,slug,description,level,category,duration_hours,published)
VALUES
('SSC ICT Complete Course','ssc-ict-complete','SSC শিক্ষার্থীদের জন্য ICT-এর গুরুত্বপূর্ণ chapter, concept, CQ/MCQ practice এবং exam-focused preparation.','Beginner','SSC',26,true),
('HSC ICT & Programming Basics','hsc-ict-programming','HSC ICT syllabus অনুযায়ী programming basics, number system, logic gate, database এবং practical concepts.','Intermediate','HSC',34,true),
('University Admission ICT & CSE Basics','admission-ict-cse','Engineering ও university admission-এর জন্য ICT, basic programming, logic, problem solving এবং computer fundamentals.','Intermediate','Admission',30,true),
('C Programming Fundamentals','c-programming-fundamentals','C programming, variables, loops, arrays, functions, pointers এবং problem solving-এর structured foundation.','Beginner','Programming',28,true),
('Data Structures & Algorithms','data-structures-algorithms','University-level DSA: arrays, linked lists, stacks, queues, trees, graphs, sorting, searching এবং complexity analysis.','Advanced','CSE',44,true),
('Web Development Basics','web-development-basics','HTML, CSS ও JavaScript দিয়ে responsive website তৈরির practical beginner-friendly course.','Beginner','Web Development',32,true)
ON CONFLICT(slug) DO NOTHING;
