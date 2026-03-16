export interface Lecture {
    id: string;
    title: string;
    subject: string;
    class: string;
    content: string;
    recording_file_id: string | null;
    published: boolean;
    created_at: string;
}

export interface Submission {
    id: string;
    student_name: string;
    student_email: string;
    match_score: number | null;
    ocr_status: string;
    ai_feedback: string;
    ai_probability: number | null;
    human_probability: number | null;
    ai_explanation: string | null;
    created_at: string;
}
