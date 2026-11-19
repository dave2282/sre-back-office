import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, CheckCircle, XCircle, ExternalLink, FileText, Loader2, Upload, Trash2 } from "lucide-react";
import UploadCDAExcelDialog from "@/components/transactions/UploadCDAExcelDialog";
import DownloadCDAButton from "@/components/transactions/DownloadCDAButton";
import AddressInput from "@/components/shared/AddressInput";
import { sendCDAApprovedEmail } from "@/utils/cdaEmails";
import { resolveApproverName } from "@/utils/resolveApproverName";
import { format } from "date-fns";

const statusColors = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  correction_needed: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  paid: "bg-emerald-100 text-emerald-700",
};

export default function AllTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [correctionNotes, setCorrectionNotes] = useState("");
  const [actionDialog, setActionDialog] = useState(null); // {type: 'approve'|'correct'|'paid'|'edit', transaction}
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [showUploadExcel, setShowUploadExcel] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [agentForApproval, setAgentForApproval] = useState(null);

  const load = async () => {
    const [txns, settingsList] = await Promise.all([
      base44.entities.Transaction.list("-created_date", 500),
      base44.entities.BrokerageSettings.list(),
    ]);
    setTransactions(txns || []);
    if (settingsList?.length > 0) setSettings(settingsList[0]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = transactions.filter(t => {
    const matchSearch = !search ||
      t.property_address?.toLowerCase().includes(search.toLowerCase()) ||
      t.agent_name?.toLowerCase().includes(search.toLowerCase()) ||
      t.agent_email?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleAction = async () => {
    const { type, transaction } = actionDialog;
    setSaving(true);
    const me = await base44.auth.me();
    let updates = {};
    if (type === "approve") {
      updates = { status: "approved", approved_by: me.email, approved_date: new Date().toISOString().split("T")[0] };
      await base44.entities.Transaction.update(transaction.id, updates);
      // Send approval notification email (replaces backend sendApprovalEmail function)
      const updatedTxn = { ...transaction, ...updates };
      const approverName = me.full_name || await resolveApproverName(me.email);
      const agentForEmail = agentForApproval || null;
      sendCDAApprovedEmail(updatedTxn, settings, approverName, agentForEmail).catch(() => {});
      await load();
      setActionDialog(null);
      setSelected(null);
      setSaving(false);
      return;
    } else if (type === "correct") {
      updates = { status: "correction_needed", correction_notes: correctionNotes };
    } else if (type === "paid") {
      updates = { status: "paid", paid_date: new Date().toISOString().split("T")[0] };
    } else if (type === "edit") {
      const { id, created_date, updated_date, created_by_id, latest_cda_pdf_url, ...editData } = editForm;
      updates = editData;
      await base44.entities.Transaction.update(transaction.id, updates);
      await load();
      setActionDialog(null);
      setSelected(null);
      setEditForm({});
      setSaving(false);
      return;
    } else if (type === "delete") {
      await base44.entities.Transaction.delete(transaction.id);
      await load();
      setActionDialog(null);
      setSelected(null);
      setSaving(false);
      return;
    }
    await base44.entities.Transaction.update(transaction.id, updates);
    await load();
    setActionDialog(null);
    setSelected(null);
    setCorrectionNotes("");
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center h-full p-12"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All Transactions</h1>
        <Button onClick={() => setShowUploadExcel(true)} className="gap-2"><Upload className="w-4 h-4" />Import Excel</Button>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search address or agent..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="correction_needed">Correction Needed</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No transactions found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <Card key={t.id} className={`cursor-pointer hover:shadow-md transition-shadow ${selected?.id === t.id ? "ring-2 ring-gray-900" : ""}`}
              onClick={() => setSelected(selected?.id === t.id ? null : t)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{t.property_address}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {t.agent_name || t.agent_email} · {t.transaction_type?.replace(/_/g, " ")} · {t.closing_date ? format(new Date(t.closing_date), "MMM d, yyyy") : "—"}
                    </p>
                  </div>
                  <div className="text-right ml-4">
                    <p className="font-bold text-gray-900">${(t.agent_gross_commission || 0).toLocaleString()}</p>
                    <Badge className={`text-xs mt-1 ${statusColors[t.status]}`}>{t.status?.replace(/_/g, " ")}</Badge>
                  </div>
                </div>

                {selected?.id === t.id && (
                  <div className="mt-4 pt-4 border-t space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
                      <div><p className="text-gray-400">Sale Price</p><p className="font-medium">${(t.sale_price || 0).toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Total Commission</p><p className="font-medium">{t.total_commission_percentage}% = ${(t.total_commission_amount || 0).toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Agent Split</p><p className="font-medium">{t.agent_split_percentage}% / {t.company_split_percentage}%</p></div>
                      <div><p className="text-gray-400">Agent Gross</p><p className="font-medium">${(t.agent_gross_commission || 0).toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Company Gross</p><p className="font-medium font-semibold text-green-700">${(t.company_gross_commission || 0).toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Referral Fee</p><p className="font-medium">${(t.referral_fee_amount || 0).toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Agent Net</p><p className="font-bold">${(t.agent_net_commission || 0).toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Title Company</p><p className="font-medium">{t.title_company_name || "—"}</p></div>
                    </div>

                    {/* Documents */}
                    <div className="flex gap-3 flex-wrap">
                      {t.purchase_agreement_url && (
                        <a href={t.purchase_agreement_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
                          <ExternalLink className="w-3 h-3" /> Purchase Agreement
                        </a>
                      )}
                      {t.counter_proposal_url && (
                        <a href={t.counter_proposal_url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
                          <ExternalLink className="w-3 h-3" /> Counter Proposal
                        </a>
                      )}
                      {t.additional_docs && t.additional_docs.map((doc, idx) => (
                        <a key={idx} href={doc.url} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
                          <ExternalLink className="w-3 h-3" /> {doc.name}
                        </a>
                      ))}
                    </div>

                    {/* PDF Download */}
                    <div className="flex gap-2">
                      <DownloadCDAButton transaction={t} settings={settings} />
                      <DownloadCDAButton transaction={t} settings={settings} size="sm" variant="outline" label="Regenerate CDA PDF" forceRegenerate />
                    </div>

                    {/* Admin Actions */}
                    <div className="flex gap-2 pt-2 border-t flex-wrap">
                      <Button size="sm" variant="outline" className="gap-1.5"
                        onClick={e => { e.stopPropagation(); setEditForm({...t}); setActionDialog({ type: "edit", transaction: t }); }}>
                        Edit
                      </Button>
                      {(t.status === "submitted" || t.status === "correction_needed") && (
                        <>
                          <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
                            onClick={async e => { e.stopPropagation(); const agents = await base44.entities.Agent.filter({ user_email: t.agent_email }); setAgentForApproval(agents?.[0] || null); setActionDialog({ type: "approve", transaction: t }); }}>
                            <CheckCircle className="w-4 h-4" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5 text-orange-600 border-orange-300 hover:bg-orange-50"
                            onClick={e => { e.stopPropagation(); setActionDialog({ type: "correct", transaction: t }); }}>
                            <XCircle className="w-4 h-4" /> Request Correction
                          </Button>
                        </>
                      )}
                      {t.status === "approved" && (
                        <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                          onClick={e => { e.stopPropagation(); setActionDialog({ type: "paid", transaction: t }); }}>
                          <CheckCircle className="w-4 h-4" /> Mark as Paid
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50 ml-auto"
                        onClick={e => { e.stopPropagation(); setActionDialog({ type: "delete", transaction: t }); }}>
                        <Trash2 className="w-4 h-4" /> Delete
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <UploadCDAExcelDialog open={showUploadExcel} onClose={() => setShowUploadExcel(false)} onImported={load} />

      {/* Action Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => setActionDialog(null)}>
        <DialogContent className={actionDialog?.type === "edit" ? "max-w-lg max-h-[90vh] overflow-y-auto" : ""}>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "approve" ? "Approve CDA" :
               actionDialog?.type === "paid" ? "Mark as Paid" :
               actionDialog?.type === "delete" ? "Delete Transaction" :
               actionDialog?.type === "edit" ? "Edit Transaction" : "Request Correction"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2">
            {actionDialog?.type === "correct" && (
              <div>
                <Label>Correction Notes for Agent</Label>
                <Textarea className="mt-2" rows={4} placeholder="Describe what needs to be corrected..."
                  value={correctionNotes} onChange={e => setCorrectionNotes(e.target.value)} />
              </div>
            )}
            {actionDialog?.type === "approve" && (
              <div className="space-y-3">
                {!agentForApproval?.mailing_address && (
                  <div className="p-3 bg-red-50 border border-red-300 rounded-lg text-sm text-red-800">
                    <strong>⚠️ Cannot Approve — Mailing Address Missing</strong>
                    <p className="mt-1">Agent <strong>{actionDialog.transaction?.agent_name}</strong> does not have a mailing address on file. The CDA requires a mailing address for the commission check. Ask the agent to update their profile, or edit the agent record in the roster.</p>
                  </div>
                )}
                {agentForApproval?.mailing_address && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900 space-y-1">
                    <p><strong>Agent check payable to:</strong> {actionDialog.transaction?.commission_check_payable_to || actionDialog.transaction?.agent_name}</p>
                    <p><strong>Mail to:</strong> {agentForApproval.mailing_address}</p>
                  </div>
                )}
                <p className="text-sm text-gray-600">
                  Approve this CDA for <strong>{actionDialog.transaction?.property_address}</strong>?
                  An approval email with disbursement details will be sent to the agent and a copy saved for the title company (<strong>{actionDialog.transaction?.title_company_name}</strong>).
                </p>
              </div>
            )}
            {actionDialog?.type === "paid" && (
              <p className="text-sm text-gray-600">
                Mark commission as paid for <strong>{actionDialog.transaction?.property_address}</strong>?
              </p>
            )}
            {actionDialog?.type === "delete" && (
              <p className="text-sm text-red-600">
                Permanently delete this transaction for <strong>{actionDialog.transaction?.property_address}</strong>? This cannot be undone.
              </p>
            )}
            {actionDialog?.type === "edit" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Property Address</Label>
                    <Input className="mt-1.5" value={editForm.property_address || ""} onChange={e => setEditForm({...editForm, property_address: e.target.value})} />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input className="mt-1.5" value={editForm.city || ""} onChange={e => setEditForm({...editForm, city: e.target.value})} />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input className="mt-1.5" value={editForm.state || ""} onChange={e => setEditForm({...editForm, state: e.target.value})} />
                  </div>
                  <div>
                    <Label>ZIP</Label>
                    <Input className="mt-1.5" value={editForm.zip || ""} onChange={e => setEditForm({...editForm, zip: e.target.value})} />
                  </div>
                  <div>
                    <Label>Sale Price</Label>
                    <Input type="number" className="mt-1.5" value={editForm.sale_price || ""} onChange={e => setEditForm({...editForm, sale_price: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div>
                    <Label>Total Commission %</Label>
                    <Input type="number" className="mt-1.5" value={editForm.total_commission_percentage || ""} onChange={e => setEditForm({...editForm, total_commission_percentage: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div>
                    <Label>Agent Split %</Label>
                    <Input type="number" className="mt-1.5" value={editForm.agent_split_percentage || ""} onChange={e => setEditForm({...editForm, agent_split_percentage: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div>
                    <Label>Company Split %</Label>
                    <Input type="number" className="mt-1.5" value={editForm.company_split_percentage || ""} onChange={e => setEditForm({...editForm, company_split_percentage: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div>
                    <Label>Closing Date</Label>
                    <Input type="date" className="mt-1.5" value={editForm.closing_date || ""} onChange={e => setEditForm({...editForm, closing_date: e.target.value})} />
                  </div>
                  <div>
                    <Label>Contract Date</Label>
                    <Input type="date" className="mt-1.5" value={editForm.contract_date || ""} onChange={e => setEditForm({...editForm, contract_date: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <Label>Title Company</Label>
                    <Input className="mt-1.5" value={editForm.title_company_name || ""} onChange={e => setEditForm({...editForm, title_company_name: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <Label>Title Company Email</Label>
                    <Input className="mt-1.5" value={editForm.title_company_email || ""} onChange={e => setEditForm({...editForm, title_company_email: e.target.value})} />
                  </div>
                  <div>
                    <Label>Agent Gross Commission</Label>
                    <Input type="number" className="mt-1.5" value={editForm.agent_gross_commission || ""} onChange={e => setEditForm({...editForm, agent_gross_commission: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div>
                    <Label>Company Gross Commission</Label>
                    <Input type="number" className="mt-1.5" value={editForm.company_gross_commission || ""} onChange={e => setEditForm({...editForm, company_gross_commission: parseFloat(e.target.value) || 0})} />
                  </div>
                  <div className="col-span-2">
                    <Label>Agent Net Commission</Label>
                    <Input type="number" className="mt-1.5" value={editForm.agent_net_commission || ""} onChange={e => setEditForm({...editForm, agent_net_commission: parseFloat(e.target.value) || 0})} />
                  </div>
                </div>

                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Mailing Addresses (for Checks)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Agent Check Payable To</Label>
                    <Input className="mt-1.5" value={editForm.commission_check_payable_to || ""} onChange={e => setEditForm({...editForm, commission_check_payable_to: e.target.value})} />
                  </div>
                  <div className="col-span-2">
                    <AddressInput
                      label="Agent Mailing Address (for commission check)"
                      value={editForm.agent_mailing_address || ""}
                      onChange={v => setEditForm({...editForm, agent_mailing_address: v})}
                    />
                  </div>
                </div>

                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Referrals & Mailing Addresses</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Referral 1 Name</Label><Input className="mt-1.5" value={editForm.referral_1_name || ""} onChange={e => setEditForm({...editForm, referral_1_name: e.target.value})} /></div>
                  <div><Label>Referral 1 Amount $</Label><Input type="number" className="mt-1.5" value={editForm.referral_1_amount || ""} onChange={e => setEditForm({...editForm, referral_1_amount: parseFloat(e.target.value) || 0})} /></div>
                  <div className="col-span-2"><AddressInput label="Referral 1 Mailing Address" value={editForm.referral_1_mailing_address || ""} onChange={v => setEditForm({...editForm, referral_1_mailing_address: v})} /></div>

                  <div><Label>Referral 2 Name</Label><Input className="mt-1.5" value={editForm.referral_2_name || ""} onChange={e => setEditForm({...editForm, referral_2_name: e.target.value})} /></div>
                  <div><Label>Referral 2 Amount $</Label><Input type="number" className="mt-1.5" value={editForm.referral_2_amount || ""} onChange={e => setEditForm({...editForm, referral_2_amount: parseFloat(e.target.value) || 0})} /></div>
                  <div className="col-span-2"><AddressInput label="Referral 2 Mailing Address" value={editForm.referral_2_mailing_address || ""} onChange={v => setEditForm({...editForm, referral_2_mailing_address: v})} /></div>

                  <div><Label>Referral 3 Name</Label><Input className="mt-1.5" value={editForm.referral_3_name || ""} onChange={e => setEditForm({...editForm, referral_3_name: e.target.value})} /></div>
                  <div><Label>Referral 3 Amount $</Label><Input type="number" className="mt-1.5" value={editForm.referral_3_amount || ""} onChange={e => setEditForm({...editForm, referral_3_amount: parseFloat(e.target.value) || 0})} /></div>
                  <div className="col-span-2"><AddressInput label="Referral 3 Mailing Address" value={editForm.referral_3_mailing_address || ""} onChange={v => setEditForm({...editForm, referral_3_mailing_address: v})} /></div>

                  <div><Label>Referral 4 Name</Label><Input className="mt-1.5" value={editForm.referral_4_name || ""} onChange={e => setEditForm({...editForm, referral_4_name: e.target.value})} /></div>
                  <div><Label>Referral 4 Amount $</Label><Input type="number" className="mt-1.5" value={editForm.referral_4_amount || ""} onChange={e => setEditForm({...editForm, referral_4_amount: parseFloat(e.target.value) || 0})} /></div>
                  <div className="col-span-2"><AddressInput label="Referral 4 Mailing Address" value={editForm.referral_4_mailing_address || ""} onChange={v => setEditForm({...editForm, referral_4_mailing_address: v})} /></div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setActionDialog(null)}>Cancel</Button>
            <Button onClick={handleAction} disabled={saving || (actionDialog?.type === "correct" && !correctionNotes) || (actionDialog?.type === "approve" && !agentForApproval?.mailing_address)}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}