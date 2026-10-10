"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/admin/verify")
      .then((r) => r.json())
      .then((data) => { if (data.valid) router.push("/gate-keeper/dashboard"); });
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success) router.push("/gate-keeper/dashboard");
      else setError(data.error || "Invalid credentials");
    } catch {
      setError("Network error");
    }
    setLoading(false);
  };

  return (
    <div style={{ background: "#000", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 380, background: "rgba(20,20,20,0.8)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 32 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>Admin Access</h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>Authorized personnel only</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="glass-input" placeholder="admin@example.com" required />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 8 }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="glass-input" placeholder="••••••••" required />
          </div>
          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: 12, padding: "10px 14px", color: "#ef4444", fontSize: 13, textAlign: "center" }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={loading}
            style={{ width: "100%", padding: "14px 0", borderRadius: 14, background: "#fff", color: "#000", fontWeight: 900, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", border: "none", cursor: "pointer", opacity: loading ? 0.5 : 1, marginTop: 8 }}
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
