import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Loader2, CheckCircle2, Bell, User, Camera, Plus, X, Building2, Trash2 } from "lucide-react";
import AddressInput from "@/components/shared/AddressInput";

const NOTIFICATION_OPTIONS = [
  { key: "cda_submitted", label: "CDA Submitted", description: "When you successfully submit a new CDA" },
  { key: "cda_approved", label: "CDA Approved", description: "When your CDA is approved by the admin" },
  { key: "cda_correction_needed", label: "Correction Requested", description: "When admin requests a correction on your CDA" },
  { key: "cda_paid", label: "Commission Marked as Paid", description: "When your commission is marked as paid" },
  { key: "document_status_update", label: "Document Status Update", description: "When a document in your vault changes status" },
  { key: "document_vault_completed", label: "Document Vault Completed", description: "When your transaction file is marked as completed" },
  { key: "welcome_and_announcements", label: "Announcements & Office Updates", description: "General brokerage announcements and updates" },
];

const DEFAULT_PREFS = Object.fromEntries(NOTIFICATION_OPTIONS.map(n => [n.key, true]));

export default function AgentSettings() {
  const [user, setUser] = useState(null);
  const [agentRecord, setAgentRecord] = useState(null);
  const [availableTCs, setAvailableTCs] = useState([]);
  const [selectedTCs, setSelectedTCs] = useState([]);
  const [savingTCs, setSavingTCs] = useState(false);
  const [savedTCs, setSavedTCs] = useState(false);
  const [newTCEmail, setNewTCEmail] = useState("");
  const [profile, setProfile] = useState({
    full_name: "", phone: "", mailing_address: "", license_number: "", license_expiration: "", company: "", companies: [],
  });
  const [photoUrl, setPhotoUrl] = useState("");
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingNotifs, setSavingNotifs] = useState(false);
  const [savedProfile, setSavedProfile] = useState(false);
  const [savedNotifs, setSavedNotifs] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      const agents = await base44.entities.Agent.filter({ user_email: me.email });
      const agent = agents?.[0] || null;
      setAgentRecord(agent);
      if (agent) {
        setProfile({
          full_name: agent.full_name || me.full_name || "",
          phone: agent.phone || "",
          mailing_address: agent.mailing_address || "",
          license_number: agent.license_number || "",
          license_expiration: agent.license_expiration || "",
          company: agent.company || "",
          companies: agent.companies || [],
        });
        setPhotoUrl(agent.photo_url || "");
        setSelectedTCs(agent.transaction_coordinators || []);
        if (agent.notification_preferences) {
          setPrefs({ ...DEFAULT_PREFS, ...agent.notification_preferences });
        }
      }
      // Load available TCs from brokerage settings
      const settingsList = await base44.entities.BrokerageSettings.list();
      const settings = settingsList?.[0];
      setAvailableTCs(settings?.transaction_coordinators || []);
      setLoading(false);
    };
    load();
  }, []);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !agentRecord) return;
    setUploadingPhoto(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.Agent.update(agentRecord.id, { photo_url: file_url });
    setPhotoUrl(file_url);
    setAgentRecord(r => ({ ...r, photo_url: file_url }));
    setUploadingPhoto(false);
  };

  const handleSaveProfile = async () => {
    if (!agentRecord) return;
    setSavingProfile(true);
    await base44.entities.Agent.update(agentRecord.id, profile);
    setAgentRecord(r => ({ ...r, ...profile }));
    setSavingProfile(false);
    setSavedProfile(true);
    setTimeout(() => setSavedProfile(false), 3000);
  };

  const handleSaveNotifs = async () => {
    if (!agentRecord) return;
    setSavingNotifs(true);
    await base44.entities.Agent.update(agentRecord.id, { notification_preferences: prefs });
    setSavingNotifs(false);
    setSavedNotifs(true);
    setTimeout(() => setSavedNotifs(false), 3000);
  };

  const toggleNotif = (key) => setPrefs(p => ({ ...p, [key]: !p[key] }));

  const removeTC = (email) => setSelectedTCs(prev => prev.filter(e => e !== email));

  const addTC = () => {
    const email = newTCEmail.trim().toLowerCase();
    if (!email || selectedTCs.includes(email)) return;
    setSelectedTCs(prev => [...prev, email]);
    setNewTCEmail("");
  };

  const handleSaveTCs = async () => {
    if (!agentRecord) return;
    setSavingTCs(true);
    await base44.entities.Agent.update(agentRecord.id, { transaction_coordinators: selectedTCs });
    setAgentRecord(r => ({ ...r, transaction_coordinators: selectedTCs }));
    setSavingTCs(false);
    setSavedTCs(true);
    setTimeout(() => setSavedTCs(false), 3000);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full p-12">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your profile and notification preferences</p>
      </div>

      {!agentRecord && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          Your agent profile has not been set up yet. Contact your admin to be added to the agent roster.
        </div>
      )}

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="w-4 h-4" /> My Profile
            </CardTitle>
            <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile || !agentRecord} className="gap-2">
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : savedProfile ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {savedProfile ? "Saved!" : "Save Profile"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Photo */}
          <div className="flex items-center gap-5">
            <label className="relative cursor-pointer group flex-shrink-0">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-2xl font-bold text-gray-400 border-2 border-dashed border-gray-300">
                  {(profile.full_name || user?.full_name || "?")?.[0]?.toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                {uploadingPhoto ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={!agentRecord} />
            </label>
            <div>
              <p className="text-sm font-medium text-gray-800">{profile.full_name || user?.full_name}</p>
              <p className="text-xs text-gray-400">{user?.email}</p>
              <p className="text-xs text-gray-400 mt-0.5">Click photo to update</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Full Name</Label>
              <Input className="mt-1.5" value={profile.full_name} onChange={e => setProfile(p => ({ ...p, full_name: e.target.value }))} disabled={!agentRecord} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input className="mt-1.5" value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="(555) 123-4567" disabled={!agentRecord} />
            </div>
            <div>
              <Label>Company / LLC</Label>
              <Input className="mt-1.5" value={profile.company} onChange={e => setProfile(p => ({ ...p, company: e.target.value }))} disabled={!agentRecord} />
            </div>
            <div>
              <Label>License Number</Label>
              <Input className="mt-1.5" value={profile.license_number} onChange={e => setProfile(p => ({ ...p, license_number: e.target.value }))} disabled={!agentRecord} />
            </div>
            <div>
              <Label>License Expiration</Label>
              <Input type="date" className="mt-1.5" value={profile.license_expiration} onChange={e => setProfile(p => ({ ...p, license_expiration: e.target.value }))} disabled={!agentRecord} />
            </div>
            <div className="col-span-2">
              <AddressInput
                label="Mailing Address (for commission checks)"
                value={profile.mailing_address}
                onChange={v => setProfile(p => ({ ...p, mailing_address: v }))}
              />
            </div>
            {/* Additional LLCs */}
            <div className="col-span-2">
              <Label>Additional LLC / Company Name Variations</Label>
              <p className="text-xs text-gray-400 mb-2 mt-0.5">Used to match referral &amp; split payments by alternate LLC names.</p>
              <div className="space-y-2">
                {(profile.companies || []).map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={c}
                      placeholder={`LLC variation ${i + 1}`}
                      onChange={e => {
                        const arr = [...(profile.companies || [])];
                        arr[i] = e.target.value;
                        setProfile(p => ({ ...p, companies: arr }));
                      }}
                      disabled={!agentRecord}
                    />
                    <Button size="icon" variant="outline" className="flex-shrink-0 text-red-400 border-red-200 hover:bg-red-50" onClick={() => {
                      const arr = [...(profile.companies || [])];
                      arr.splice(i, 1);
                      setProfile(p => ({ ...p, companies: arr }));
                    }}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" className="w-full gap-1.5" disabled={!agentRecord}
                  onClick={() => setProfile(p => ({ ...p, companies: [...(p.companies || []), ""] }))}>
                  <Plus className="w-4 h-4" /> Add LLC Variation
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction Coordinators Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4" /> My Transaction Coordinators
            </CardTitle>
            <Button size="sm" onClick={handleSaveTCs} disabled={savingTCs || !agentRecord} className="gap-2">
              {savingTCs ? <Loader2 className="w-4 h-4 animate-spin" /> : savedTCs ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {savedTCs ? "Saved!" : "Save"}
            </Button>
          </div>
          <p className="text-sm text-gray-500">Manage which transaction coordinators are assigned to you.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Currently assigned TCs */}
          {selectedTCs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-2">No transaction coordinators assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {selectedTCs.map(email => {
                const known = availableTCs.find(tc => tc.email === email);
                return (
                  <div key={email} className="flex items-center justify-between px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex-1 min-w-0">
                      {known?.full_name && <p className="text-sm font-medium text-gray-900">{known.full_name}</p>}
                      <p className="text-xs text-gray-500">{email}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0"
                      disabled={!agentRecord}
                      onClick={() => removeTC(email)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add a TC */}
          <div className="space-y-2 pt-2 border-t">
            <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Add Transaction Coordinator</Label>
            {availableTCs.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {availableTCs.filter(tc => !selectedTCs.includes(tc.email)).map(tc => (
                  <button
                    key={tc.email}
                    disabled={!agentRecord}
                    onClick={() => setSelectedTCs(prev => [...prev, tc.email])}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-200 rounded-full hover:border-blue-400 hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <Plus className="w-3 h-3" /> {tc.full_name || tc.email}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Add by email address..."
                value={newTCEmail}
                onChange={e => setNewTCEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addTC()}
                disabled={!agentRecord}
                className="flex-1"
              />
              <Button size="sm" variant="outline" onClick={addTC} disabled={!newTCEmail.trim() || !agentRecord}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notifications Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4" /> Email Notifications
            </CardTitle>
            <Button size="sm" onClick={handleSaveNotifs} disabled={savingNotifs || !agentRecord} className="gap-2">
              {savingNotifs ? <Loader2 className="w-4 h-4 animate-spin" /> : savedNotifs ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              {savedNotifs ? "Saved!" : "Save"}
            </Button>
          </div>
          <p className="text-sm text-gray-500">Choose which emails you'd like to receive.</p>
        </CardHeader>
        <CardContent className="divide-y p-0">
          {NOTIFICATION_OPTIONS.map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between px-6 py-4 gap-4">
              <div className="flex-1 min-w-0">
                <Label className="text-sm font-medium text-gray-900">{label}</Label>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </div>
              <Switch checked={!!prefs[key]} onCheckedChange={() => toggleNotif(key)} disabled={!agentRecord} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}