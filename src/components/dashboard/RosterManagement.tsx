"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Plus, Trash2, Pencil, Check, X, Users, Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import Papa from "papaparse";

interface RosterMember {
    id: string;
    email: string;
    role: "student" | "teacher" | "head_teacher";
}

interface BulkRow {
    email: string;
    role: string;
    valid: boolean;
    error?: string;
}

const VALID_ROLES = ["student", "teacher", "head_teacher"];

const ROLE_LABELS: Record<string, string> = {
    student: "Student",
    teacher: "Teacher",
    head_teacher: "Head Teacher",
};

const ROLE_COLORS: Record<string, string> = {
    student: "text-purple-400 bg-purple-500/10 border-purple-500/20",
    teacher: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    head_teacher: "text-amber-400 bg-amber-500/10 border-amber-500/20",
};

function validateRow(row: { email?: string; role?: string }): BulkRow {
    const email = (row.email ?? "").trim().toLowerCase();
    const role = (row.role ?? "").trim().toLowerCase();
    if (!email.includes("@")) return { email, role, valid: false, error: "Invalid email" };
    if (!VALID_ROLES.includes(role)) return { email, role, valid: false, error: `Role must be student / teacher / head_teacher` };
    return { email, role, valid: true };
}

export function RosterManagement() {
    // ─── Single-add state ───────────────────────────────────────────────────────
    const [members, setMembers] = useState<RosterMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [newEmail, setNewEmail] = useState("");
    const [newRole, setNewRole] = useState<"student" | "teacher" | "head_teacher">("student");
    const [adding, setAdding] = useState(false);
    const [addError, setAddError] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editRole, setEditRole] = useState<"student" | "teacher" | "head_teacher">("student");

    // ─── Bulk upload state ───────────────────────────────────────────────────────
    const [bulkRows, setBulkRows] = useState<BulkRow[] | null>(null);
    const [bulkFileName, setBulkFileName] = useState("");
    const [bulkUploading, setBulkUploading] = useState(false);
    const [bulkResult, setBulkResult] = useState<{ inserted: number } | null>(null);
    const [bulkError, setBulkError] = useState("");
    const [dragging, setDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchMembers = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/roster");
            const data = await res.json();
            setMembers(data.members ?? []);
        } catch { setMembers([]); }
        setLoading(false);
    };

    useEffect(() => { fetchMembers(); }, []);

    // ─── Single add ──────────────────────────────────────────────────────────────
    const handleAdd = async () => {
        if (!newEmail.trim()) { setAddError("Email is required"); return; }
        setAdding(true); setAddError("");
        const res = await fetch("/api/roster", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: newEmail.trim(), role: newRole }),
        });
        const data = await res.json();
        if (!res.ok) { setAddError(data.error || "Failed to add member"); }
        else { setNewEmail(""); fetchMembers(); }
        setAdding(false);
    };

    const handleEdit = async (id: string) => {
        const res = await fetch("/api/roster", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, role: editRole }),
        });
        if (res.ok) { setEditingId(null); fetchMembers(); }
    };

    const handleDelete = async (id: string, email: string) => {
        if (!confirm(`Remove ${email} from the roster?`)) return;
        await fetch(`/api/roster?id=${id}`, { method: "DELETE" });
        fetchMembers();
    };

    // ─── Bulk upload helpers ─────────────────────────────────────────────────────
    const parseFile = (file: File) => {
        setBulkResult(null);
        setBulkError("");
        setBulkFileName(file.name);

        if (file.name.endsWith(".json")) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json = JSON.parse(e.target?.result as string);
                    const arr = Array.isArray(json) ? json : [];
                    setBulkRows(arr.map(validateRow));
                } catch {
                    setBulkError("Invalid JSON file.");
                }
            };
            reader.readAsText(file);
        } else if (file.name.endsWith(".csv")) {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (result) => {
                    const rows = (result.data as { email?: string; role?: string }[]);
                    setBulkRows(rows.map(validateRow));
                },
                error: () => setBulkError("Failed to parse CSV."),
            });
        } else {
            setBulkError("Unsupported file type. Please upload a .csv or .json file.");
        }
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault(); setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) parseFile(file);
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) parseFile(file);
    };

    const handleBulkSubmit = async () => {
        if (!bulkRows) return;
        const valid = bulkRows.filter((r) => r.valid);
        if (valid.length === 0) { setBulkError("No valid entries to submit."); return; }

        setBulkUploading(true); setBulkError("");
        const res = await fetch("/api/roster/bulk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ members: valid }),
        });
        const data = await res.json();
        if (!res.ok) { setBulkError(data.error || "Bulk upload failed."); }
        else {
            setBulkResult({ inserted: data.inserted });
            setBulkRows(null);
            setBulkFileName("");
            fetchMembers();
        }
        setBulkUploading(false);
    };

    const clearBulk = () => { setBulkRows(null); setBulkFileName(""); setBulkError(""); setBulkResult(null); };

    const validCount = bulkRows?.filter((r) => r.valid).length ?? 0;
    const errorCount = bulkRows?.filter((r) => !r.valid).length ?? 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl lg:text-3xl font-bold text-white">Roster Management</h2>
                <p className="text-sm text-neutral-400 mt-1">
                    Add emails here to grant access. Users must sign in with the exact email you add.
                </p>
            </div>

            {/* ── Single Add ── */}
            <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
                <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">Add Member</h3>
                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => { setNewEmail(e.target.value); setAddError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                        placeholder="student@gmail.com"
                        id="roster-email-input"
                        className="flex-1 bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm"
                    />
                    <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as any)}
                        id="roster-role-select"
                        className="bg-neutral-950 border border-neutral-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-600 text-sm"
                    >
                        <option value="student">Student</option>
                        <option value="teacher">Teacher</option>
                        <option value="head_teacher">Head Teacher</option>
                    </select>
                    <button
                        onClick={handleAdd}
                        disabled={adding || !newEmail.trim()}
                        id="roster-add-btn"
                        className="flex items-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm shrink-0"
                    >
                        {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Add
                    </button>
                </div>
                {addError && <p className="text-red-400 text-sm">{addError}</p>}
            </div>

            {/* ── Bulk Upload ── */}
            <div className="p-5 rounded-2xl bg-neutral-900 border border-neutral-800 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Bulk Upload
                    </h3>
                    {bulkRows && (
                        <button onClick={clearBulk} className="text-xs text-neutral-500 hover:text-white transition-colors">
                            Clear
                        </button>
                    )}
                </div>

                {!bulkRows ? (
                    <>
                        {/* Drop zone */}
                        <div
                            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={handleFileDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                                ${dragging ? "border-purple-500 bg-purple-500/10" : "border-neutral-700 hover:border-neutral-500 hover:bg-neutral-800/50"}`}
                        >
                            <FileText className="w-8 h-8 text-neutral-500 mx-auto mb-3" />
                            <p className="text-sm text-neutral-300 font-medium">Drop a file here, or click to browse</p>
                            <p className="text-xs text-neutral-500 mt-1">Supports <span className="text-neutral-400">.csv</span> and <span className="text-neutral-400">.json</span></p>
                            <p className="text-xs text-neutral-600 mt-3">Required columns: <code className="text-neutral-400">email</code>, <code className="text-neutral-400">role</code></p>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv,.json"
                            onChange={handleFileInput}
                            className="hidden"
                            id="bulk-file-input"
                        />
                        {bulkError && <p className="text-red-400 text-sm">{bulkError}</p>}

                        {/* Sample template hint */}
                        <p className="text-xs text-neutral-600">
                            CSV format example: <code className="text-neutral-500">email,role</code> → <code className="text-neutral-500">alice@school.com,student</code>
                        </p>
                    </>
                ) : (
                    <>
                        {/* Preview */}
                        <div className="flex items-center gap-4 text-sm">
                            <span className="text-neutral-400">
                                <span className="font-semibold text-white">{bulkFileName}</span>
                            </span>
                            <span className="flex items-center gap-1 text-green-400">
                                <CheckCircle2 className="w-4 h-4" /> {validCount} valid
                            </span>
                            {errorCount > 0 && (
                                <span className="flex items-center gap-1 text-red-400">
                                    <AlertCircle className="w-4 h-4" /> {errorCount} errors
                                </span>
                            )}
                        </div>

                        {/* Preview table */}
                        <div className="max-h-56 overflow-y-auto rounded-xl border border-neutral-800 divide-y divide-neutral-800">
                            {bulkRows.map((row, i) => (
                                <div key={i} className={`flex items-center justify-between px-4 py-2 text-xs gap-3 ${row.valid ? "" : "bg-red-500/5"}`}>
                                    <span className={row.valid ? "text-white" : "text-red-400"}>{row.email || "(empty)"}</span>
                                    <span className={`shrink-0 ${row.valid ? "text-neutral-400" : "text-red-400"}`}>
                                        {row.valid ? (ROLE_LABELS[row.role] ?? row.role) : row.error}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {bulkError && <p className="text-red-400 text-sm">{bulkError}</p>}

                        <button
                            onClick={handleBulkSubmit}
                            disabled={bulkUploading || validCount === 0}
                            id="bulk-submit-btn"
                            className="flex items-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors text-sm"
                        >
                            {bulkUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            Upload {validCount} member{validCount !== 1 ? "s" : ""}
                        </button>
                    </>
                )}

                {/* Success message */}
                {bulkResult && (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        Successfully added {bulkResult.inserted} member{bulkResult.inserted !== 1 ? "s" : ""} to the roster.
                    </div>
                )}
            </div>

            {/* ── Member list ── */}
            <div className="space-y-2">
                <h3 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Current Members ({members.length})
                </h3>
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                    </div>
                ) : members.length === 0 ? (
                    <div className="text-center py-10 space-y-2">
                        <Users className="w-10 h-10 text-neutral-700 mx-auto" />
                        <p className="text-neutral-500 text-sm">No members yet. Add your first one above.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {members.map((m) => (
                            <div
                                key={m.id}
                                className="flex items-center justify-between gap-3 p-4 rounded-xl bg-neutral-900 border border-neutral-800"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-400 shrink-0 uppercase">
                                        {m.email[0]}
                                    </div>
                                    <span className="text-white text-sm font-medium truncate">{m.email}</span>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {editingId === m.id ? (
                                        <>
                                            <select
                                                value={editRole}
                                                onChange={(e) => setEditRole(e.target.value as any)}
                                                className="bg-neutral-800 border border-neutral-700 rounded-lg px-2 py-1 text-white text-xs focus:outline-none"
                                            >
                                                <option value="student">Student</option>
                                                <option value="teacher">Teacher</option>
                                                <option value="head_teacher">Head Teacher</option>
                                            </select>
                                            <button onClick={() => handleEdit(m.id)} className="p-1.5 text-green-400 hover:bg-green-500/10 rounded-lg transition-colors">
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setEditingId(null)} className="p-1.5 text-neutral-400 hover:bg-neutral-700 rounded-lg transition-colors">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${ROLE_COLORS[m.role] ?? "text-neutral-400"}`}>
                                                {ROLE_LABELS[m.role] ?? m.role}
                                            </span>
                                            <button
                                                onClick={() => { setEditingId(m.id); setEditRole(m.role); }}
                                                className="p-1.5 text-neutral-400 hover:text-white hover:bg-neutral-700 rounded-lg transition-colors"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(m.id, m.email)}
                                                className="p-1.5 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
