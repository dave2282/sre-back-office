import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Save, Loader2, CheckCircle2, Plus, Shield, Download, FileSpreadsheet, X } from "lucide-react";
import ListExportImport from "@/components/brokerage/ListExportImport";
import DeskFeeForm from "@/components/brokerage/DeskFeeForm";
import CommissionForm from "@/components/brokerage/CommissionForm";
import CategoryManager from "@/components/brokerage/CategoryManager";
import BackupDataSection from "@/components/brokerage/BackupDataSection";
import AddressInput from "@/components/shared/AddressInput";
import VendorManager from "@/components/brokerage/VendorManager";
import FileTypeChecklistManager from "@/components/brokerage/FileTypeChecklistManager";
import TeamsManager from "@/components/brokerage/TeamsManager";
import LeadAgentsManager from "@/components/brokerage/LeadAgentsManager";
import TransactionCoordinatorsManager from "@/components/brokerage/TransactionCoordinatorsManager";
import UserPermissionsMatrix from "@/components/brokerage/UserPermissionsMatrix";
import AgentDocumentChecklistManager from "@/components/brokerage/AgentDocumentChecklistManager";
import NotificationSettingsManager from "@/components/brokerage/NotificationSettingsManager";
import EmailTemplatesManager from "@/components/brokerage/EmailTemplatesManager";
import StorageSettings from "@/components/brokerage/StorageSettings";

export default function BrokerageSettings() {
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingDeskFeeIdx, setEditingDeskFeeIdx] = useState(null);
  const [editingCommissionIdx, setEditingCommissionIdx] = useState(null);

  useEffect(() => {
    const loadSettings = async () => {
      const data = await base44.entities.BrokerageSettings.list();
      if (data?.length > 0) {
        let rec = data[0];
        // Ensure "None Set" exists as first entry in both plan lists
        const updates = {};
        if (!(rec.desk_fee_plans || []).find(p => p.name === "None Set")) {
          updates.desk_fee_plans = [{ name: "None Set", amount: 0, frequency: "monthly", notes: "Default — no desk fee assigned" }, ...(rec.desk_fee_plans || [])];
        }
        if (!(rec.commission_plans || []).find(p => p.name === "None Set")) {
          updates.commission_plans = [{ name: "None Set", type: "commission", agent_split: 0, office_split: 0, flat_fee_amount: 0 }, ...(rec.commission_plans || [])];
        }
        if (Object.keys(updates).length > 0) {
          rec = { ...rec, ...updates };
          await base44.entities.BrokerageSettings.update(rec.id, updates);
        }
        setSettings(rec);
        setForm(rec);
      } else {
        // Auto-create default settings record so FileTypeChecklistManager can save into it
        const defaults = {
          brokerage_name: "Signature Real Estate",
          primary_color: "#1e3a5f",
          secondary_color: "#c9a84c",
          desk_fee_plans: [{ name: "None Set", amount: 0, frequency: "monthly", notes: "Default — no desk fee assigned" }],
          commission_plans: [{ name: "None Set", type: "commission", agent_split: 0, office_split: 0, flat_fee_amount: 0 }],
        };
        const created = await base44.entities.BrokerageSettings.create(defaults);
        setSettings(created);
        setForm(created);
      }
      setLoading(false);
    };
    
    loadSettings();
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleLogoUpload = async (file) => {
    setUploadingLogo(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    set("logo_url", file_url);
    setUploadingLogo(false);
  };

  const handleSave = async () => {
    setSaving(true);
    if (settings) {
      await base44.entities.BrokerageSettings.update(settings.id, form);
    } else {
      const created = await base44.entities.BrokerageSettings.create(form);
      setSettings(created);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };



  if (loading) return <div className="flex items-center justify-center h-full p-12"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Brokerage Settings</h1>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved!" : "Save Settings"}
        </Button>
      </div>

      <StorageSettings />

      {/* Branding */}
      <Card>
        <CardHeader><CardTitle className="text-base">Branding</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Brokerage Name</Label>
            <Input className="mt-1.5" value={form.brokerage_name || ""} onChange={e => set("brokerage_name", e.target.value)} />
          </div>

          {/* Logo Upload */}
          <div>
            <Label>Logo</Label>
            <div className="mt-1.5 flex items-center gap-4">
              {form.logo_url && (
                <img src={form.logo_url} alt="Logo" className="h-14 object-contain border rounded-lg p-1 bg-gray-50" />
              )}
              <label className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
                {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin text-gray-400" /> : <Upload className="w-4 h-4 text-gray-400" />}
                <span className="text-sm text-gray-500">{uploadingLogo ? "Uploading..." : "Upload Logo"}</span>
                <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && handleLogoUpload(e.target.files[0])} />
              </label>
            </div>
          </div>

          {/* CDA Signature Info */}
          <div>
            <Label>CDA Signature</Label>
            <p className="text-xs text-gray-400 mt-0.5">Approved CDAs are signed automatically with the full name of the admin who approves them — no signature image to upload.</p>
          </div>

          {/* Color Pickers */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Primary Color (Sidebar)</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <input type="color" value={form.primary_color || "#1e3a5f"} onChange={e => set("primary_color", e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer border-0" />
                <Input value={form.primary_color || ""} onChange={e => set("primary_color", e.target.value)} className="font-mono" />
              </div>
            </div>
            <div>
              <Label>Accent Color (Highlights)</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <input type="color" value={form.secondary_color || "#c9a84c"} onChange={e => set("secondary_color", e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer border-0" />
                <Input value={form.secondary_color || ""} onChange={e => set("secondary_color", e.target.value)} className="font-mono" />
              </div>
            </div>
            <div className="col-span-2">
              <Label>Sidebar Text Color</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <input type="color" value={form.sidebar_text_color || "#ffffff"} onChange={e => set("sidebar_text_color", e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer border-0" />
                <Input value={form.sidebar_text_color || ""} onChange={e => set("sidebar_text_color", e.target.value)} className="font-mono" placeholder="#ffffff" />
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <div>
            <Label>Sidebar Preview</Label>
            <div className="mt-2 w-48 rounded-xl overflow-hidden shadow-lg" style={{ backgroundColor: form.primary_color || "#1e3a5f" }}>
              <div className="p-4 border-b border-white/10">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="logo" className="h-7 object-contain" />
                ) : (
                  <span className="text-white font-bold text-sm">{form.brokerage_name || "Brokerage"}</span>
                )}
              </div>
              <div className="p-3 space-y-1">
                {["Dashboard", "Transactions", "Agents"].map((item, i) => (
                    <div key={item} className={`px-3 py-2 rounded-lg text-xs font-medium ${i === 0 ? "" : "opacity-60"}`}
                      style={i === 0 ? { backgroundColor: form.secondary_color || "#c9a84c", color: form.sidebar_text_color || "#ffffff" } : { color: form.sidebar_text_color || "#ffffff" }}>
                      {item}
                    </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company Info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Company Information</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Phone</Label>
              <Input className="mt-1.5" value={form.phone || ""} onChange={e => set("phone", e.target.value)} />
            </div>
            <div>
              <Label>Email</Label>
              <Input className="mt-1.5" value={form.email || ""} onChange={e => set("email", e.target.value)} />
            </div>
            <div className="col-span-2">
              <AddressInput
                label="Address"
                value={form.address || ""}
                onChange={v => set("address", v)}
              />
            </div>
            <div>
              <Label>Website</Label>
              <Input className="mt-1.5" value={form.website || ""} onChange={e => set("website", e.target.value)} />
            </div>
            <div>
              <Label>State of Operation</Label>
              <Input className="mt-1.5" value={form.state_of_operation || ""} onChange={e => set("state_of_operation", e.target.value)} placeholder="CO" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Office Desk Fee Plans */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Office Desk Fee Plans</CardTitle>
            <div className="flex items-center gap-2">
              <ListExportImport
                data={form.desk_fee_plans || []}
                filename="desk_fee_plans"
                onImport={async (imported) => {
                  const existing = new Set((form.desk_fee_plans || []).map(p => p.name.toLowerCase()));
                  const merged = [...(form.desk_fee_plans || []), ...imported.filter(p => p.name && !existing.has(p.name.toLowerCase()))];
                  setForm(f => ({ ...f, desk_fee_plans: merged }));
                  if (settings) await base44.entities.BrokerageSettings.update(settings.id, { desk_fee_plans: merged });
                }}
              />
              <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditingDeskFeeIdx(-1)}>
                <Plus className="w-4 h-4" /> Add Plan
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">Define desk fee plans that can be assigned to agents in the Agent Roster.</p>

          {editingDeskFeeIdx !== null && (
            <DeskFeeForm
              plan={editingDeskFeeIdx === -1 ? { name: "", amount: 0, frequency: "monthly", notes: "" } : form.desk_fee_plans[editingDeskFeeIdx]}
              index={editingDeskFeeIdx}
              onSave={async (idx, plan) => {
                const plans = [...(form.desk_fee_plans || [])];
                if (idx === -1) plans.push(plan);
                else plans[idx] = plan;
                const updated = { ...form, desk_fee_plans: plans };
                setForm(updated);
                if (settings) await base44.entities.BrokerageSettings.update(settings.id, { desk_fee_plans: plans });
                else { const created = await base44.entities.BrokerageSettings.create(updated); setSettings(created); }
                setEditingDeskFeeIdx(null);
                setSaved(true); setTimeout(() => setSaved(false), 3000);
              }}
              onCancel={() => setEditingDeskFeeIdx(null)}
              onDelete={async (idx) => {
                const plans = [...(form.desk_fee_plans || [])];
                plans.splice(idx, 1);
                const updated = { ...form, desk_fee_plans: plans };
                setForm(updated);
                if (settings) await base44.entities.BrokerageSettings.update(settings.id, { desk_fee_plans: plans });
                setEditingDeskFeeIdx(null);
                setSaved(true); setTimeout(() => setSaved(false), 3000);
              }}
            />
          )}

          {(form.desk_fee_plans || []).length === 0 ? (
            <p className="text-sm text-gray-400 italic">No desk fee plans yet. Click "Add Plan" to create one.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(form.desk_fee_plans || []).map((plan, i) => (
                <div key={i} onClick={() => setEditingDeskFeeIdx(i)} className="p-4 border rounded-lg bg-white hover:border-gray-400 hover:shadow-md cursor-pointer transition-all">
                  <p className="font-semibold text-gray-900">{plan.name}</p>
                  <p className="text-sm text-gray-600 mt-1">${plan.amount || 0} / {plan.frequency}</p>
                  {plan.notes && <p className="text-xs text-gray-400 mt-2">{plan.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

       {/* Transaction Categories */}
       <Card>
         <CardHeader><CardTitle className="text-base">Transaction Categories</CardTitle></CardHeader>
         <CardContent>
           <CategoryManager />
         </CardContent>
       </Card>

       {/* User Permissions Matrix */}
       <Card>
         <CardHeader><CardTitle className="text-base flex items-center gap-2"><Shield className="w-4 h-4" />User Permissions Matrix</CardTitle></CardHeader>
         <CardContent>
           <UserPermissionsMatrix />
         </CardContent>
       </Card>

       {/* Teams */}
      <Card>
        <CardHeader><CardTitle className="text-base">Teams</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">Create teams that agents can be assigned to.</p>
          <TeamsManager settings={settings} onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }} />
        </CardContent>
      </Card>

      {/* Lead Agents */}
      <Card>
        <CardHeader><CardTitle className="text-base">Lead Agents</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">Designate which agents can be assigned as lead agents.</p>
          <LeadAgentsManager settings={settings} onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }} />
        </CardContent>
      </Card>

      {/* Transaction Coordinators */}
      <Card>
        <CardHeader><CardTitle className="text-base">Transaction Coordinators</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">Designate which agents will handle transaction coordination.</p>
          <TransactionCoordinatorsManager settings={settings} onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }} />
        </CardContent>
      </Card>

      {/* Commission Plans */}
       <Card>
         <CardHeader>
           <div className="flex items-center justify-between">
             <CardTitle className="text-base">Commission Plans</CardTitle>
             <div className="flex items-center gap-2">
               <ListExportImport
                 data={form.commission_plans || []}
                 filename="commission_plans"
                 onImport={async (imported) => {
                   const existing = new Set((form.commission_plans || []).map(p => p.name.toLowerCase()));
                   const merged = [...(form.commission_plans || []), ...imported.filter(p => p.name && !existing.has(p.name.toLowerCase()))];
                   setForm(f => ({ ...f, commission_plans: merged }));
                   if (settings) await base44.entities.BrokerageSettings.update(settings.id, { commission_plans: merged });
                 }}
               />
               <Button size="sm" variant="outline" className="gap-2" onClick={() => setEditingCommissionIdx(-1)}>
                 <Plus className="w-4 h-4" /> Add Plan
               </Button>
             </div>
           </div>
         </CardHeader>
         <CardContent className="space-y-4">
           <p className="text-sm text-gray-500">Define commission plans that can be assigned to agents in the Agent Roster.</p>

           {editingCommissionIdx !== null && (
             <CommissionForm
               plan={editingCommissionIdx === -1 ? { name: "", type: "commission", agent_split: 70, office_split: 30, flat_fee_amount: 0 } : form.commission_plans[editingCommissionIdx]}
               index={editingCommissionIdx}
               onSave={async (idx, plan) => {
                 const plans = [...(form.commission_plans || [])];
                 if (idx === -1) plans.push(plan);
                 else plans[idx] = plan;
                 const updated = { ...form, commission_plans: plans };
                 setForm(updated);
                 if (settings) await base44.entities.BrokerageSettings.update(settings.id, { commission_plans: plans });
                 else { const created = await base44.entities.BrokerageSettings.create(updated); setSettings(created); }
                 setEditingCommissionIdx(null);
                 setSaved(true); setTimeout(() => setSaved(false), 3000);
               }}
               onCancel={() => setEditingCommissionIdx(null)}
               onDelete={async (idx) => {
                 const plans = [...(form.commission_plans || [])];
                 plans.splice(idx, 1);
                 const updated = { ...form, commission_plans: plans };
                 setForm(updated);
                 if (settings) await base44.entities.BrokerageSettings.update(settings.id, { commission_plans: plans });
                 setEditingCommissionIdx(null);
                 setSaved(true); setTimeout(() => setSaved(false), 3000);
               }}
             />
           )}

           {(form.commission_plans || []).length === 0 ? (
             <p className="text-sm text-gray-400 italic">No plans yet. Click "Add Plan" to create one.</p>
           ) : (
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
               {(form.commission_plans || []).map((plan, i) => (
                 <div key={i} onClick={() => setEditingCommissionIdx(i)} className="p-4 border rounded-lg bg-white hover:border-gray-400 hover:shadow-md cursor-pointer transition-all">
                   <p className="font-semibold text-gray-900">{plan.name}</p>
                   <p className="text-sm text-gray-600 mt-1">{plan.type === "flat_fee" ? `$${plan.flat_fee_amount}` : `${plan.agent_split}% / ${plan.office_split}%`}</p>
                   <p className="text-xs text-gray-400 mt-1">{plan.type === "flat_fee" ? "Flat Fee" : "Commission Split"}</p>
                 </div>
               ))}
             </div>
           )}
         </CardContent>
       </Card>

      {/* Agent Document Checklist */}
      <Card>
        <CardHeader><CardTitle className="text-base">Agent Document Checklist</CardTitle></CardHeader>
        <CardContent>
          <AgentDocumentChecklistManager
            settings={settings}
            onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }}
          />
        </CardContent>
      </Card>

      {/* Document File Types */}
      <Card>
        <CardHeader><CardTitle className="text-base">Document File Types</CardTitle></CardHeader>
        <CardContent>
          <FileTypeChecklistManager
            settings={settings}
            onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }}
          />
        </CardContent>
      </Card>

      {/* Vendor List */}
      <Card>
        <CardHeader><CardTitle className="text-base">Expense Vendor List</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">Manage vendors that appear as suggestions when adding expenses.</p>
          <VendorManager />
        </CardContent>
      </Card>

      {/* Office CDA Template */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" />Office CDA Template</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-gray-500">Upload your office's CDA import template (CSV or Excel). Agents will download this as their starting point when importing CDAs.</p>
          {form.cda_template_url ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <FileSpreadsheet className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-green-800">Office CDA Template uploaded</p>
                <p className="text-xs text-green-600 truncate">{form.cda_template_url}</p>
              </div>
              <a href={form.cda_template_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="gap-1.5 border-green-300 text-green-700 hover:bg-green-100">
                  <Download className="w-3.5 h-3.5" /> Download
                </Button>
              </a>
              <Button size="sm" variant="ghost" className="text-red-400 hover:text-red-600" onClick={() => { set("cda_template_url", ""); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <label className="flex items-center gap-3 p-4 border-2 border-dashed border-gray-200 rounded-lg cursor-pointer hover:border-gray-400 transition-colors">
              {uploadingTemplate ? <Loader2 className="w-5 h-5 animate-spin text-gray-400" /> : <Upload className="w-5 h-5 text-gray-400" />}
              <span className="text-sm text-gray-500">{uploadingTemplate ? "Uploading..." : "Click to upload CSV or Excel template"}</span>
              <input type="file" className="hidden" accept=".csv,.xls,.xlsx" onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                setUploadingTemplate(true);
                const { file_url } = await base44.integrations.Core.UploadFile({ file });
                set("cda_template_url", file_url);
                setUploadingTemplate(false);
              }} />
            </label>
          )}
          {form.cda_template_url && (
            <p className="text-xs text-gray-400">Click Save Settings above to persist this change.</p>
          )}
        </CardContent>
      </Card>

      {/* Notification Settings */}
      <Card>
        <CardHeader><CardTitle className="text-base">Notification Settings</CardTitle></CardHeader>
        <CardContent>
          <NotificationSettingsManager
            settings={settings}
            onSaved={() => { setSaved(true); setTimeout(() => setSaved(false), 3000); }}
          />
        </CardContent>
      </Card>

      {/* Email Templates */}
      <Card>
        <CardHeader><CardTitle className="text-base">Email Templates</CardTitle></CardHeader>
        <CardContent>
          <EmailTemplatesManager
            settings={settings}
            onSaved={async () => {
              const data = await base44.entities.BrokerageSettings.list();
              if (data?.length > 0) setSettings(data[0]);
              setSaved(true);
              setTimeout(() => setSaved(false), 3000);
            }}
          />
        </CardContent>
      </Card>

      {/* Backup Data */}
      <Card>
        <CardHeader><CardTitle className="text-base">Backup & Restore Data</CardTitle></CardHeader>
        <CardContent>
          <BackupDataSection />
        </CardContent>
      </Card>
    </div>
  );
}