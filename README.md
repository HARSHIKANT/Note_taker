# 📓 NoteTaker AI BY Harshikant Dubey

An AI-powered note-taking assistant for classrooms. Students upload photos of their handwritten notes; the system uses **Gemini 2.5 Flash** to extract text via OCR, then intelligently compares those notes against the teacher's lecture transcript and grades them.

---

## ✨ Features

### 👨‍🎓 Student Side
- **Google OAuth Login** with role & class selection on first sign-in
- **Camera / Gallery upload** — take multiple photos of handwritten notes directly from a mobile browser
- **Multi-page OCR** — all uploaded pages are sent to Gemini in a single request for cohesive, accurate extraction
- **AI-powered grading** — notes are compared against the teacher's lecture transcript; a 0–100% match score is returned with detailed feedback (covered topics + missed topics)

### 👩‍🏫 Teacher Side
- **Upload lecture recordings** (audio/video) — auto-transcribed via Gemini
- **Editable transcript + Publish to class** — control which classes see which lectures
- **Student submissions board** — view individual student scores and their AI feedback
- **Class Insights Dashboard** — built with Recharts:
  - Average class score and score distribution bar chart
  - *Most Missed Concepts* — Gemini aggregates all students' missed topics and returns the top knowledge gaps for the teacher to address in the next class

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 14](https://nextjs.org) (App Router) |
| Auth | [NextAuth.js](https://next-auth.js.org) (Google OAuth) |
| Database | [Supabase](https://supabase.com) (PostgreSQL) |
| AI / OCR | [Google Gemini 2.5 Flash](https://ai.google.dev) |
| File Storage | Google Drive API |
| Image Processing | [Sharp](https://sharp.pixelplumbing.com) |
| Charts | [Recharts](https://recharts.org) |

---

## 🗂️ Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Root: routes by role
│   ├── role-select/page.tsx        # Onboarding: pick role + class
│   └── api/
│       ├── bulk-upload/            # Upload files to Google Drive
│       ├── lectures/               # CRUD + publish lectures
│       │   └── transcribe/         # Audio/video transcription
│       ├── ocr/                    # Multi-image OCR + AI grading
│       ├── submissions/            # Teacher: view all student submissions
│       │   └── insights/           # Class-wide analytics + AI missed concepts
│       ├── student-uploads/        # Student: view their own submissions
│       └── user/role/              # Set user role + class on first sign-in
├── components/
│   ├── StudentDashboard.tsx        # Student UI
│   └── TeacherDashboard.tsx        # Teacher UI (with Recharts insights)
└── lib/
    ├── auth.ts                     # NextAuth config + session management
    ├── google-ai.ts                # Gemini OCR, transcription & comparison helpers
    ├── supabase.ts                 # Supabase client
    └── types.ts                    # Extended session types
```

---

## 🗄️ Database Schema

```sql
-- users: students and teachers
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT CHECK (role IN ('student', 'teacher')),
  class TEXT,       -- '5'-'10', students only
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- lectures: published by teachers
CREATE TABLE lectures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  subject TEXT NOT NULL,           -- 'Physics', 'Chemistry', 'Math'
  class TEXT NOT NULL,             -- target class
  content TEXT NOT NULL,           -- transcript (hidden from students)
  published BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- uploads: student note photo submissions
CREATE TABLE uploads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES users(id),
  student_email TEXT,
  lecture_id UUID REFERENCES lectures(id),
  subject TEXT,
  file_id TEXT,                    -- JSON array of Google Drive IDs
  ocr_text TEXT,
  match_score REAL,                -- 0-100
  ai_feedback TEXT,                -- JSON: { score, feedback, covered, missing }
  ocr_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ⚙️ Environment Variables

Create a `.env.local` file in the project root:

```env
# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Google Gemini
GEMINI_API_KEY=

# Drive file sharing (owner email for Drive permissions)
OWNER_EMAIL=
```

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables (see above)

# 3. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📁 Google Drive Structure

Uploaded notes are automatically organized under the authenticated user's Drive:

```
Notes/
└── [Subject]/          e.g. Physics/
    └── [Lecture Title]/    e.g. Newton's Laws/
        ├── note_1.jpg
        └── note_2.jpg
```

---

## 📝 AI Pipeline

```
Student uploads 1+ images for a lecture
  → All images uploaded to Google Drive (Notes/Subject/Topic/ folder)
  → Single Supabase record created for the submission batch
  → All images sent to Gemini 2.5 Flash in ONE request
  → Gemini extracts & structures the OCR text across all pages
  → Gemini compares notes vs. lecture transcript
  → Score (0-100%) + feedback saved to Supabase
  → Teacher can view insights: avg score, distribution chart, most missed concepts
```
