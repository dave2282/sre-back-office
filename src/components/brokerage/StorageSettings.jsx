import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, HardDrive, CheckCircle2, AlertCircle, ArrowRightLeft, Unplug } from "lucide-react";

const fmtBytes = (n = 0) => (n > 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
const LABEL = { local: "This server", google_drive: "Google Drive", dropbox: "Dropbox" };

function ProviderLogo({ name }) {
  if (name === "google_drive") {
    return (
      <svg viewBox="0 0 87.3 78" className="w-6 h-6" aria-hidden="true">
        <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
        <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
        <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
        <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
        <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
        <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
      </svg>
    );
  }
  if (name === "dropbox") {
    return (
      <svg viewBox="0 0 43 40" className="w-6 h-6" aria-hidden="true">
        <path fill="#0061FF" d="M12.5 0 0 8.1l8.6 6.9 12.6-7.8zM0 21.9l12.5 8.1 8.7-7.2-12.6-7.8zm21.2.9 8.7 7.2 12.5-8.1-8.6-6.9zm21.2-14.7L29.9 0l-8.7 7.2 12.6 7.8zM21.3 24.4l-8.8 7.2-3.7-2.4v2.7l12.5 7.5 12.5-7.5v-2.7l-3.7 2.4z" />
      </svg>
    );
  }
  return <HardDrive className="w-6 h-6 text-slate-500" />;
}

export default function StorageSettings() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState(() => {
    const s = params.get("storage");
    return s ? { ok: s === "connected", msg: params.get("msg") || "" } : null;
  });

  const load = useCallback(() => base44.storage.status().then(setStatus).catch(e => setNote({ ok: false, msg: e.message })), []);

  useEffect(() => {
    load();
    if (params.get("storage")) { params.delete("storage"); params.delete("msg"); setParams(params, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while files are being moved
  useEffect(() => {
    if (!status?.migration?.running) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [status?.migration?.running, load]);

  const act = async (key, fn) => {
    setBusy(key); setNote(null);
    try { setStatus(await fn()); }
    catch (e) { setNote({ ok: false, msg: e.message }); }
    finally { setBusy(""); }
  };

  if (!status) return null;

  const active = status.active;
  const notActiveCount = Object.entries(status.counts || {}).filter(([p]) => p !== active).reduce((n, [, c]) => n + c.files, 0);
  const m = status.migration || {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">File Storage</CardTitle>
        <p className="text-sm text-gray-500">
          Choose where uploaded documents, CDAs and images are saved. Files go into the <strong>{status.root_folder}</strong> folder
          (by agent and property) in the connected account. Links inside the portal keep working if you switch.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {note && (
          <div className={`flex gap-2 items-start text-sm rounded-md px-3 py-2 border ${note.ok ? "bg-green-50 border-green-100 text-green-800" : "bg-red-50 border-red-100 text-red-800"}`}>
            {note.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
            <span>{note.msg}</span>
          </div>
        )}

        <div className="divide-y rounded-lg border">
          {[{ name: "local", label: LABEL.local, connected: true, configured: true }, ...status.providers].map(p => {
            const isActive = active === p.name;
            const c = status.counts?.[p.name];
            return (
              <div key={p.name} className="flex flex-wrap items-center gap-3 p-4">
                <ProviderLogo name={p.name} />
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{p.label}</span>
                    {isActive && <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Saving new uploads here</Badge>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.name === "local" ? "Files stay on your web server's disk (data/uploads). Back this folder up."
                      : p.connected ? `Connected${p.account ? ` as ${p.account}` : ""}`
                        : p.configured ? "Not connected" : "Server needs app credentials first (see README → Cloud storage)"}
                    {c ? ` · ${c.files} file${c.files === 1 ? "" : "s"}, ${fmtBytes(c.bytes)}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {p.name !== "local" && !p.connected && (
                    <Button size="sm" disabled={!p.configured} onClick={() => { window.location.href = base44.storage.connectUrl(p.name); }}>
                      Connect {p.label}
                    </Button>
                  )}
                  {p.connected && !isActive && (
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act(`use-${p.name}`, () => base44.storage.setActive(p.name))}>
                      {busy === `use-${p.name}` && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Use for new uploads
                    </Button>
                  )}
                  {p.name !== "local" && p.connected && (
                    <Button size="sm" variant="ghost" className="text-gray-500" disabled={!!busy}
                      onClick={() => window.confirm(`Disconnect ${p.label}?`) && act(`dc-${p.name}`, () => base44.storage.disconnect(p.name))}>
                      <Unplug className="w-3.5 h-3.5 mr-1" />Disconnect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {(notActiveCount > 0 || m.running || m.total > 0) && (
          <div className="rounded-lg bg-slate-50 border p-4 space-y-2">
            {m.running ? (
              <p className="text-sm text-slate-700 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />Moving files to {LABEL[m.target]} — {m.done + m.failed} of {m.total}
              </p>
            ) : notActiveCount > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-700">{notActiveCount} existing file{notActiveCount === 1 ? " is" : "s are"} stored somewhere else. Move {notActiveCount === 1 ? "it" : "them"} to {LABEL[active]}?</p>
                <Button size="sm" variant="outline" disabled={!!busy}
                  onClick={() => window.confirm(`Copy ${notActiveCount} file(s) into ${LABEL[active]}? Links in the portal stay the same.`) && act("migrate", async () => { await base44.storage.migrate(); return base44.storage.status(); })}>
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />Move existing files
                </Button>
              </div>
            ) : null}
            {!m.running && m.total > 0 && (
              <p className="text-xs text-slate-500">Last move: {m.done} moved{m.failed ? `, ${m.failed} failed` : ""}.</p>
            )}
            {m.errors?.length > 0 && <ul className="text-xs text-red-700 list-disc list-inside">{m.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
