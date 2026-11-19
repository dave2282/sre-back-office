import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Search, ExternalLink, AlertCircle, Pencil, Trash2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import DownloadCDAButton from "@/components/transactions/DownloadCDAButton";
import { format } from "date-fns";

const statusColors = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  correction_needed: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  paid: "bg-emerald-100 text-emerald-700",
};

export default function MyTransactions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [settings, setSettings] = useState(null);
  const [editTxn, setEditTxn] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);
  const [deleteTxn, setDeleteTxn] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      const adminViewingRaw = localStorage.getItem("adminViewingAgent");
      const adminViewing = adminViewingRaw ? JSON.parse(adminViewingRaw) : null;
      const targetEmail = (adminViewing && (me.role === "admin" || me.role === "staff")) ? adminViewing.email : me.email;
      const [myTxns, settingsList, allAgents] = await Promise.all([
        base44.entities.Transaction.filter({ agent_email: targetEmail }, "-created_date", 100),
        base44.entities.BrokerageSettings.list(),
        base44.entities.Agent.list(),
      ]);

      // Also load transactions for agents where this user is a TC
      const tcForAgents = (allAgents || []).filter(a =>
        (a.transaction_coordinators || []).includes(targetEmail)
      );
      let tcTxns = [];
      if (tcForAgents.length > 0) {
        const tcArrays = await Promise.all(
          tcForAgents.map(a => base44.entities.Transaction.filter({ agent_email: a.user_email }, "-created_date", 100))
        );
        tcTxns = tcArrays.flat();
      }

      const allTxns = [...(myTxns || []), ...tcTxns.filter(t => !(myTxns || []).find(m => m.id === t.id))];
      setTransactions(allTxns);
      if (settingsList?.length > 0) setSettings(settingsList[0]);
      setLoading(false);
    };
    load();
  }, []);

  const canAgentModify = (t) => ['draft', 'submitted', 'correction_needed'].includes(t.status);

  const handleEditSave = async () => {
    setEditSaving(true);
    await base44.entities.Transaction.update(editTxn.id, editForm);
    setTransactions(prev => prev.map(t => t.id === editTxn.id ? { ...t, ...editForm } : t));
    setEditTxn(null);
    setEditSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await base44.entities.Transaction.delete(deleteTxn.id);
    setTransactions(prev => prev.filter(t => t.id !== deleteTxn.id));
    setSelected(null);
    setDeleteTxn(null);
    setDeleting(false);
  };

  const filtered = transactions.filter(t => {
    const matchSearch = !search || t.property_address?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || t.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (loading) return <div className="flex items-center justify-center h-full p-12"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Transactions</h1>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search by address..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="correction_needed">Correction Needed</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
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
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-gray-900">{t.property_address}</p>
                      {t.status === "correction_needed" && (
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {t.city}{t.state ? `, ${t.state}` : ""} · {t.transaction_type?.replace(/_/g, " ")} · {t.closing_date ? format(new Date(t.closing_date), "MMM d, yyyy") : "—"}
                    </p>
                    {t.status === "correction_needed" && t.correction_notes && (
                      <div className="mt-2 p-2 bg-orange-50 rounded text-sm text-orange-700">
                        <strong>Admin note:</strong> {t.correction_notes}
                      </div>
                    )}

                  </div>
                  <div className="text-right ml-4">
                    <p className="font-bold text-gray-900">${(t.agent_gross_commission || 0).toLocaleString()}</p>
                    <Badge className={`text-xs mt-1 ${statusColors[t.status]}`}>{t.status?.replace(/_/g, " ")}</Badge>
                  </div>
                </div>

                {selected?.id === t.id && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                      <div><p className="text-gray-400">Sale Price</p><p className="font-medium">${(t.sale_price || 0).toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Commission %</p><p className="font-medium">{t.total_commission_percentage}%</p></div>
                      <div><p className="text-gray-400">Agent Split</p><p className="font-medium">{t.agent_split_percentage}%</p></div>
                      <div><p className="text-gray-400">Gross Commission</p><p className="font-medium">${(t.agent_gross_commission || 0).toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Referral Fee</p><p className="font-medium">${(t.referral_fee_amount || 0).toLocaleString()}</p></div>
                      <div><p className="text-gray-400">Net Commission</p><p className="font-bold">${(t.agent_net_commission || 0).toLocaleString()}</p></div>
                      {t.purchase_agreement_url && (
                        <div className="col-span-2">
                          <a href={t.purchase_agreement_url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                            <ExternalLink className="w-3 h-3" /> Purchase Agreement
                          </a>
                        </div>
                      )}
                      {t.additional_docs && t.additional_docs.map((doc, idx) => (
                        <div key={idx} className="col-span-2">
                          <a href={doc.url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                            <ExternalLink className="w-3 h-3" /> {doc.name}
                          </a>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 pt-3 border-t flex items-center gap-2 flex-wrap">
                      <DownloadCDAButton transaction={t} settings={settings} />
                      {canAgentModify(t) && (
                        <>
                          <Button size="sm" variant="outline" className="gap-1.5" onClick={e => { e.stopPropagation(); setEditForm({ property_address: t.property_address, closing_date: t.closing_date, buyer_name: t.buyer_name, seller_name: t.seller_name, notes: t.notes, title_company_name: t.title_company_name, title_company_email: t.title_company_email, title_company_phone: t.title_company_phone }); setEditTxn(t); }}>
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50" onClick={e => { e.stopPropagation(); setDeleteTxn(t); }}>
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Transaction Dialog */}
      <Dialog open={!!editTxn} onOpenChange={open => !open && setEditTxn(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Transaction</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Property Address</Label><Input className="mt-1.5" value={editForm.property_address || ""} onChange={e => setEditForm(f => ({ ...f, property_address: e.target.value }))} /></div>
            <div><Label>Closing Date</Label><Input type="date" className="mt-1.5" value={editForm.closing_date || ""} onChange={e => setEditForm(f => ({ ...f, closing_date: e.target.value }))} /></div>
            <div><Label>Buyer Name(s)</Label><Input className="mt-1.5" value={editForm.buyer_name || ""} onChange={e => setEditForm(f => ({ ...f, buyer_name: e.target.value }))} /></div>
            <div><Label>Seller Name(s)</Label><Input className="mt-1.5" value={editForm.seller_name || ""} onChange={e => setEditForm(f => ({ ...f, seller_name: e.target.value }))} /></div>
            <div><Label>Title Company</Label><Input className="mt-1.5" value={editForm.title_company_name || ""} onChange={e => setEditForm(f => ({ ...f, title_company_name: e.target.value }))} /></div>
            <div><Label>Notes</Label><Input className="mt-1.5" value={editForm.notes || ""} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTxn(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving}>{editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTxn} onOpenChange={open => !open && setDeleteTxn(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete CDA?</DialogTitle></DialogHeader>
          <p className="text-sm text-red-600 py-2">Permanently delete the CDA for <strong>{deleteTxn?.property_address}</strong>? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTxn(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={deleting}>{deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}