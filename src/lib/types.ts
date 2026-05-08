export const CLASSES = ["5", "6", "7", "8", "9", "10"] as const;
export const SUBJECTS = ["Physics", "Chemistry", "Math"] as const;

export type ClassValue = (typeof CLASSES)[number];
export type SubjectValue = (typeof SUBJECTS)[number];

// Mirrors the public.users table
export interface AppUser {
    id: string;
    email: string;
    name: string | null;
    avatar_url: string | null;
    role: "student" | "teacher" | null;
    class: ClassValue | null;
    is_head_teacher: boolean;
    gemini_api_key: string | null;
    enrolled_courses: string[] | null;
    institute_id: string | null;
    assigned_subjects: string[] | null;
    google_refresh_token: string | null;
}
