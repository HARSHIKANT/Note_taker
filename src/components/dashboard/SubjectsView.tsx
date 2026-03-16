import { BookOpen, Atom, FlaskConical, Calculator } from "lucide-react";
import { SUBJECTS } from "@/lib/types";

const SUBJECT_ICONS: Record<string, any> = {
    Physics: Atom,
    Chemistry: FlaskConical,
    Math: Calculator,
};

interface SubjectsViewProps {
    onSelectSubject: (subject: string) => void;
}

export function SubjectsView({ onSelectSubject }: SubjectsViewProps) {
    return (
        <>
            <h2 className="text-2xl font-bold text-white">My Subjects</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {SUBJECTS.map((sub) => {
                    const Icon = SUBJECT_ICONS[sub] || BookOpen;
                    return (
                        <button
                            key={sub}
                            onClick={() => onSelectSubject(sub)}
                            className="group p-6 rounded-2xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 transition-all text-left hover:shadow-lg hover:shadow-blue-500/5"
                        >
                            <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
                                <Icon className="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-white">{sub}</h3>
                        </button>
                    );
                })}
            </div>
        </>
    );
}
