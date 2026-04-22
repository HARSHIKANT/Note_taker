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
  → Images uploaded to Google Drive (Notes/Subject/Topic/)
  → Supabase record created (status: pending)
  → All images sent to Gemini in ONE request → OCR extraction
  → Same model call: compares notes vs. lecture transcript
  → AI Detection forensic analysis (AI vs human probability)
  → Score (0–100%) + feedback JSON saved to uploads table
  → Teacher views aggregated missing concepts (separate API call)
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
| Framework | Next.js 14 (App Router) |
| Auth | NextAuth.js v5 (Google OAuth) |
| Database | Supabase (PostgreSQL) |
| File Storage | Supabase Storage (recordings), Google Drive API (notes) |
| AI | Google Gemini 2.5 Flash (OCR, Transcription, Grading, Analytics) |
| Live Transcription | Web Speech API (browser-native, Chrome/Edge) |
| Image Processing | Sharp |
| CSV Parsing | PapaParse |
| Charts | Recharts |

---

## 🗄️ Database Schema

### `users`
```sql
CREATE TABLE users (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT,
  role          TEXT CHECK (role IN ('student', 'teacher', 'head_teacher')),
  class         TEXT,                    -- '5'–'10', students enrolled in a class
  institute_id  TEXT,                    -- links user to an institute roster
  gemini_api_key TEXT,                   -- per-teacher Gemini API key (encrypted at rest)
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
CREATE TABLE courses (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by    UUID REFERENCES users(id),
  custom_name   TEXT NOT NULL,
  target_class  TEXT NOT NULL,
  subject       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE course_members (
  course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
  user_id   UUID REFERENCES users(id)   ON DELETE CASCADE,
  PRIMARY KEY (course_id, user_id)
);
```

### `lectures`
```sql
CREATE TABLE lectures (
  id                        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id                UUID REFERENCES users(id),
  course_id                 UUID REFERENCES courses(id),    -- NULL for standard class lectures
  title                     TEXT NOT NULL,
  subject                   TEXT NOT NULL,
  class                     TEXT NOT NULL,
  content                   TEXT NOT NULL,                  -- transcript (hidden from students)
  published                 BOOLEAN DEFAULT FALSE,
  audio_insights            JSONB,                          -- AI lecture audit results (see below)
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

### `uploads`
```sql
CREATE TABLE uploads (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id    UUID REFERENCES users(id),
  student_email TEXT,
  lecture_id    UUID REFERENCES lectures(id),
  subject       TEXT,
  file_id       TEXT,          -- JSON array of Google Drive file IDs
  ocr_text      TEXT,
  match_score   REAL,          -- 0–100
  ai_feedback   TEXT,          -- JSON: { score, feedback, covered[], missing[], aiProbability, humanProbability, explanation }
  ocr_status    TEXT DEFAULT 'pending',   -- 'pending' | 'completed' | 'error'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🗂️ Project Structure

```
src/
├── app/
│   ├── page.tsx                             # Root router by role
│   ├── role-select/page.tsx                 # Onboarding: pick role + class
│   └── api/
│       ├── analytics/teachers/              # GET school-wide lecture analytics (Head Teacher)
│       ├── auth/[...nextauth]/              # NextAuth Google OAuth handler
│       ├── bulk-upload/                     # Upload files to Google Drive
│       ├── courses/                         # CRUD for hybrid courses
│       ├── institutes/                      # Institute registration & lookup
│       ├── lectures/
│       │   ├── route.ts                     # GET/POST/PATCH/DELETE lectures
│       │   ├── analyze-text/               # Run AI audit on a text transcript
│       │   ├── generate-insights/          # Aggregate class-wide missed topics
│       │   ├── transcribe/                 # Upload audio to Gemini File Manager
│       │   └── upload-audio/               # Generate Supabase Storage pre-signed URL
│       ├── ocr/                             # Multi-image OCR + AI grading endpoint
│       ├── roster/
│       │   ├── route.ts                     # View/manage individual roster members
│       │   └── bulk/                        # Bulk CSV roster upload (upsert)
│       ├── student-uploads/                 # Student: fetch own submissions
│       ├── submissions/
│       │   ├── route.ts                     # Teacher: view all student submissions
│       │   └── insights/                    # Re-generate class insights on demand
│       ├── upload/                          # Initiate Google Drive upload session
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
│       └── RosterManagement.tsx             # Bulk/manual roster upload, member management
└── lib/
    ├── auth.ts                              # NextAuth config, session shape, isHeadTeacher flag
    ├── google-ai.ts                         # Gemini helpers: OCR, transcription, grading, analytics, model fallback chain
    ├── supabase.ts                          # Supabase anon client
    └── types.ts                             # ExtendedSession, LectureWithInsights, AudioInsights types
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
└── [teacher_id]_[timestamp]_filename.mp3
```
Recordings are deleted from both Supabase Storage and the Gemini File Manager immediately after transcription to protect privacy.
