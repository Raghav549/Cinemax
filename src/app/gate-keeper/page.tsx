"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/components/Logo";
import Icon from "@/components/Icon";
import CinematicButton from "@/components/CinematicButton";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/verify", { signal: controller.signal }).then((response) => response.json()).then((data) => { if (data.valid) router.replace("/gate-keeper/dashboard"); }).catch(() => undefined);
    return () => controller.abort();
  }, [router]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json();
      if (response.ok && data.success) router.replace("/gate-keeper/dashboard");
      else setError(data.error || "Invalid credentials");
    } catch { setError("Unable to connect. Please try again."); }
    setLoading(false);
  };

  return <main className="studio-login" id="main-content" tabIndex={-1}><div className="studio-login-card">
    <Link href="/" aria-label="Cinemax home"><Logo /></Link>
    <h1>Cinemax studio</h1><p>Sign in to manage your library.</p>
    <form onSubmit={handleLogin}>
      <div><label htmlFor="studio-email">Email</label><input id="studio-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="glass-input" placeholder="admin@example.com" autoComplete="username" required /></div>
      <div><label htmlFor="studio-password">Password</label><input id="studio-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="glass-input" placeholder="Your password" autoComplete="current-password" required /></div>
      {error && <div className="studio-login-error" role="alert">{error}</div>}
      <CinematicButton type="submit" disabled={loading} icon={<Icon name="lock" />}>{loading ? "Signing in…" : "Sign in"}</CinematicButton>
    </form>
    <Link href="/" className="page-back"><Icon name="arrow-left" />Back to Cinemax</Link>
  </div></main>;
}
