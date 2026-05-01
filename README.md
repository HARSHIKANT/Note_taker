# 📓 NoteTaker AI — by Harshikant Dubey

A **production-grade, AI-powered classroom platform** that combines note grading, live speech transcription, and teacher performance analytics in a single multi-role web application.

---

## 🎯 What it Does

| Role | Core Capability |
|---|---|
| 👨‍🎓 **Student** | Upload handwritten note photos → get an AI-generated score + feedback against the teacher's lecture |
| 👩‍🏫 **Teacher** | Publish lectures, view class insights, monitor personal analytics |
| 👑 **Head Teacher** | Audit all teachers school-wide, manage the roster and courses, view ranked leaderboards |

---

## ✨ Feature Breakdown

### 👨‍🎓 Student
- **Google OAuth** login with role & class/course onboarding
- **Camera or Gallery Upload** — multi-photo of handwritten notes directly from mobile browser
- **Multi-page OCR** — all pages sent to Gemini in a single request for coherent extraction  
- **AI Grading Engine** — notes scored 0–100% against the lecture transcript, with full breakdowns of covered vs. missed topics
- **AI Detection** — forensic analysis flags whether notes appear to be AI-generated or human-written

### 👩‍🏫 Teacher
- **New Lecture: 3 Input Modes**
  - 📁 **Upload Recording** — upload audio/video; transcribed via chunked Gemini File Manager (bypasses Vercel 4.5 MB limit)
  - 🎙️ **Live Dictation** (Web Speech API) — real-time browser-native transcription, read-only locked to preserve integrity
  - ✏️ **Manual Entry** — type or paste transcript directly
- **Publish Control** — lectures can be saved as drafts or published to a target class/course
- **Submissions Board** — per-student score cards with OCR preview, AI feedback, and AI-detection probability
- **Class Insights (AI Aggregated)**
  - Average score & score distribution chart (Recharts)
  - *Most Missed Concepts* — Gemini aggregates all students' missing topics and surfaces the top 3–5 class-wide knowledge gaps
- **Personal Analytics Dashboard** — per-lecture stats including Content Quality score, Interaction %, tone severity flags, and safety alerts
- **Gemini API Key Settings** — each teacher supplies their own key (stored per user, used server-side), eliminating shared quota issues

### 👑 Head Teacher (Admin)
- **Hybrid Course Management** — create named courses that address specific class subgroups
- **Bulk Roster Upload** — drag & drop a CSV to add hundreds of students/teachers instantly; PapaParse parses client-side with live validation and error preview before submission
- **School-Wide Analytics Dashboard**
  - Summary stat cards: Total Lectures, School Avg Content Quality, School Avg Interaction %, Safety Flags
  - **Teacher Leaderboard** with ranked sorting (toggle: Content Quality ↔ Student Interaction)
  - 🥇🥈🥉 Gold/Silver/Bronze medal badges for top-3 ranked teachers
  - Per-teacher drill-down: lecture-by-lecture breakdown with interaction bar and safety indicators
- **Unregistered User Screen** — users not on the institute roster see a blocked access prompt

---

## 🤖 AI Architecture

### Model Fallback Chain
All Gemini calls use a **3-tier fallback chain** with automatic retries to handle rate limits:
```
gemini-2.5-flash → gemini-3-flash-preview → gemini-3.1-flash-lite-preview
                       ↑ Wait 20s between retry rounds ↑
```
Up to 3 rounds with 0s / 20s / 40s waits before the final error is raised.

### Pipeline 1 — Student Notes Grading
```
Student uploads photos
  → Images uploaded to Google Drive (Notes/Subject/LectureTitle/) via /api/bulk-upload
  → Supabase uploads record created (ocr_status: pending, status: pending)
  → Gemini Call 1 — ocrImageFromDrive(): all images in ONE request → OCR text extraction
  → Gemini Call 2 — compareNotesWithLecture(): compares OCR text vs. lecture transcript
      + AI Detection forensic analysis (aiProbability, humanProbability, explanation)
  → Score (0–100%), ai_feedback, ai_probability, human_probability, ai_explanation saved to uploads
  → Teacher views aggregated missing concepts (POST /api/lectures/generate-insights on demand)
```

### Pipeline 2 — Lecture Content Audit
```
Teacher creates lecture
  → Mode A: Audio/video → upload to Supabase Storage → transfer to Gemini File Manager → chunked transcription
  → Mode B: Web Speech API live dictation → auto-restarts on silence, flushes interim on stop
  → Mode C: Manual text entry
  → Teacher publishes lecture
  → POST /api/lectures/analyze-text → analyzeTranscriptText()
  → Gemini infers teacher/student turns from context (no labels required)
  → Returns: Student Interaction %, Content Quality score (5 sub-dimensions), Tone & Safety analysis
  → Results persisted to lectures.audio_insights (JSONB)
  → Head Teacher leaderboard auto-updated on next load
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1.6 (App Router) |
| Auth | NextAuth.js v5 (Google OAuth) |
| Database | Supabase (PostgreSQL) |
| File Storage | Supabase Storage (recordings), Google Drive API (notes) |
| AI | Google Gemini 2.5 Flash (OCR, Transcription, Grading, Analytics) |
| Live Transcription | Web Speech API (browser-native, Chrome/Edge) |
| Image Processing | Sharp |
| CSV Parsing | PapaParse |
| Charts | Recharts |
| Analytics | Vercel Analytics |

---

## 🗄️ Database Schema

### `users`
```sql
CREATE TABLE users (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email            TEXT UNIQUE NOT NULL,
  name             TEXT,
  role             TEXT CHECK (role IN ('student', 'teacher')), -- head_teachers have role='teacher' and is_head_teacher=true
  class            TEXT,                    -- '5'–'10', students enrolled in a class
  institute_id     TEXT,                    -- links user to an institute roster
  is_head_teacher  BOOLEAN DEFAULT FALSE,   -- indicates if the user is a head teacher
  avatar_url       TEXT,                    -- profile picture from Google
  assigned_subjects TEXT[],                 -- subjects assigned to a teacher
  enrolled_courses TEXT[],                  -- custom courses a student is enrolled in
  gemini_api_key   TEXT,                    -- per-teacher Gemini API key (encrypted at rest)
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### `institutes`
```sql
CREATE TABLE institutes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `institute_members`
```sql
-- Pre-approved allow-list; bulk or manually added by Head Teacher
CREATE TABLE institute_members (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  institute_id  TEXT NOT NULL,
  email         TEXT NOT NULL,
  role          TEXT CHECK (role IN ('student', 'teacher', 'head_teacher')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(institute_id, email)
);
```

### `courses`
```sql
-- Simple named course entities, scoped to an institute.
-- Enrollment is tracked via users.enrolled_courses (UUID[]) and users.assigned_subjects.
-- There is no separate course_members junction table.
CREATE TABLE courses (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,              -- e.g. "Advanced Physics Batch A"
  institute_id  TEXT,                       -- scoped to a specific institute
  created_by    UUID REFERENCES users(id),  -- head teacher who created it
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `lectures`
```sql
CREATE TABLE lectures (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id                UUID REFERENCES users(id),
  institute_id              TEXT,                           -- links to the institute
  course_id                 UUID REFERENCES courses(id),    -- NULL for standard class lectures
  title                     TEXT NOT NULL,
  subject                   TEXT,                           -- NULL for course-based lectures
  class                     TEXT,                           -- NULL for course-based lectures
  content                   TEXT NOT NULL,                  -- transcript (hidden from students)
  recording_file_id         TEXT,                           -- ID of the uploaded recording file
  published                 BOOLEAN DEFAULT FALSE,
  audio_insights            JSONB,                          -- AI lecture audit results (see below)
  ai_detection_insights     JSONB,                          -- aggregated AI-detection metrics for the class
  insights                  JSONB,                          -- aggregated class-wide missing topics
  insights_last_generated_at TIMESTAMPTZ,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);
```

**`audio_insights` JSONB shape:**
```json
{
  "student_interaction_percentage": 18,
  "abusive_language_detected": false,
  "abusive_language_details": null,
  "class_tone": "Engaging and structured",
  "key_interactions_summary": "Students asked 4 questions about Newton's second law.",
  "content_quality": {
    "overall_score": 76,
    "explanation_quality":  { "score": 8, "note": "..." },
    "title_relevance":      { "score": 9, "note": "..." },
    "content_correctness":  { "score": 7, "note": "..." },
    "depth_and_coverage":   { "score": 6, "note": "..." },
    "engagement_style":     { "score": 5, "note": "..." }
  },
  "tone_analysis": {
    "harsh_language":       { "detected": false, "severity": null, "examples": [] },
    "emotional_statements": { "detected": true,  "severity": "low", "examples": ["..."] },
    "negative_statements":  { "detected": false, "severity": null, "examples": [] }
  }
}
```

> **Note:** `content_quality` and `tone_analysis` may be `null` if the AI analysis step fails (e.g. JSON parse error after Gemini response). Always check for null before rendering these fields.

### `uploads`
```sql
CREATE TABLE uploads (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id        UUID REFERENCES users(id),
  student_email     TEXT,
  lecture_id        UUID REFERENCES lectures(id),
  subject           TEXT,
  file_id           TEXT,          -- JSON array of Google Drive file IDs
  ocr_text          TEXT,
  match_score       REAL,          -- 0–100
  ai_feedback       TEXT,          -- JSON: { score, feedback, covered[], missing[] }
  ai_probability    REAL,          -- 0-100 probability that the notes are AI generated
  human_probability REAL,          -- 0-100 probability that the notes are human generated
  ai_explanation    TEXT,          -- reasoning for the AI vs Human probability
  status            TEXT DEFAULT 'pending',    -- legacy status field (written by /api/upload single-file route)
  ocr_status        TEXT DEFAULT 'pending',   -- 'pending' | 'processing' | 'completed' | 'failed'
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🗂️ Project Structure

```
src/
├── app/
│   ├── page.tsx                             # Root router by role — renders LandingHero / StudentDashboard / TeacherDashboard
│   ├── role-select/page.tsx                 # Onboarding: pick class, subjects, and/or custom courses
│   ├── register-institute/page.tsx          # Standalone institute creation page (sets creator as Head Teacher)
│   └── api/
│       ├── analytics/teachers/              # GET school-wide lecture analytics (Head Teacher)
│       ├── auth/[...nextauth]/              # NextAuth Google OAuth handler
│       ├── bulk-upload/                     # Primary multi-file upload → Google Drive (lecture-linked; creates Notes/Subject/LectureTitle/ folder hierarchy)
│       ├── courses/                         # CRUD for hybrid courses
│       ├── institutes/                      # Institute registration & lookup
│       ├── lectures/
│       │   ├── route.ts                     # GET/POST/PATCH/DELETE lectures
│       │   ├── analyze-text/               # Run AI audit on a text transcript
│       │   ├── generate-insights/          # Aggregate class-wide missed topics
│       │   ├── transcribe/                 # POST: upload recording to Gemini File Manager; DELETE: cleanup from Supabase + Gemini after all chunks transcribed
│       │   └── upload-audio/               # Generate Supabase Storage pre-signed URL
│       ├── ocr/                             # Multi-image OCR + AI grading endpoint
│       ├── roster/
│       │   ├── route.ts                     # View/manage individual roster members
│       │   └── bulk/                        # Bulk CSV roster upload (upsert)
│       ├── student-uploads/                 # Student: fetch own submissions
│       ├── submissions/
│       │   ├── route.ts                     # Teacher: view all student submissions
│       │   └── insights/                    # GET: fetch pre-computed insights (use /api/lectures/generate-insights to re-run)
│       ├── upload/                          # Legacy single-file upload to Google Drive (2-level folder: Notes/Subject/)
│       └── user/
│           ├── me/                          # Get current user profile
│           ├── role/                        # Set role + class on first sign-in
│           └── settings/                   # PATCH Gemini API key per user
├── components/
│   ├── LandingHero.tsx                      # Public landing page
│   ├── StudentDashboard.tsx                 # Full student UI
│   ├── TeacherDashboard.tsx                 # Teacher UI shell + nav
│   ├── ApiKeyModal.tsx                      # Gemini API key entry modal
│   ├── UnregisteredScreen.tsx               # Shown when email not on roster
│   ├── UploadDashboard.tsx                  # Student note upload flow
│   └── dashboard/
│       ├── NewLectureView.tsx               # Create lecture (3 input modes incl. Live Dictation)
│       ├── LecturesView.tsx                 # Teacher's lecture list
│       ├── SubjectsView.tsx                 # Subject and course selection
│       ├── SubmissionsView.tsx              # Student submissions + class insights (Recharts)
│       ├── TeacherAnalyticsView.tsx         # Personal teacher analytics (per-lecture breakdown)
│       ├── HeadTeacherAnalyticsView.tsx     # School-wide analytics + leaderboard
│       ├── RosterManagement.tsx             # Bulk/manual roster upload, member management
│       └── types.ts                         # Local types for dashboard components (AudioInsights, LectureWithInsights)
└── lib/
    ├── auth.ts                              # NextAuth config, session shape, isHeadTeacher flag
    ├── google-ai.ts                         # Gemini helpers: OCR, transcription, grading, analytics (AudioInsights type)
    ├── supabase.ts                          # Supabase anon client
    └── types.ts                             # ExtendedSession types (LectureWithInsights is in components)
```

---

## ⚙️ Environment Variables

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
SUPABASE_SERVICE_ROLE_KEY=          # Required for admin (roster, analytics) operations

# Drive file sharing (owner email for Drive permissions)
OWNER_EMAIL=
```

> **Note:** Each teacher enters their own **Gemini API key** in-app (via Settings). The key is stored to `users.gemini_api_key` and used server-side. No shared `GEMINI_API_KEY` env var is required for AI features.

---

## 🚀 Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Set up .env.local (see above)

# 3. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## 📁 Google Drive / Supabase Storage Structure

**Student notes** (Google Drive):
```
Notes/
└── [Subject]/
    └── [Lecture Title]/
        ├── note_1.jpg
        └── note_2.jpg
```

**Lecture recordings** (Supabase Storage — `recordings` bucket):
```
recordings/
└── [timestamp]_[safeName].(mp3|mp4|wav|...)
```
Recordings are deleted from both Supabase Storage and the Gemini File Manager via `DELETE /api/lectures/transcribe` (triggered by the client after all audio chunks are successfully transcribed) to protect privacy.
