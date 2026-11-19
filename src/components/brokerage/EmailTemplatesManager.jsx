import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Pencil, RotateCcw, ChevronDown, ChevronUp, CheckCircle2, Loader2 } from "lucide-react";

const DEFAULT_TEMPLATES = {
  cda_submitted: {
    label: "CDA Submitted (Admin Notification)",
    description: "Sent to all admins when an agent submits a new CDA.",
    subject: "New CDA Submitted — {{property_address}}",
    body: `A new Commission Disbursement Authorization has been submitted and requires your review.

Agent: {{agent_name}}
Property: {{property_address}}
Sale Price: {{sale_price}}
Agent Commission: {{agent_commission}}
Closing Date: {{closing_date}}

Click the button in the email to review the CDA in the system.`,
    variables: ["{{agent_name}}", "{{property_address}}", "{{sale_price}}", "{{agent_commission}}", "{{closing_date}}"],
  },
  cda_approved: {
    label: "CDA Approved (Agent & Title Notification)",
    description: "Sent to the agent, all admins, and the title company when a CDA is approved.",
    subject: "Your CDA has been approved – {{property_address}}",
    body: `Dear {{title_company_name}},

Please find the Commission Disbursement Authorization for the following transaction. Kindly disburse commissions at closing as outlined below.

Property: {{property_address}}
Closing Date: {{closing_date}}
Sale Price: {{sale_price}}
Total Commission: {{total_commission}}

Agent Net Commission: {{agent_net_commission}}
Office Commission: {{office_commission}}

If you have any questions, please contact us at {{brokerage_email}}.

Thank you,
{{brokerage_name}}`,
    variables: ["{{agent_name}}", "{{title_company_name}}", "{{property_address}}", "{{closing_date}}", "{{sale_price}}", "{{total_commission}}", "{{agent_net_commission}}", "{{office_commission}}", "{{brokerage_email}}", "{{brokerage_name}}", "{{cda_link}}"],
  },
};

export default function EmailTemplatesManager({ settings, onSaved }) {
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null); // template key being edited
  const [editForm, setEditForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(null);
  const [confirmRevert, setConfirmRevert] = useState(null);

  const templates = settings?.email_templates || {};

  const getTemplate = (key) => templates[key] || null;
  const isCustomized = (key) => !!templates[key];

  const startEdit = (key) => {
    const custom = getTemplate(key);
    setEditForm({
      subject: custom?.subject ?? DEFAULT_TEMPLATES[key].subject,
      body: custom?.body ?? DEFAULT_TEMPLATES[key].body,
    });
    setEditing(key);
    setExpanded(key);
  };

  const handleSave = async (key) => {
    setSaving(true);
    const updated = {
      ...templates,
      [key]: { subject: editForm.subject, body: editForm.body },
    };
    await base44.entities.BrokerageSettings.update(settings.id, { email_templates: updated });
    setSaving(false);
    setEditing(null);
    setSaved(key);
    setTimeout(() => setSaved(null), 2500);
    onSaved?.();
  };

  const handleRevert = async (key) => {
    setSaving(true);
    const updated = { ...templates };
    delete updated[key];
    await base44.entities.BrokerageSettings.update(settings.id, { email_templates: updated });
    setSaving(false);
    setConfirmRevert(null);
    setEditing(null);
    setSaved(key);
    setTimeout(() => setSaved(null), 2500);
    onSaved?.();
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Customize the subject and body of system notification emails. Use the variables listed for each template to insert dynamic data.
      </p>

      {Object.entries(DEFAULT_TEMPLATES).map(([key, def]) => {
        const isOpen = expanded === key;
        const isEdit = editing === key;
        const customized = isCustomized(key);
        const current = getTemplate(key) || def;

        return (
          <div key={key} className="border rounded-xl overflow-hidden bg-white">
            {/* Header row */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpanded(isOpen ? null : key)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm">{def.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{def.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3" onClick={e => e.stopPropagation()}>
                {saved === key && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {customized ? (
                  <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs">Customized</Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-500 text-xs">Default</Badge>
                )}
                <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => startEdit(key)}>
                  <Pencil className="w-3 h-3" /> Edit
                </Button>
                {customized && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5 h-7 text-xs text-orange-600 border-orange-300 hover:bg-orange-50"
                    onClick={() => setConfirmRevert(key)}
                  >
                    <RotateCcw className="w-3 h-3" /> Revert
                  </Button>
                )}
                {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </div>

            {/* Revert confirmation */}
            {confirmRevert === key && (
              <div className="px-4 py-3 bg-orange-50 border-t flex items-center gap-3">
                <p className="text-sm text-orange-700 flex-1">Revert to the default template? Your customizations will be lost.</p>
                <Button size="sm" className="bg-orange-500 hover:bg-orange-600 h-7 text-xs" disabled={saving} onClick={() => handleRevert(key)}>
                  {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Yes, Revert"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setConfirmRevert(null)}>Cancel</Button>
              </div>
            )}

            {/* Expanded content */}
            {isOpen && (
              <div className="px-4 pb-4 pt-2 border-t bg-gray-50 space-y-3">
                {isEdit ? (
                  <>
                    <div>
                      <Label className="text-xs">Subject Line</Label>
                      <Input
                        className="mt-1 text-sm"
                        value={editForm.subject}
                        onChange={e => setEditForm(f => ({ ...f, subject: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Email Body (plain text / HTML)</Label>
                      <Textarea
                        className="mt-1 text-sm font-mono min-h-48"
                        value={editForm.body}
                        onChange={e => setEditForm(f => ({ ...f, body: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-gray-500 font-medium self-center">Variables:</span>
                      {def.variables.map(v => (
                        <button
                          key={v}
                          className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-mono hover:bg-blue-100 transition-colors"
                          onClick={() => setEditForm(f => ({ ...f, body: f.body + v }))}
                          title="Click to append to body"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1 border-t">
                      <Button size="sm" className="gap-1.5" disabled={saving} onClick={() => handleSave(key)}>
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save Template"}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Subject</p>
                      <p className="text-sm text-gray-800 bg-white border rounded px-3 py-2 font-mono">{current.subject}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Body Preview</p>
                      <pre className="text-xs text-gray-700 bg-white border rounded px-3 py-2 whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">{current.body}</pre>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}