import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CheckCircle2 } from "lucide-react";

function useBranding() {
  const [b, setB] = useState({ brokerage_name: "", logo_url: null, primary_color: "#1e3a5f" });
  useEffect(() => {
    fetch("/api/public/branding").then(r => r.json()).then(setB).catch(() => {});
  }, []);
  return b;
}

// Only allow same-site relative redirects after sign-in.
const safeNext = (n) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

function Shell({ title, subtitle, children, footer }) {
  const b = useBranding();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {b.logo_url
            ? <img src={b.logo_url} alt={b.brokerage_name} className="h-14 mx-auto mb-4 object-contain" />
            : <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 text-white text-xl font-bold" style={{ background: b.primary_color }}>{(b.brokerage_name || "A")[0]}</div>}
          <p className="text-sm font-medium text-slate-500">{b.brokerage_name || "Agent Portal"}</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{title}</h1>
          {subtitle && <p className="text-slate-500 mt-2 text-sm">{subtitle}</p>}
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-7">{children}</div>
        {footer && <div className="text-center text-sm text-slate-500 mt-6">{footer}</div>}
      </div>
    </div>
  );
}

function ErrorNote({ children }) {
  return children ? <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">{children}</div> : null;
}

export function LoginPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await base44.auth.login(email.trim(), password);
      window.location.href = safeNext(params.get("next"));
    } catch (err) {
      setError(err.message || "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <Shell title="Sign in" subtitle="Use the email address your office has on file.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline">Forgot password?</Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        </div>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Sign in
        </Button>
      </form>
      <p className="text-xs text-slate-500 mt-5 text-center">
        First time here? <Link to="/forgot-password" className="underline">Get a link to set your password</Link>.
      </p>
    </Shell>
  );
}

export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get("email") || "");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try { await base44.auth.forgotPassword(email.trim()); setSent(true); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <Shell title="Set or reset your password" footer={<Link to="/login" className="underline">Back to sign in</Link>}>
      {sent ? (
        <div className="text-center space-y-3">
          <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto" />
          <p className="text-slate-700">If <strong>{email}</strong> belongs to an agent or staff member, a link is on its way. It expires in 2 hours.</p>
          <p className="text-xs text-slate-500">Don&apos;t see it? Check spam, or ask your office to resend your welcome email.</p>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">Enter your email and we&apos;ll send you a link to choose a password.</p>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Send link
          </Button>
        </form>
      )}
    </Shell>
  );
}

export function SetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [info, setInfo] = useState(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    base44.auth.tokenInfo(token).then(i => { setInfo(i); setFullName(i.full_name || ""); }).catch(() => setInfo({ valid: false }));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError("Use at least 8 characters.");
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true); setError("");
    try {
      await base44.auth.setPassword(token, password, info?.type === "invite" ? fullName.trim() : undefined);
      window.location.href = "/";
    } catch (err) {
      setError(err.message); setBusy(false);
    }
  };

  if (!info) return <Shell title="One moment…"><div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div></Shell>;
  if (!info.valid) {
    return (
      <Shell title="This link has expired" footer={<Link to="/login" className="underline">Back to sign in</Link>}>
        <p className="text-sm text-slate-600 mb-4">Password links can only be used once and expire after a while.</p>
        <Button asChild className="w-full"><Link to="/forgot-password">Send me a new link</Link></Button>
      </Shell>
    );
  }

  const isInvite = info.type === "invite";
  return (
    <Shell title={isInvite ? "Create your login" : "Choose a new password"} subtitle={info.email}>
      <form onSubmit={submit} className="space-y-4">
        {isInvite && (
          <div className="space-y-1.5">
            <Label htmlFor="name">Your name</Label>
            <Input id="name" autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="pw">Password</Label>
          <Input id="pw" type="password" autoComplete="new-password" required value={password} onChange={e => setPassword(e.target.value)} />
          <p className="text-xs text-slate-500">At least 8 characters.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pw2">Confirm password</Label>
          <Input id="pw2" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>
        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{isInvite ? "Create login & sign in" : "Save password & sign in"}
        </Button>
      </form>
    </Shell>
  );
}
