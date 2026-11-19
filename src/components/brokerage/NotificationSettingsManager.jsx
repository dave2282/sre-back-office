import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2 } from "lucide-react";

const NOTIFICATION_OPTIONS = [
  { key: "cda_submitted", label: "CDA Submitted", description: "When an agent submits a new CDA" },
  { key: "cda_approved", label: "CDA Approved", description: "When a CDA is approved" },
  { key: "cda_correction_needed", label: "Correction Requested", description: "When admin requests a correction on a CDA" },
  { key: "cda_paid", label: "Commission Marked as Paid", description: "When a commission is marked as paid" },
  { key: "document_status_update", label: "Document Status Update", description: "When a document status changes" },
  { key: "document_vault_completed", label: "Document Vault Completed", description: "When a transaction file is marked completed" },
  { key: "welcome_and_announcements", label: "Announcements & Office Updates", description: "General brokerage announcements" },
];

const ROLES = [
  { key: "agent", label: "All Agents" },
  { key: "admin", label: "Admin Accounts" },
  { key: "staff", label: "Staff Accounts" },
  { key: "own", label: "My Own Account (Broker)" },
];

const DEFAULT_PREFS = Object.fromEntries(NOTIFICATION_OPTIONS.map(n => [n.key, true]));

export default function NotificationSettingsManager({ settings, onSaved }) {
  const initDefaults = () => {
    const stored = settings?.notification_defaults || {};
    return Object.fromEntries(
      ROLES.map(r => [r.key, { ...DEFAULT_PREFS, ...(stored[r.key] || {}) }])
    );
  };

  const [defaults, setDefaults] = useState(initDefaults);
  const [activeRole, setActiveRole] = useState("agent");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const toggle = (role, key) => {
    setDefaults(d => ({ ...d, [role]: { ...d[role], [key]: !d[role][key] } }));
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    await base44.entities.BrokerageSettings.update(settings.id, { notification_defaults: defaults });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onSaved?.();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Configure default email notification settings per role. These become the default for new agents and can be overridden individually in each agent's Settings page.
      </p>

      {/* Role Tabs */}
      <div className="flex gap-2 flex-wrap">
        {ROLES.map(r => (
          <button
            key={r.key}
            onClick={() => setActiveRole(r.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              activeRole === r.key
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Notification Toggles */}
      <div className="divide-y border rounded-xl bg-white overflow-hidden">
        {NOTIFICATION_OPTIONS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between px-4 py-4 gap-4">
            <div className="flex-1 min-w-0">
              <Label className="text-sm font-medium text-gray-900">{label}</Label>
              <p className="text-xs text-gray-500 mt-0.5">{description}</p>
            </div>
            <Switch
              checked={!!defaults[activeRole]?.[key]}
              onCheckedChange={() => toggle(activeRole, key)}
            />
          </div>
        ))}
      </div>

      {/* Enable All / Disable All shortcuts */}
      <div className="flex items-center gap-3">
        <button
          className="text-xs text-blue-600 hover:underline"
          onClick={() => setDefaults(d => ({
            ...d,
            [activeRole]: Object.fromEntries(NOTIFICATION_OPTIONS.map(n => [n.key, true]))
          }))}
        >
          Enable All
        </button>
        <span className="text-gray-300">|</span>
        <button
          className="text-xs text-gray-500 hover:underline"
          onClick={() => setDefaults(d => ({
            ...d,
            [activeRole]: Object.fromEntries(NOTIFICATION_OPTIONS.map(n => [n.key, false]))
          }))}
        >
          Disable All
        </button>
        <div className="flex-1" />
        <Button size="sm" onClick={handleSave} disabled={saving || !settings} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : null}
          {saved ? "Saved!" : "Save Notification Settings"}
        </Button>
      </div>
    </div>
  );
}