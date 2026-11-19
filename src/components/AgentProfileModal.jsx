import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Camera } from "lucide-react";

export default function AgentProfileModal({ open, onClose, agentRecord, setAgentRecord, user }) {
  const [form, setForm] = useState({
    full_name: agentRecord?.full_name || user?.full_name || "",
    phone: agentRecord?.phone || "",
    mailing_address: agentRecord?.mailing_address || "",
    license_number: agentRecord?.license_number || "",
    license_expiration: agentRecord?.license_expiration || "",
    company: agentRecord?.company || "",
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(agentRecord?.photo_url || "");

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

  const handleSave = async () => {
    if (!agentRecord) return;
    setSaving(true);
    const updated = await base44.entities.Agent.update(agentRecord.id, form);
    setAgentRecord(r => ({ ...r, ...form }));
    setSaving(false);
    onClose();
  };

  const field = (label, key, type = "text", placeholder = "") => (
    <div>
      <Label className="text-xs text-gray-500">{label}</Label>
      <Input
        type={type}
        className="mt-1"
        placeholder={placeholder}
        value={form[key]}
        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
        </DialogHeader>

        <div className="py-3 space-y-4">
          {/* Photo */}
          <div className="flex flex-col items-center gap-2">
            <label className="relative cursor-pointer group">
              {photoUrl ? (
                <img src={photoUrl} alt="" className="w-20 h-20 rounded-full object-cover border-2 border-gray-200" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-2xl font-bold text-gray-400 border-2 border-dashed border-gray-300">
                  {(form.full_name || user?.full_name || "?")?.[0]?.toUpperCase()}
                </div>
              )}
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                {uploadingPhoto ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Camera className="w-5 h-5 text-white" />}
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
            </label>
            <p className="text-xs text-gray-400">Click to update photo</p>
          </div>

          {field("Full Name", "full_name", "text", "Your name")}
          {field("Phone", "phone", "tel", "e.g. (555) 123-4567")}
          {field("Mailing Address", "mailing_address", "text", "123 Main St, Denver CO 80201")}
          {field("License Number", "license_number", "text", "RE license #")}
          {field("License Expiration", "license_expiration", "date")}
          {field("Company / LLC", "company", "text", "Company name")}

          {!agentRecord && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-2">
              No agent profile found. Contact your admin to be added to the roster.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !agentRecord}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}