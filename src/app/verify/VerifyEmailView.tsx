"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMusic } from "@/components/miley/MusicProvider";
import MusicIcon from "@/components/miley/Icon";

export default function VerifyEmailView() {
  const router = useRouter();
  const { user, userLoading, refreshUser } = useMusic();
  const [status, setStatus] = useState<"checking" | "verified" | "pending" | "error">("checking");
  const [message, setMessage] = useState("");
  const [resendMessage, setResendMessage] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [devUrl, setDevUrl] = useState("");
  const verificationToken = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const token = verificationToken.current || params.get("token");
    if (token) {
      verificationToken.current = token;
      window.history.replaceState(null, "", "/verify");
    }
    try {
      const saved = sessionStorage.getItem("miley:developmentVerificationUrl") || "";
      const parsed = saved ? new URL(saved) : null;
      if (parsed && parsed.origin === window.location.origin) { setDevUrl(saved); sessionStorage.removeItem("miley:developmentVerificationUrl"); }
    } catch { /* ignore unavailable session storage */ }
    if (!token) {
      setStatus("pending");
      setMessage(params.get("mail") === "not-configured"
        ? "Your account is saved, but the mail provider did not confirm delivery. If you are testing locally, use the development verification link below. In production, the operator must configure a transactional email provider."
        : "Check the inbox for your MiLey account and open the single-use verification link. If it does not arrive, you can request another.");
      return () => { active = false; };
    }
    fetch("/api/auth/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store" }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Verification link is invalid or expired.");
      if (active) { setStatus("verified"); setMessage(result.message || "Your email is verified."); await refreshUser(); }
    }).catch((cause) => { if (active) { setStatus("error"); setMessage(cause instanceof Error ? cause.message : "Verification failed."); } });
    return () => { active = false; };
  }, [refreshUser]);

  const resend = async () => {
    setResendBusy(true); setResendMessage("");
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "A new email could not be requested.");
      setResendMessage(result.message || "If the account needs verification, a new email was requested.");
    } catch (cause) { setResendMessage(cause instanceof Error ? cause.message : "A new email could not be requested."); }
    finally { setResendBusy(false); }
  };

  return <main className="miley-page auth-page" id="main-content"><section className="auth-layout"><div className="auth-aside"><span className="page-eyebrow">Account security</span><h1>One last<br /><em>confirmation.</em></h1><p>Email verification helps protect your account and is required before publishing creator music or social content.</p><div className="auth-aside-mark"><MusicIcon name="shield" /><span>your account stays yours</span></div></div><section className="auth-card" aria-labelledby="verify-title"><span className="eyebrow">MiLey account</span><h2 id="verify-title">{status === "checking" || userLoading ? "Checking your link…" : status === "verified" ? "Email verified" : "Verify your email"}</h2><div className={`verify-status ${status}`}><span className="verify-status-icon"><MusicIcon name={status === "verified" ? "check" : status === "error" ? "shield" : "lock"} /></span><p role="status">{message || (status === "checking" ? "Please wait while MiLey checks this single-use link." : "")}</p></div>
    {devUrl && status === "pending" && <div className="status-banner"><MusicIcon name="globe" /><div><strong>Development-only verification link</strong><p>This link is exposed only by the local development server. It will not appear in production responses.</p><a className="text-link" href={devUrl}>Verify this account <MusicIcon name="arrow" /></a></div></div>}
    {status === "pending" && <><p className="auth-subcopy">{user ? `Account: ${user.email}` : "If you just created your account, return to the same browser session after confirming your email."}</p><button type="button" className="secondary-button auth-submit" onClick={() => void resend()} disabled={resendBusy || userLoading || !user}>{resendBusy ? "Requesting…" : "Send a new verification email"}</button>{resendMessage && <p className="form-help" role="status">{resendMessage}</p>}</>}
    {status === "verified" && <Link className="primary-button auth-submit" href="/library">Open your library <MusicIcon name="arrow" /></Link>}
    {status === "error" && <div className="auth-footer"><Link href="/login">Sign in</Link><button className="text-button" type="button" onClick={() => router.push("/verify?pending=1")}>Request another link</button></div>}
    <p className="auth-safety-note"><MusicIcon name="lock" /> Verification links are single-use and expire within 24 hours.</p></section></section></main>;
}
