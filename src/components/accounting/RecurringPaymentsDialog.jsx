import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, RefreshCw, Trash2, ChevronDown, ChevronUp, Pencil, Check, X } from "lucide-react";
import ApplyEntryTo from "@/components/accounting/ApplyEntryTo";
import { format, parseISO } from "date-fns";

function safeDate(str) {
  if (!str) return "—";
  try {
    const d = str.includes("T") ? parseISO(str) : parseISO(str + "T00:00:00");
    return format(d, "MM/dd/yyyy");
  } catch { return str; }
}

const inferFrequency = (sortedEntries) => {
  if (sortedEntries.length < 2) return null;
  const dates = sortedEntries.map(e => e.closing_date).filter(Boolean).sort();
  const gaps = [];
  for (let i = 1; i < dates.length; i++) {
    const a = new Date(dates[i - 1]);
    const b = new Date(dates[i]);
    gaps.push(Math.round((b - a) / (1000 * 60 * 60 * 24)));
  }
  const avg = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  if (avg <= 1) return { label: "Daily", days: 1 };
  if (avg <= 8) return { label: "Weekly", days: 7 };
  if (avg <= 16) return { label: "Bi-weekly", days: 14 };
  if (avg <= 50) return { label: "Monthly", monthly: true };
  if (avg <= 100) return { label: "Quarterly", quarterly: true };
  return { label: "Yearly", days: 365 };
};

const projectFutureDates = (sortedEntries, freq, count = 12) => {
  if (!freq) return [];
  const lastDate = sortedEntries[sortedEntries.length - 1]?.closing_date;
  if (!lastDate) return [];
  const today = new Date().toISOString().split("T")[0];
  const future = [];
  let current = new Date(lastDate + "T00:00:00");
  for (let i = 0; i < count; i++) {
    if (freq.monthly) current.setMonth(current.getMonth() + 1);
    else if (freq.quarterly) current.setMonth(current.getMonth() + 3);
    else current.setDate(current.getDate() + freq.days);
    const d = current.toISOString().split("T")[0];
    if (d > today) future.push(d);
  }
  return future;
};

export default function RecurringPaymentsDialog({ open, onClose, onStopped }) {
  const [entries, setEntries] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ label: "", amount: "" });
  const [editAgentScope, setEditAgentScope] = useState("all");
  const [editSelectedAgents, setEditSelectedAgents] = useState([]);
  const [saving, setSaving] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = async () => {
    setLoading(true);
    const [all, agentList] = await Promise.all([
      base44.entities.AccountingEntry.list("-closing_date", 1000),
      base44.entities.Agent.filter({ status: "active" }),
    ]);
    setEntries((all || []).filter(e => e.recurring_id));
    setAgents(agentList || []);
    setLoading(false);
  };

  useEffect(() => { if (open) load(); }, [open]);

  const groups = useMemo(() => {
    const map = {};
    entries.forEach(e => {
      if (!map[e.recurring_id]) map[e.recurring_id] = { id: e.recurring_id, label: e.recurring_label || e.property_address, entries: [] };
      map[e.recurring_id].entries.push(e);
    });
    Object.values(map).forEach(g => {
      g.entries.sort((a, b) => (a.closing_date || "") < (b.closing_date || "") ? -1 : 1);
      g.frequency = inferFrequency(g.entries);
      g.projectedDates = projectFutureDates(g.entries, g.frequency);
    });
    return Object.values(map);
  }, [entries]);

  const today = new Date().toISOString().split("T")[0];

  const startEdit = (group, e) => {
    e.stopPropagation();
    const template = group.entries.find(en => en.closing_date >= today) || group.entries[group.entries.length - 1];
    setEditing(group.id);
    setExpanded(group.id); // ensure card is expanded so edit panel is visible
    setEditForm({
      label: group.label,
      amount: template?.company_gross_commission || 0,
    });
    if (template?.agent_email) {
      setEditAgentScope("select");
      setEditSelectedAgents([template.agent_email]);
    } else {
      setEditAgentScope("all");
      setEditSelectedAgents([]);
    }
  };

  const handleSaveEdit = async (group, e) => {
    e.stopPropagation();
    setSaving(group.id);
    const futureEntries = group.entries.filter(en => en.closing_date >= today && en.status !== "paid");
    const targetAgents = editAgentScope === "all"
      ? agents
      : agents.filter(a => editSelectedAgents.includes(a.user_email));
    const firstAgent = targetAgents[0];
    await Promise.all(futureEntries.map(en =>
      base44.entities.AccountingEntry.update(en.id, {
        recurring_label: editForm.label,
        property_address: editForm.label,
        company_gross_commission: parseFloat(editForm.amount) || 0,
        agent_email: firstAgent?.user_email || undefined,
        agent_name: firstAgent?.full_name || undefined,
      })
    ));
    setSaving(null);
    setEditing(null);
    await load();
    onStopped?.();
  };

  const handleDeleteFuture = async (group) => {
    setSaving(`delete-${group.id}`);
    const toDelete = group.entries.filter(e => e.closing_date >= today && e.status !== "paid");
    await Promise.all(toDelete.map(e => base44.entities.AccountingEntry.delete(e.id)));
    setSaving(null);
    setConfirmDelete(null);
    await load();
    onStopped?.();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-600" /> Recurring Payments
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <RefreshCw className="w-8 h-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No recurring payment series found.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map(group => {
              const upcoming = group.entries.filter(e => e.closing_date >= today && e.status !== "paid");
              const isExpanded = expanded === group.id;
              const isEditing = editing === group.id;
              const isConfirmingDelete = confirmDelete?.id === group.id;
              const template = group.entries.find(en => en.closing_date >= today) || group.entries[group.entries.length - 1];
              const txType = template?.transaction_type;
              const typeLabel = txType === "desk_fee" ? "Desk Fee" : txType === "misc_income" ? "Misc. Income" : txType || "Entry";
              const nextEntry = [...upcoming].sort((a, b) => a.closing_date < b.closing_date ? -1 : 1)[0];

              return (
                <div key={group.id} className="border rounded-xl overflow-hidden bg-white">
                  {isConfirmingDelete && (
                    <div className="px-4 py-4 bg-red-50 border-b space-y-2" onClick={e => e.stopPropagation()}>
                      <p className="text-sm font-semibold text-red-700">Delete all {upcoming.length} future unpaid entries for "{group.label}"?</p>
                      <p className="text-xs text-red-500">Past and paid entries will not be affected.</p>
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="gap-1.5 bg-red-600 hover:bg-red-700" disabled={saving === `delete-${group.id}`} onClick={() => handleDeleteFuture(group)}>
                          {saving === `delete-${group.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Yes, Delete Future
                        </Button>
                        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setConfirmDelete(null); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpanded(isExpanded ? null : group.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-gray-900 truncate">{group.label}</p>
                        <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs">{typeLabel}</Badge>
                        <span className="font-semibold text-green-700 text-sm">${(template?.company_gross_commission || 0).toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {group.entries.length} total · {upcoming.length} upcoming
                        {group.frequency && <span className="ml-1">· {group.frequency.label}</span>}
                        {nextEntry && <span className="ml-2 text-blue-500 font-medium">· Next: {safeDate(nextEntry.closing_date)}</span>}
                        {template?.agent_name && <span className="ml-2 text-gray-500">· {template.agent_name}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-3" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={e => startEdit(group, e)}>
                        <Pencil className="w-3 h-3" /> Edit Series
                      </Button>
                      {upcoming.length > 0 && (
                        <Button
                          size="sm" variant="outline"
                          className="text-red-600 border-red-300 hover:bg-red-50 gap-1.5"
                          onClick={() => { setConfirmDelete(group); setEditing(null); }}
                        >
                          <Trash2 className="w-3 h-3" /> Delete Future
                        </Button>
                      )}
                      {upcoming.length === 0 && <Badge className="bg-gray-100 text-gray-500 text-xs">Completed</Badge>}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t bg-gray-50 divide-y" onClick={ev => ev.stopPropagation()}>
                      {isEditing && (
                        <div className="px-4 py-4 bg-blue-50 border-b space-y-3" onClick={e => e.stopPropagation()}>
                          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Edit All Future Entries</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2">
                              <Label className="text-xs">Description / Label</Label>
                              <Input className="mt-1 h-8 text-sm" value={editForm.label} onChange={e => setEditForm(f => ({ ...f, label: e.target.value }))} />
                            </div>
                            <div>
                              <Label className="text-xs">Amount $</Label>
                              <Input type="number" className="mt-1 h-8 text-sm" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />
                            </div>
                          </div>
                          <ApplyEntryTo
                            agents={agents}
                            agentScope={editAgentScope}
                            setAgentScope={setEditAgentScope}
                            selectedAgents={editSelectedAgents}
                            toggleAgent={email => setEditSelectedAgents(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email])}
                          />
                          <p className="text-xs text-gray-500">Changes apply to all {upcoming.length} upcoming unpaid entries.</p>
                          <div className="flex gap-2">
                            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" disabled={saving === group.id} onClick={e => handleSaveEdit(group, e)}>
                              {saving === group.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save Changes
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1.5" onClick={e => { e.stopPropagation(); setEditing(null); }}>
                              <X className="w-3 h-3" /> Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                      {group.entries.filter(e => !isEditing || (e.closing_date >= today && e.status !== "paid")).map(e => {
                        const isPast = e.closing_date < today;
                        const isPaid = e.status === "paid";
                        return (
                          <div key={e.id} className={`flex items-center justify-between px-4 py-2.5 text-sm ${isPast || isPaid ? "opacity-50" : ""}`}>
                            <div>
                              <span className="font-medium text-gray-700">{safeDate(e.closing_date)}</span>
                              {e.agent_name && <span className="text-gray-400 ml-2">· {e.agent_name}</span>}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-green-700">${(e.company_gross_commission || 0).toLocaleString()}</span>
                              <Badge className={`text-xs ${isPaid ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                                {e.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}


                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}