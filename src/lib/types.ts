import { Session } from "next-auth";
import { JWT } from "next-auth/jwt";

export const CLASSES = ["5", "6", "7", "8", "9", "10"] as const;
export const SUBJECTS = ["Physics", "Chemistry", "Math"] as const;

export type ClassValue = (typeof CLASSES)[number];
export type SubjectValue = (typeof SUBJECTS)[number];

export interface ExtendedSession extends Session {
    accessToken?: string;
    error?: string;
    userId?: string;
    role?: "student" | "teacher" | null;
    class?: ClassValue | null;
    isHeadTeacher?: boolean;
    geminiApiKey?: string | null;
    enrolledCourses?: string[] | null;  // array of course UUIDs, for course-based students
}

export interface ExtendedToken extends JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
    userId?: string;
    role?: "student" | "teacher" | null;
    class?: ClassValue | null;
    isHeadTeacher?: boolean;
    geminiApiKey?: string | null;
    enrolledCourses?: string[] | null;
}
