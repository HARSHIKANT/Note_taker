import { Plus, Loader2, BookOpen, EyeOff, Eye, Users, Trash2 } from "lucide-react";
import { Lecture } from "./types";

interface LecturesViewProps {
    selectedSubject: string;
    lectures: Lecture[];
    loading: boolean;
    onNewLecture: () => void;
    onTogglePublish: (lecture: Lecture) => Promise<void>;
    onViewSubmissions: (lecture: Lecture) => void;
    onDeleteLecture: (id: string) => Promise<void>;
}

export function LecturesView({
    selectedSubject,
    lectures,
    loading,
    onNewLecture,
    onTogglePublish,
    onViewSubmissions,
    onDeleteLecture
}: LecturesViewProps) {
    return (
        <>
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-white">{selectedSubject}</h2>
                <button
                    onClick={onNewLecture}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
                >
                    <Plus className="w-4 h-4" />
                    New Lecture
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-neutral-500" />
                </div>
            ) : lectures.length === 0 ? (
                <div className="text-center py-16 space-y-3">
                    <BookOpen className="w-12 h-12 text-neutral-600 mx-auto" />
                    <p className="text-neutral-400">No lectures yet</p>
                    <p className="text-sm text-neutral-600">Upload a lecture recording to get started.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {lectures.map((lec) => (
                        <div
                            key={lec.id}
                            className="p-4 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-3"
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="font-semibold text-white">{lec.title}</h3>
                                    <p className="text-xs text-neutral-500 mt-1">
                                        Class {lec.class} • {new Date(lec.created_at).toLocaleDateString()}
                                    </p>
                                </div>
                                <span
                                    className={`text-xs px-2 py-1 rounded-lg font-medium ${lec.published
                                        ? "bg-green-500/10 text-green-400"
                                        : "bg-neutral-800 text-neutral-400"
                                        }`}
                                >
                                    {lec.published ? "Published" : "Draft"}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => onTogglePublish(lec)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${lec.published
                                        ? "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                                        : "bg-green-600/20 text-green-400 hover:bg-green-600/30"
                                        }`}
                                >
                                    {lec.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    {lec.published ? "Unpublish" : "Publish"}
                                </button>
                                <button
                                    onClick={() => onViewSubmissions(lec)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
                                >
                                    <Users className="w-3.5 h-3.5" />
                                    View Notes
                                </button>
                                <button
                                    onClick={() => onDeleteLecture(lec.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/10 text-red-400 hover:bg-red-600/20 transition-colors"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
}
