"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

interface ApiKeyModalProps {
    onSaved: () => void;
}

export default function ApiKeyModal({ onSaved }: ApiKeyModalProps) {
    const { update } = useSession();
    const [key, setKey] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        if (!key.trim()) {
            setError("Please enter a valid API key.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/user/settings", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ geminiApiKey: key.trim() }),
            });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to save API key.");
            }
            // Pass geminiApiKey directly into the JWT token — no DB re-fetch needed
            await update({ geminiApiKey: key.trim() });
            onSaved();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
            display: "flex", alignItems: "center", justifyContent: "center",
        }}>
            <div style={{
                background: "#1a1a2e", borderRadius: 16, padding: "2rem 2.5rem",
                width: "min(480px, 95vw)", boxShadow: "0 8px 40px rgba(0,0,0,0.5)",
                border: "1px solid rgba(255,255,255,0.08)",
                display: "flex", flexDirection: "column", gap: "1.25rem",
            }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: "linear-gradient(135deg,#4f8ef7,#845ef7)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 20,
                    }}>🔑</div>
                    <div>
                        <h2 style={{ margin: 0, color: "#fff", fontSize: "1.1rem", fontWeight: 700 }}>
                            Your Gemini API Key Required
                        </h2>
                        <p style={{ margin: 0, color: "#8888aa", fontSize: "0.78rem", marginTop: 2 }}>
                            AI features use your personal Google Gemini quota.
                        </p>
                    </div>
                </div>

                {/* Description */}
                <p style={{ margin: 0, color: "#aaaacc", fontSize: "0.85rem", lineHeight: 1.6 }}>
                    To use OCR, note grading, and lecture transcription, please enter your{" "}
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                        style={{ color: "#4f8ef7", textDecoration: "underline" }}>
                        Google AI Studio API key
                    </a>
                    . It is stored securely and only used for your requests.
                </p>

                {/* Input */}
                <input
                    type="password"
                    placeholder="AIza..."
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    style={{
                        width: "100%", boxSizing: "border-box",
                        padding: "0.7rem 1rem",
                        borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)",
                        background: "rgba(255,255,255,0.05)", color: "#fff",
                        fontSize: "0.9rem", outline: "none",
                        fontFamily: "monospace",
                    }}
                />

                {/* Error */}
                {error && (
                    <p style={{ margin: 0, color: "#ff6b6b", fontSize: "0.8rem" }}>
                        ⚠️ {error}
                    </p>
                )}

                {/* Save button */}
                <button
                    onClick={handleSave}
                    disabled={loading}
                    style={{
                        padding: "0.7rem 1.5rem", borderRadius: 10, border: "none",
                        background: loading ? "#555" : "linear-gradient(135deg,#4f8ef7,#845ef7)",
                        color: "#fff", fontWeight: 700, fontSize: "0.95rem",
                        cursor: loading ? "not-allowed" : "pointer",
                        transition: "opacity 0.2s",
                        opacity: loading ? 0.7 : 1,
                    }}
                >
                    {loading ? "Saving…" : "Save API Key"}
                </button>
            </div>
        </div>
    );
}
