"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MusicIcon from "./Icon";
import { useMusic } from "./MusicProvider";

type AuthMode = "register" | "login" | "forgot" | "reset";
const MAX_BIRTHDATE = new Date(Date.now() - 13 * 365.25 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
function nextPath(): string { const raw = new URLSearchParams(window.location.search).get("next") || "/library"; return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/library"; }
function ageEligible(date: string): boolean { const birth = new Date(`${date}T00:00:00Z`); if (!date || !Number.isFinite(birth.getTime())) return false; const now = new Date(); let age = now.getUTCFullYear() - birth.getUTCFullYear(); if (now.getUTCMonth() < birth.getUTCMonth() || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())) age -= 1; return age >= 13 && age <= 120 && birth.toISOString().slice(0,10) === date; }

export default function AuthView({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const { refreshUser, showNotice } = useMusic();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [gender, setGender] = useState("prefer_not_to_say");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [usernameStatus, setUsernameStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [developmentUrl, setDevelopmentUrl] = useState("");
  const [resetToken, setResetToken] = useState("");
  const resetTokenRef = useRef<string | null>(null);
  const [resendAvailable, setResendAvailable] = useState(false);

  useEffect(() => {
    const token = resetTokenRef.current || new URLSearchParams(window.location.search).get("token") || "";
    if (token) {
      resetTokenRef.current = token;
      window.history.replaceState(null, "", "/reset-password");
    }
    setResetToken(token);
  }, []);
  useEffect(() => {
    if (mode !== "register") return;
    const normalized = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,30}$/.test(normalized)) { setUsernameStatus(normalized ? "invalid" : "idle"); return; }
    setUsernameStatus("checking");
    let active = true;
    const timer = window.setTimeout(() => fetch(`/api/auth/check-username?username=${encodeURIComponent(normalized)}`, { cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Username check unavailable.");
      if (active) setUsernameStatus(result.available ? "available" : "taken");
    }).catch(() => { if (active) setUsernameStatus("idle"); }), 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [username, mode]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setMessage(""); setDevelopmentUrl("");
    if (mode === "register" && step === 1) {
      if (displayName.trim().length < 2) { setError("Enter your name as you would like it to appear."); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError("Enter a valid email address."); return; }
      if (!/^[a-z0-9_]{3,30}$/.test(username.trim().toLowerCase())) { setError("Use 3–30 lowercase letters, numbers, or underscores for your username."); return; }
      if (usernameStatus === "taken") { setError("That username is already in use."); return; }
      if (usernameStatus === "checking") { setError("Wait for the username availability check to finish."); return; }
      if (!ageEligible(birthDate)) { setError("You must be at least 13 and enter a valid birth date."); return; }
      setStep(2); return;
    }
    if (mode === "register") {
      if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) { setError("Use at least 10 characters, including uppercase, lowercase, and a number."); return; }
      if (new TextEncoder().encode(password).length > 72) { setError("Password must be 72 bytes or fewer."); return; }
      if (password !== confirm) { setError("Passwords do not match."); return; }
      if (!acceptedTerms) { setError("Accept the Terms and Privacy Policy to create your account."); return; }
    }
    if (mode === "reset" && (password !== confirm || password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))) { setError("Use matching passwords with at least 10 characters, uppercase, lowercase, and a number."); return; }
    setBusy(true);
    try {
      const endpoints: Record<AuthMode, string> = { register: "/api/auth/register", login: "/api/auth/login", forgot: "/api/auth/forgot-password", reset: "/api/auth/reset-password" };
      const body = mode === "register" ? { email, username, displayName, birthDate, gender, password, acceptedTerms }
        : mode === "login" ? { email, password }
        : mode === "forgot" ? { email }
        : { token: resetToken, password };
      const response = await fetch(endpoints[mode], { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Something went wrong. Please try again.");
      if (mode === "login") { await refreshUser(); showNotice("Welcome back."); router.replace(nextPath()); router.refresh(); return; }
      if (mode === "register") {
        setMessage(result.message || "Your account was created. Check your email to verify.");
        const devUrl = result.developmentVerificationUrl || "";
        setDevelopmentUrl(devUrl);
        if (devUrl) { try { sessionStorage.setItem("miley:developmentVerificationUrl", devUrl); } catch { /* browser storage may be disabled */ } }
        await refreshUser(); setResendAvailable(true); router.push(`/verify?pending=1&mail=${result.emailSent ? "sent" : "not-configured"}`); router.refresh(); return;
      }
      if (mode === "forgot") { setMessage(result.message || "If an account exists, reset instructions will be sent."); return; }
      setMessage(result.message || "Password updated. Sign in with your new password."); setPassword(""); setConfirm("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  };

  const title = mode === "register" ? "Join MiLey" : mode === "login" ? "Welcome back" : mode === "forgot" ? "Reset your password" : "Choose a new password";
  const eyebrow = mode === "register" ? "Your account, your music" : mode === "login" ? "A quiet place to listen" : "Secure account access";

  return <main className="miley-page auth-page" id="main-content" tabIndex={-1}>
    <section className="auth-layout"><div className="auth-aside"><span className="page-eyebrow">{eyebrow}</span><h1>{mode === "register" ? <>Make space<br />for <em>music.</em></> : mode === "login" ? <>Good music<br />brings you <em>back.</em></> : <>A safer<br /><em>way forward.</em></>}</h1><p>MiLey uses email and password. Your password is hashed before it is stored. We never ask you to connect a Google account.</p><div className="auth-aside-mark"><MusicIcon name="disc" /><span>listen · create · connect</span></div></div>
      <section className="auth-card" aria-labelledby="auth-title"><div className="auth-card-heading"><span className="eyebrow">{mode === "register" ? `Step ${step} of 2` : "MiLey account"}</span><h2 id="auth-title">{title}</h2><p>{mode === "register" ? step === 1 ? "Start with the details you want associated with your account." : "Choose a strong password, then review the account terms." : mode === "login" ? "Sign in with the email address and password you registered." : mode === "forgot" ? "If an account exists for that email, we will send reset instructions." : "Your reset token expires after a short time and can only be used once."}</p></div>
        {mode === "register" && <div className="auth-stepper" aria-label="Registration steps"><span className={step === 1 ? "is-active" : "is-complete"}>1 · Your details</span><span className={step === 2 ? "is-active" : ""}>2 · Secure account</span></div>}
        {mode === "register" && step === 1 ? <form className="auth-form" onSubmit={submit}>
          <div className="form-field"><label className="form-label" htmlFor="register-name">Display name</label><input className="form-input" id="register-name" autoComplete="name" maxLength={100} value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></div>
          <div className="form-field"><label className="form-label" htmlFor="register-username">Username</label><div className="input-with-status"><span aria-hidden="true">@</span><input className="form-input" id="register-username" autoComplete="username" maxLength={30} pattern="[a-zA-Z0-9_]{3,30}" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} required /><small className={`field-status ${usernameStatus}`} aria-live="polite">{usernameStatus === "checking" ? "Checking…" : usernameStatus === "available" ? "Available" : usernameStatus === "taken" ? "Unavailable" : usernameStatus === "invalid" ? "3–30 characters" : ""}</small></div></div>
          <div className="form-field"><label className="form-label" htmlFor="register-email">Email address</label><input className="form-input" id="register-email" type="email" autoComplete="email" maxLength={320} value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <div className="form-grid"><div className="form-field"><label className="form-label" htmlFor="register-birthdate">Date of birth</label><input className="form-input" id="register-birthdate" type="date" autoComplete="bday" max={MAX_BIRTHDATE} value={birthDate} onChange={(event) => setBirthDate(event.target.value)} required /><span className="form-help">MiLey is for people aged 13 or older. Your exact birth date is private.</span></div><div className="form-field"><label className="form-label" htmlFor="register-gender">Gender · optional</label><select className="form-select" id="register-gender" value={gender} onChange={(event) => setGender(event.target.value)}><option value="prefer_not_to_say">Prefer not to say</option><option value="woman">Woman</option><option value="man">Man</option><option value="non_binary">Non-binary</option><option value="self_describe">Self-describe</option></select></div></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button auth-submit" type="submit">Continue <MusicIcon name="arrow" /></button>
        </form> : <form className="auth-form" onSubmit={submit}>
          {(mode === "login" || mode === "forgot") && <div className="form-field"><label className="form-label" htmlFor="auth-email">Email address</label><input className="form-input" id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={320} /></div>}
          {(mode === "login" || mode === "register" || mode === "reset") && <>
            {mode === "register" && <div className="auth-profile-summary"><span>{displayName.trim().slice(0,1).toUpperCase()}</span><div><strong>{displayName}</strong><small>@{username} · {email}</small></div><button type="button" className="text-button" onClick={() => { setStep(1); setError(""); }}>Edit</button></div>}
            {mode === "reset" && !resetToken && <p className="form-error" role="alert">This reset link is missing or incomplete. Request a new one.</p>}
            {mode === "reset" && <input type="hidden" value={resetToken} />}
            <div className="form-field"><label className="form-label" htmlFor="auth-password">{mode === "reset" ? "New password" : "Password"}</label><div className="password-input"><input className="form-input" id="auth-password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}><MusicIcon name={showPassword ? "eye-off" : "eye"} /></button></div>{mode !== "login" && <span className="form-help">At least 10 characters, with uppercase, lowercase, and a number. Maximum 72 UTF-8 bytes.</span>}</div>
            {(mode === "register" || mode === "reset") && <div className="form-field"><label className="form-label" htmlFor="auth-confirm">Confirm password</label><input className="form-input" id="auth-confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" minLength={10} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></div>}
          </>}
          {mode === "register" && <label className="terms-check"><input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} /><span>I agree to MiLey&apos;s <Link href="/legal/terms">Terms</Link> and acknowledge the <Link href="/legal/privacy">Privacy Policy</Link>.</span></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {message && <div className="status-banner" role="status"><MusicIcon name="check" /><div><strong>{mode === "forgot" ? "Request received" : mode === "reset" ? "Password updated" : "Account created"}</strong><p>{message}</p>{developmentUrl && <Link className="text-link" href={developmentUrl}>Open development verification link <MusicIcon name="arrow" /></Link>}{resendAvailable && <button type="button" className="text-button" onClick={() => router.push("/verify?pending=1")}>Email verification help</button>}</div></div>}
          <button className="primary-button auth-submit" type="submit" disabled={busy || (mode === "reset" && !resetToken)}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset instructions" : "Set new password"}<MusicIcon name="arrow" /></button>
        </form>}
        <div className="auth-footer">{mode === "register" ? <span>Already have an account? <Link href="/login">Sign in</Link></span> : mode === "login" ? <><span>New to MiLey? <Link href="/register">Create an account</Link></span><Link href="/forgot-password">Forgot password?</Link></> : mode === "forgot" ? <Link href="/login">Back to sign in</Link> : <Link href="/login">Return to sign in</Link>}</div>
        <p className="auth-safety-note"><MusicIcon name="shield" /> No Google sign-in. No plain-text password storage.</p>
      </section></section>
  </main>;
}
