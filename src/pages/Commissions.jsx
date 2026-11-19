import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, CheckCircle, XCircle, FileText, Loader2, Upload, Trash2, ChevronDown, ChevronUp, ArrowUpDown, CheckCircle2 } from "lucide-react";
import UploadCDAExcelDialog from "@/components/transactions/UploadCDAExcelDialog";
import DownloadCDAButton from "@/components/transactions/DownloadCDAButton";
import AddressInput from "@/components/shared/AddressInput";
import CategorySelect from "@/components/shared/CategorySelect";
import { format, parseISO, startOfYear, subMonths, isWithinInterval } from "date-fns";

function getDateRange(period, customStart, customEnd) {
  const now = new Date();
  const year = now.getFullYear();
  if (period === "ytd") return { start: startOfYear(now), end: now };
  if (period === "current_year") return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59) };
  if (period === "prior_year") return { start: new Date(year - 1, 0, 1), end: new Date(year - 1, 11, 31, 23, 59, 59) };
  if (period === "12months") return { start: subMonths(now, 12), end: now };
  if (period === "30days") return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now };
  if (period === "7days") return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
  if (period === "custom" && customStart && customEnd) {
    const [sy, sm, sd] = customStart.split("-").map(Number);
    const [ey, em, ed] = customEnd.split("-").map(Number);
    return { start: new Date(sy, sm - 1, sd), end: new Date(ey, em - 1, ed, 23, 59, 59) };
  }
  return null; // "all"
}

const statusColors = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  correction_needed: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  paid: "bg-emerald-100 text-emerald-700",
};

const STATUS_ORDER = { submitted: 0, correction_needed: 1, approved: 2, draft: 3, paid: 4 };

function safeDate(str) {
  if (!str) return "—";
  try {
    const d = str.includes("T") ? parseISO(str) : parseISO(str + "T00:00:00");
    return format(d, "MM/dd/yyyy");
  } catch { return str; }
}

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

function Money({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800">${(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
    </div>
  );
}

function SortHeader({ label, field, sort, onSort, className = "" }) {
  const active = sort.field === field;
  return (
    <button
      className={`flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-800 transition-colors ${className}`}
      onClick={() => onSort(field)}
    >
      {label}
      {active
        ? sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        : <ArrowUpDown className="w-3 h-3 opacity-30" />}
    </button>
  );
}

export default function Commissions() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const s = urlParams.get('status');
    return s ? new Set([s]) : new Set(["submitted", "correction_needed", "approved"]);
  });
  const [sort, setSort] = useState({ field: "closing_date", dir: "desc" });
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [correctionNotes, setCorrectionNotes] = useState("");
  const [actionDialog, setActionDialog] = useState(null);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  const [agents, setAgents] = useState([]);
  const [showUploadExcel, setShowUploadExcel] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [deleteOptions, setDeleteOptions] = useState({ accounting: false, documents: false });
  const [period, setPeriod] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [page, setPage] = useState(1);
  const [statusOpen, setStatusOpen] = useState(false);
  const pageSize = 25;

  const load = async () => {
    const [txns, settingsList] = await Promise.all([
      base44.entities.Transaction.list("-created_date", 100),
      base44.entities.BrokerageSettings.list(),
    ]);
    setTransactions(txns || []);
    if (settingsList?.length > 0) setSettings(settingsList[0]);
    setLoading(false);
  };

  // Lazy-load agents only when a row is first expanded
  const ensureAgentsLoaded = async () => {
    if (agents.length > 0) return;
    const agentList = await base44.entities.Agent.list("-created_date", 200);
    setAgents(agentList || []);
  };

  useEffect(() => { load(); }, []);

  const handleSort = (field) => {
    setSort(prev => prev.field === field
      ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { field, dir: "asc" }
    );
  };

  const toggleStatus = (status) => {
    setStatusFilter(prev => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      return next;
    });
  };

  const filtered = useMemo(() => {
    const dateRange = getDateRange(period, customStart, customEnd);
    let data = transactions.filter(t => {
      const matchSearch = !search ||
        t.property_address?.toLowerCase().includes(search.toLowerCase()) ||
        t.agent_name?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter.size === 0 || statusFilter.has(t.status);
      let matchDate = true;
      if (dateRange && t.closing_date) {
        try {
          const [y, m, d] = t.closing_date.substring(0, 10).split("-").map(Number);
          matchDate = isWithinInterval(new Date(y, m - 1, d), dateRange);
        } catch { matchDate = true; }
      }
      return matchSearch && matchStatus && matchDate;
    });

    data = [...data].sort((a, b) => {
      let av, bv;
      if (sort.field === "closing_date") {
        av = a.closing_date || "";
        bv = b.closing_date || "";
      } else if (sort.field === "status") {
        av = STATUS_ORDER[a.status] ?? 99;
        bv = STATUS_ORDER[b.status] ?? 99;
      } else if (sort.field === "sale_price") {
        av = a.sale_price || 0;
        bv = b.sale_price || 0;
      } else if (sort.field === "company_gross_commission") {
        av = a.company_gross_commission || 0;
        bv = b.company_gross_commission || 0;
      } else if (sort.field === "agent_net_commission") {
        av = a.agent_net_commission || 0;
        bv = b.agent_net_commission || 0;
      } else if (sort.field === "agent_name") {
        av = a.agent_name || "";
        bv = b.agent_name || "";
      } else if (sort.field === "office_payment_received") {
        av = a.office_payment_received ? 1 : 0;
        bv = b.office_payment_received ? 1 : 0;
      } else {
        av = a[sort.field] || "";
        bv = b[sort.field] || "";
      }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });

    return data;
  }, [transactions, search, statusFilter, sort, period, customStart, customEnd]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page, pageSize]);
  
  const totalPages = Math.ceil(filtered.length / pageSize);

  useEffect(() => setPage(1), [filtered.length]);

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleAll = () => setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(t => t.id)));

  const deleteTransaction = async (txnId, opts) => {
    await base44.entities.Transaction.delete(txnId);
    const fetches = [];
    if (opts.accounting) fetches.push(base44.entities.AccountingEntry.filter({ transaction_id: txnId }));
    if (opts.documents) fetches.push(base44.entities.Document.filter({ transaction_id: txnId }));
    if (!fetches.length) return;
    const results = await Promise.all(fetches);
    const deletes = [];
    let idx = 0;
    if (opts.accounting) { results[idx].forEach(e => deletes.push(base44.entities.AccountingEntry.delete(e.id))); idx++; }
    if (opts.documents) { results[idx].forEach(d => deletes.push(base44.entities.Document.delete(d.id))); }
    await Promise.all(deletes);
  };

  const handleAction = async () => {
    const { type, transaction, bulkIds } = actionDialog;
    setSaving(true);
    const me = await base44.auth.me();

    if (type === "bulkDelete") {
      for (const id of bulkIds) await deleteTransaction(id, deleteOptions);
      setSelected(new Set());
    } else if (type === "bulkApprove") {
      const today = new Date().toISOString().split("T")[0];
      for (const id of bulkIds) {
        const t = transactions.find(x => x.id === id);
        if (!t) continue;
        const updates = { status: "approved", approved_by: me.email, approved_date: today };
        await base44.entities.Transaction.update(id, updates);
        base44.functions.invoke('sendApprovalEmail', { transaction: { ...t, ...updates }, settings }).catch(() => {});
        await new Promise(r => setTimeout(r, 200)); // small delay to avoid rate limiting
      }
      setSelected(new Set());
    } else if (type === "approve") {
      const updates = { status: "approved", approved_by: me.email, approved_date: new Date().toISOString().split("T")[0] };
      await base44.entities.Transaction.update(transaction.id, updates);
      await base44.functions.invoke('sendApprovalEmail', { transaction: { ...transaction, ...updates }, settings }).catch(() => {});
    } else if (type === "correct") {
      await base44.entities.Transaction.update(transaction.id, { status: "correction_needed", correction_notes: correctionNotes });
    } else if (type === "paid") {
      await base44.entities.Transaction.update(transaction.id, { status: "paid", paid_date: new Date().toISOString().split("T")[0] });
    } else if (type === "edit") {
      if ((editForm.status === "approved" || editForm.status === "paid") && !editForm.file_type_name) {
        setSaving(false);
        return;
      }
      await base44.entities.Transaction.update(transaction.id, editForm);
    } else if (type === "delete") {
      await deleteTransaction(transaction.id, deleteOptions);
      setExpanded(null);
    }

    await load();
    setActionDialog(null);
    setExpanded(null);
    setCorrectionNotes("");
    setDeleteOptions({ accounting: false, documents: false });
    setSaving(false);
  };

  const allChecked = filtered.length > 0 && selected.size === filtered.length;
  const { widths, gridTemplateColumns, onMouseDown } = useResizableColumns([40, 280, 120, 110, 120, 120, 110, 100, 60]);

  if (loading) return <div className="flex items-center justify-center h-full p-12"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Commissions</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { /* manual entry: navigate to SubmitCDA */ window.location.href = "/SubmitCDA"; }} className="gap-2"><FileText className="w-4 h-4" />Manual Entry</Button>
          <Button onClick={() => setShowUploadExcel(true)} className="gap-2"><Upload className="w-4 h-4" />Import CDA</Button>
        </div>
      </div>



      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search address or agent..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="relative">
          <button
            className="px-3 py-2 border rounded-lg text-sm bg-white hover:bg-gray-50 flex items-center gap-2 min-w-48"
            onClick={() => setStatusOpen(o => !o)}
          >
            Status {statusFilter.size > 0 && <span className="text-xs bg-blue-500 text-white px-1.5 rounded-full font-medium">{statusFilter.size}</span>}
            <ChevronDown className="w-3.5 h-3.5 ml-auto text-gray-400" />
          </button>
          {statusOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setStatusOpen(false)} />
              <div className="absolute z-50 top-full mt-1 left-0 bg-white border rounded-lg shadow-lg p-3 space-y-2 min-w-60">
                {["submitted", "correction_needed", "approved", "paid", "draft"].map(status => (
                  <div key={status} className="flex items-center gap-2">
                    <Checkbox
                      id={`status-${status}`}
                      checked={statusFilter.has(status)}
                      onCheckedChange={() => toggleStatus(status)}
                    />
                    <label htmlFor={`status-${status}`} className="text-sm text-gray-700 cursor-pointer flex-1">
                      {status.replace(/_/g, " ").charAt(0).toUpperCase() + status.replace(/_/g, " ").slice(1)}
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Date Range" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Time</SelectItem>
            <SelectItem value="current_year">Current Year ({new Date().getFullYear()})</SelectItem>
            <SelectItem value="prior_year">Prior Year ({new Date().getFullYear() - 1})</SelectItem>
            <SelectItem value="ytd">Year to Date</SelectItem>
            <SelectItem value="12months">Last 12 Months</SelectItem>
            <SelectItem value="30days">Last 30 Days</SelectItem>
            <SelectItem value="7days">Last 7 Days</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
        {period === "custom" && (
          <>
            <Input type="date" className="w-36 h-9 text-sm" value={customStart} onChange={e => setCustomStart(e.target.value)} />
            <Input type="date" className="w-36 h-9 text-sm" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
          </>
        )}
      </div>

      {/* Bulk Actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-sm font-medium text-blue-800">{selected.size} selected</span>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 gap-1.5"
            onClick={() => setActionDialog({ type: "bulkApprove", bulkIds: [...selected] })}>
            <CheckCircle className="w-4 h-4" /> Approve Selected
          </Button>
          <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 gap-1.5"
            onClick={() => { setDeleteOptions({ accounting: false, documents: false }); setActionDialog({ type: "bulkDelete", bulkIds: [...selected] }); }}>
            <Trash2 className="w-4 h-4" /> Delete Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No commissions found</p>
        </div>
      ) : (
        <div className="space-y-3">
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-white border rounded-lg">
            <p className="text-sm text-gray-600">{filtered.length} total · Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
        <div className="rounded-xl border bg-white overflow-hidden">
          {/* Sortable Table Header */}
          <div className="grid px-4 py-3 bg-gray-50 border-b" style={{ gridTemplateColumns }}>
            <div className="flex items-center"><Checkbox checked={allChecked} onCheckedChange={toggleAll} /></div>
            {["Address / Agent", "Closing Date", "Sale Price", "Office Comm.", "Agent Net", "Status", "Category"].map((label, i) => {
              const fields = ["agent_name", "closing_date", "sale_price", "company_gross_commission", "agent_net_commission", "status", "category"];
              return (
                <div key={label} className="relative flex items-center pr-3">
                  <SortHeader label={label} field={fields[i]} sort={sort} onSort={handleSort} />
                  <div
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center group"
                    onMouseDown={e => onMouseDown(e, i + 1)}
                  >
                    <div className="w-px h-4 bg-gray-300 group-hover:bg-blue-400 group-hover:w-0.5 transition-all" />
                  </div>
                </div>
              );
            })}
            <div></div>
          </div>

          {paginated.map(t => (
            <div key={t.id}>
              <div
                className={`grid px-4 py-3 items-center border-b last:border-0 hover:bg-gray-50 cursor-pointer transition-colors ${expanded === t.id ? "bg-blue-50/40" : ""}`}
                style={{ gridTemplateColumns }}
                onClick={() => { setExpanded(expanded === t.id ? null : t.id); if (expanded !== t.id) ensureAgentsLoaded(); }}
              >
                <div onClick={e => e.stopPropagation()}>
                  <Checkbox checked={selected.has(t.id)} onCheckedChange={() => {}} onClick={e => toggleSelect(t.id, e)} />
                </div>
                <div className="min-w-0">
                <p className="font-medium text-gray-900 truncate text-sm">{t.property_address}</p>
                <p className="text-xs text-gray-400">{t.agent_name} {t.working_with ? `· ${t.working_with}` : ""}{t.category && <span className="ml-1.5 px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{t.category}</span>}</p>
                </div>
                <div className="text-sm text-gray-700">{safeDate(t.closing_date)}</div>
                <div className="text-sm font-medium">${(t.sale_price || 0).toLocaleString()}</div>
                <div className="text-sm font-semibold text-green-700">${(t.company_gross_commission || 0).toLocaleString()}</div>
                <div className="text-sm font-semibold text-gray-800">${(t.agent_net_commission || 0).toLocaleString()}</div>
                <div><Badge className={`text-xs ${statusColors[t.status]}`}>{t.status?.replace(/_/g, " ")}</Badge></div>
                <div className="text-xs">
                  <CategorySelect
                    className="h-8"
                    type="income"
                    value={t.category || ""}
                    onChange={async (v) => {
                      // Optimistic local update — no full reload needed
                      setTransactions(prev => prev.map(x => x.id === t.id ? { ...x, category: v } : x));
                      await base44.entities.Transaction.update(t.id, { category: v });
                      base44.entities.AccountingEntry.filter({ transaction_id: t.id }).then(entries => {
                        if (entries?.length > 0) {
                          Promise.all(entries.map(e => base44.entities.AccountingEntry.update(e.id, { category: v })));
                        }
                      });
                    }}
                    placeholder="Select category"
                  />
                </div>
                <div className="flex justify-end">
                  {expanded === t.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </div>
              </div>

              {/* Expanded Detail */}
              {expanded === t.id && (
                <div className="px-6 py-5 bg-gray-50 border-b space-y-5">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Agent & Property</p>
                    {(() => {
                      const agentProfile = agents.find(a => 
                        (a.user_email?.toLowerCase() === t.agent_email?.toLowerCase()) ||
                        (a.full_name?.toLowerCase() === t.agent_name?.toLowerCase()) ||
                        (a.company?.toLowerCase() === t.agent_name?.toLowerCase()) ||
                        (a.companies || []).some(c => c?.toLowerCase() === t.agent_name?.toLowerCase())
                      );
                      return agentProfile?.commission_plan && agentProfile.commission_plan !== "None Set" ? (
                        <div className="mb-4 p-3 bg-red-50 border-2 border-red-300 rounded-lg">
                          <p className="text-xs text-red-600 font-semibold uppercase tracking-wide mb-1">Agent Commission Plan</p>
                          <p className="text-sm font-bold text-red-700">{agentProfile.commission_plan}</p>
                        </div>
                      ) : null;
                    })()}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                      <Field label="Agent Name" value={t.agent_name} />
                      <Field label="Working With" value={t.working_with} />
                      <Field label="Check Payable To" value={t.commission_check_payable_to} />
                      <Field label="Property Address" value={t.property_address} />
                      <Field label="Buyer(s)" value={t.buyer_name} />
                      <Field label="Seller(s)" value={t.seller_name} />
                      <Field label="Co-Op Agent" value={t.coop_agent} />
                      <Field label="Closing Date" value={safeDate(t.closing_date)} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Title / Closer</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <Field label="Closer's Name" value={t.title_company_name} />
                      <Field label="Phone" value={t.title_company_phone} />
                      <Field label="Email" value={t.title_company_email} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Commission Breakdown</p>
                    {(() => {
                      const total = t.total_commission_amount || 0;
                      const sumPayments = (t.company_gross_commission || 0) + (t.agent_gross_commission || 0);
                      const mismatch = total > 0 && Math.abs(total - sumPayments) > 0.5;
                      return (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                          <Money label="Purchase Price" value={t.sale_price} />
                          <Field label="Commission %" value={t.commission_percentage ? `${t.commission_percentage}%` : null} />
                          <Money label="Commission Flat Fee" value={t.commission_flat_fee} />
                          <div>
                            <p className="text-xs text-gray-400">Total Commission</p>
                            <p className={`text-sm font-medium flex items-center gap-1 ${mismatch ? "text-orange-500" : "text-gray-800"}`}>
                              ${(total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              {mismatch && (
                                <span title={`Payments sum to $${sumPayments.toLocaleString("en-US", { minimumFractionDigits: 2 })} — does not equal total commission`}
                                  className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500 text-white text-xs font-bold leading-none">!</span>
                              )}
                            </p>
                          </div>
                          <Field label="Office Split %" value={t.office_split_percentage ? `${t.office_split_percentage}%` : null} />
                          <Money label="Office Split $" value={t.office_split_flat} />
                          <Money label="Office Gross Comm." value={t.company_gross_commission} />
                          <Money label="Agent Gross Comm." value={t.agent_gross_commission} />
                        </div>
                      );
                    })()}
                  </div>
                  {/* Mail To Section */}
                  {(() => {
                    const agentProfile = agents.find(a =>
                      (a.user_email?.toLowerCase() === t.agent_email?.toLowerCase()) ||
                      (a.full_name?.toLowerCase() === t.agent_name?.toLowerCase()) ||
                      (a.company?.toLowerCase() === t.commission_check_payable_to?.toLowerCase()) ||
                      (a.companies || []).some(c => c?.toLowerCase() === t.commission_check_payable_to?.toLowerCase())
                    );
                    const agentMailingAddress = t.agent_mailing_address || agentProfile?.mailing_address;
                    const hasReferrals = t.referral_1_name || t.referral_2_name || t.referral_3_name || t.referral_4_name;
                    return (
                      <div className="space-y-3">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Check Disbursement — Mail To</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Agent check */}
                          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs font-semibold text-blue-700 mb-1">Agent Commission Check</p>
                            <p className="text-sm font-medium text-gray-900">{t.commission_check_payable_to || t.agent_name || '—'}</p>
                            <p className="text-lg font-bold text-blue-800">${(t.agent_net_commission || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            <p className="text-xs text-gray-500 mt-1">Mail to: <span className="text-gray-800">{agentMailingAddress || '(No address on file)'}</span></p>
                          </div>
                          {/* Office check */}
                          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                            <p className="text-xs font-semibold text-green-700 mb-1">Office / Brokerage Check</p>
                            <p className="text-sm font-medium text-gray-900">{settings?.brokerage_name || 'Brokerage'}</p>
                            <p className="text-lg font-bold text-green-800">${(t.company_gross_commission || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                            <p className="text-xs text-gray-500 mt-1">Mail to: <span className="text-gray-800">{settings?.address || '(See brokerage settings)'}</span></p>
                          </div>
                          {/* Referral checks */}
                          {hasReferrals && [
                            { name: t.referral_1_name, amount: t.referral_1_amount, address: t.referral_1_mailing_address },
                            { name: t.referral_2_name, amount: t.referral_2_amount, address: t.referral_2_mailing_address },
                            { name: t.referral_3_name, amount: t.referral_3_amount, address: t.referral_3_mailing_address },
                            { name: t.referral_4_name, amount: t.referral_4_amount, address: t.referral_4_mailing_address },
                          ].filter(r => r.name).map((r, i) => (
                            <div key={i} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                              <p className="text-xs font-semibold text-amber-700 mb-1">Referral Check {i + 1}</p>
                              <p className="text-sm font-medium text-gray-900">{r.name}</p>
                              <p className="text-lg font-bold text-amber-800">${(r.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                              <p className="text-xs text-gray-500 mt-1">Mail to: <span className="text-gray-800">{r.address || '(No address on file)'}</span></p>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {(t.referral_1_name || t.referral_2_name || t.referral_3_name || t.referral_4_name) && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Referrals / Team Splits</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {t.referral_1_name && <><Field label="Referral 1" value={t.referral_1_name} /><Money label="Amount" value={t.referral_1_amount} /></>}
                        {t.referral_2_name && <><Field label="Referral 2" value={t.referral_2_name} /><Money label="Amount" value={t.referral_2_amount} /></>}
                        {t.referral_3_name && <><Field label="Referral 3" value={t.referral_3_name} /><Money label="Amount" value={t.referral_3_amount} /></>}
                        {t.referral_4_name && <><Field label="Referral 4" value={t.referral_4_name} /><Money label="Amount" value={t.referral_4_amount} /></>}
                        <Money label="Total Referral Fees" value={t.total_referral_amount} />
                      </div>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Other Fees & Net</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="col-span-2 sm:col-span-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                        ⚠️ Admin Fee is charged directly to buyer/seller and does <strong>not</strong> reduce agent net. Client Concession <strong>is</strong> deducted from agent net commission.
                      </div>
                      {t.admin_fee_payable_to && <Field label="Admin Fee Payable To" value={t.admin_fee_payable_to} />}
                      <div>
                        <p className="text-xs text-gray-400">Admin Fee $ (charged to client)</p>
                        <p className="text-sm font-medium text-gray-800">${(t.admin_fee_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Client Concession $ (charged to client)</p>
                        <p className="text-sm font-medium text-gray-800">${(t.client_concession || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div className="bg-white border rounded-lg p-3">
                        <p className="text-xs text-gray-400">Agent Net Commission</p>
                        <p className="text-lg font-bold text-gray-900">${(t.agent_net_commission || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  </div>
                  {t.notes && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                      <p className="text-sm text-gray-700 bg-white border rounded-lg p-3">{t.notes}</p>
                    </div>
                  )}
                  {t.correction_notes && (
                    <div>
                      <p className="text-xs font-semibold text-orange-500 uppercase tracking-wide mb-1">Correction Notes</p>
                      <p className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg p-3">{t.correction_notes}</p>
                    </div>
                  )}
                  {(t.purchase_agreement_url || t.additional_docs?.length > 0) && (
                    <div className="flex gap-2 flex-wrap">
                      {t.purchase_agreement_url && (
                        <a href={t.purchase_agreement_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-lg text-xs hover:bg-gray-100">Purchase Agreement</a>
                      )}
                      {t.additional_docs?.map((doc, idx) => (
                        <a key={idx} href={doc.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border rounded-lg text-xs hover:bg-gray-100">{doc.name}</a>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap items-center pt-2 border-t">
                    <DownloadCDAButton transaction={t} settings={settings} />
                    <Button size="sm" variant="outline" onClick={() => { setEditForm({ ...t }); setActionDialog({ type: "edit", transaction: t }); ensureAgentsLoaded(); }}>Edit</Button>
                    {(t.status === "submitted" || t.status === "correction_needed") && (
                      <>
                        <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700"
                          disabled={!t.file_type_name}
                          title={!t.file_type_name ? "File Type is required before approving" : ""}
                          onClick={() => setActionDialog({ type: "approve", transaction: t })}>
                          <CheckCircle className="w-4 h-4" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-orange-600 border-orange-300"
                          onClick={() => setActionDialog({ type: "correct", transaction: t })}>
                          <XCircle className="w-4 h-4" /> Request Correction
                        </Button>
                      </>
                    )}

                    {/* File Type dropdown — required for approval */}
                    <div className="flex items-center gap-2 ml-2" onClick={e => e.stopPropagation()}>
                      <Select
                        value={t.file_type_name || ""}
                        onValueChange={async (val) => {
                          setTransactions(prev => prev.map(x => x.id === t.id ? { ...x, file_type_name: val } : x));
                          await base44.entities.Transaction.update(t.id, { file_type_name: val });
                        }}
                      >
                        <SelectTrigger className={`h-8 w-52 text-xs ${!t.file_type_name ? "border-orange-400 text-orange-600" : ""}`}>
                          <SelectValue placeholder="⚠ File Type (required)" />
                        </SelectTrigger>
                        <SelectContent>
                          {(settings?.document_file_types?.length > 0
                            ? settings.document_file_types
                            : [
                                { name: "Listing Closing Checklist" },
                                { name: "Buyers Closing Checklist" },
                                { name: "Terminated Listing Check List" },
                                { name: "Terminated Buyer Checklist" },
                              ]
                          ).map(ft => (
                            <SelectItem key={ft.name} value={ft.name}>{ft.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!t.file_type_name && <span className="text-xs text-orange-500 font-medium">Required to approve</span>}
                    </div>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 ml-auto gap-1.5"
                      onClick={() => { setDeleteOptions({ accounting: false, documents: false }); setActionDialog({ type: "delete", transaction: t }); }}>
                      <Trash2 className="w-4 h-4" /> Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-white border rounded-lg">
            <p className="text-sm text-gray-600">{filtered.length} total · Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
        </div>
      )}

      <UploadCDAExcelDialog open={showUploadExcel} onClose={() => setShowUploadExcel(false)} onImported={load} />

      {/* Action Dialog */}
      <Dialog open={!!actionDialog} onOpenChange={() => { setActionDialog(null); setDeleteOptions({ accounting: false, documents: false }); }}>
        <DialogContent className={actionDialog?.type === "edit" ? "max-w-2xl max-h-[90vh] overflow-y-auto" : ""}>
          <DialogHeader>
            <DialogTitle>
              {actionDialog?.type === "approve" || actionDialog?.type === "bulkApprove" ? "Approve CDA" :
               actionDialog?.type === "paid" ? "Mark as Paid" :
               actionDialog?.type === "delete" || actionDialog?.type === "bulkDelete" ? "Delete Transaction" :
               actionDialog?.type === "edit" ? "Edit Transaction" : "Request Correction"}
            </DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            {actionDialog?.type === "correct" && (
              <div>
                <Label>Correction Notes for Agent</Label>
                <Textarea className="mt-2" rows={4} placeholder="Describe what needs to be corrected..."
                  value={correctionNotes} onChange={e => setCorrectionNotes(e.target.value)} />
              </div>
            )}
            {actionDialog?.type === "approve" && <p className="text-sm text-gray-600">Approve CDA for <strong>{actionDialog.transaction?.property_address}</strong>? An approval email will be sent.</p>}
            {actionDialog?.type === "bulkApprove" && <p className="text-sm text-gray-600">Approve <strong>{actionDialog.bulkIds?.length}</strong> selected CDAs?</p>}
            {actionDialog?.type === "paid" && <p className="text-sm text-gray-600">Mark commission as paid for <strong>{actionDialog.transaction?.property_address}</strong>?</p>}
            {(actionDialog?.type === "delete" || actionDialog?.type === "bulkDelete") && (
              <div className="space-y-3">
                <p className="text-sm text-red-600">
                  {actionDialog.type === "bulkDelete"
                    ? `Permanently delete ${actionDialog.bulkIds?.length} selected commission records? This cannot be undone.`
                    : `Permanently delete the commission record for ${actionDialog.transaction?.property_address}? This cannot be undone.`}
                </p>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Also delete associated records:</p>
                <div className="space-y-2 p-3 bg-gray-50 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox id="delAccounting" checked={deleteOptions.accounting} onCheckedChange={v => setDeleteOptions(o => ({ ...o, accounting: !!v }))} />
                    <label htmlFor="delAccounting" className="text-sm text-gray-700 cursor-pointer">Accounting entries linked to this transaction</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="delDocuments" checked={deleteOptions.documents} onCheckedChange={v => setDeleteOptions(o => ({ ...o, documents: !!v }))} />
                    <label htmlFor="delDocuments" className="text-sm text-gray-700 cursor-pointer">Documents in Document Vault linked to this transaction</label>
                  </div>
                </div>
              </div>
            )}
            {actionDialog?.type === "edit" && (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent & Property</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Agent Name</Label><Input className="mt-1" value={editForm.agent_name || ""} onChange={e => setEditForm({ ...editForm, agent_name: e.target.value })} /></div>
                  <div>
                    <Label>Working With</Label>
                    <Select value={editForm.working_with || "Buyer"} onValueChange={v => setEditForm({ ...editForm, working_with: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Buyer">Buyer</SelectItem>
                        <SelectItem value="Seller">Seller</SelectItem>
                        <SelectItem value="Both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2"><Label>Property Address</Label><Input className="mt-1" value={editForm.property_address || ""} onChange={e => setEditForm({ ...editForm, property_address: e.target.value })} /></div>
                  <div><Label>Buyer(s)</Label><Input className="mt-1" value={editForm.buyer_name || ""} onChange={e => setEditForm({ ...editForm, buyer_name: e.target.value })} /></div>
                  <div><Label>Seller(s)</Label><Input className="mt-1" value={editForm.seller_name || ""} onChange={e => setEditForm({ ...editForm, seller_name: e.target.value })} /></div>
                  <div><Label>Co-Op Agent</Label><Input className="mt-1" value={editForm.coop_agent || ""} onChange={e => setEditForm({ ...editForm, coop_agent: e.target.value })} /></div>
                  <div><Label>Closing Date</Label><Input type="date" className="mt-1" value={editForm.closing_date || ""} onChange={e => setEditForm({ ...editForm, closing_date: e.target.value })} /></div>
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Title / Closer</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Closer's Name</Label><Input className="mt-1" value={editForm.title_company_name || ""} onChange={e => setEditForm({ ...editForm, title_company_name: e.target.value })} /></div>
                  <div><Label>Phone</Label><Input className="mt-1" value={editForm.title_company_phone || ""} onChange={e => setEditForm({ ...editForm, title_company_phone: e.target.value })} /></div>
                  <div className="col-span-2"><Label>Email</Label><Input className="mt-1" value={editForm.title_company_email || ""} onChange={e => setEditForm({ ...editForm, title_company_email: e.target.value })} /></div>
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Commission</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Purchase Price</Label><Input type="number" className="mt-1" value={editForm.sale_price || ""} onChange={e => setEditForm({ ...editForm, sale_price: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Commission %</Label><Input type="number" className="mt-1" value={editForm.commission_percentage || ""} onChange={e => setEditForm({ ...editForm, commission_percentage: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Commission Flat Fee $</Label><Input type="number" className="mt-1" value={editForm.commission_flat_fee || ""} onChange={e => setEditForm({ ...editForm, commission_flat_fee: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Total Commission $</Label><Input type="number" className="mt-1" value={editForm.total_commission_amount || ""} onChange={e => setEditForm({ ...editForm, total_commission_amount: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Office Split %</Label><Input type="number" className="mt-1" value={editForm.office_split_percentage || ""} onChange={e => setEditForm({ ...editForm, office_split_percentage: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Office Split $ (Flat)</Label><Input type="number" className="mt-1" value={editForm.office_split_flat || ""} onChange={e => setEditForm({ ...editForm, office_split_flat: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Office Gross Comm. $</Label><Input type="number" className="mt-1" value={editForm.company_gross_commission || ""} onChange={e => setEditForm({ ...editForm, company_gross_commission: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Agent Gross Comm. $</Label><Input type="number" className="mt-1" value={editForm.agent_gross_commission || ""} onChange={e => setEditForm({ ...editForm, agent_gross_commission: parseFloat(e.target.value) || 0 })} /></div>
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Mailing Addresses (for Checks)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Label>Agent Check Payable To</Label><Input className="mt-1" value={editForm.commission_check_payable_to || ""} onChange={e => setEditForm({ ...editForm, commission_check_payable_to: e.target.value })} /></div>
                  <div className="col-span-2">
                    {/* Agent mailing address with profile lookup */}
                    {(() => {
                      const payableTo = editForm.commission_check_payable_to?.toLowerCase();
                      const nameLower = editForm.agent_name?.toLowerCase();
                      const emailLower = editForm.agent_email?.toLowerCase();
                      const agentProf =
                        agents.find(a => a.full_name?.toLowerCase() === nameLower && a.mailing_address) ||
                        agents.find(a => a.user_email?.toLowerCase() === emailLower && a.mailing_address) ||
                        (payableTo ? agents.find(a => (a.company?.toLowerCase() === payableTo || (a.companies || []).some(c => c?.toLowerCase() === payableTo)) && a.mailing_address) : null) ||
                        agents.find(a => a.full_name?.toLowerCase() === nameLower) ||
                        agents.find(a => a.user_email?.toLowerCase() === emailLower) ||
                        (payableTo ? agents.find(a => a.company?.toLowerCase() === payableTo || (a.companies || []).some(c => c?.toLowerCase() === payableTo)) : null);
                      const profileAddr = agentProf?.mailing_address;
                      return (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label>Agent Mailing Address (for commission check)</Label>
                            {profileAddr && (
                              <Button size="sm" variant="outline" className="h-6 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                                onClick={() => setEditForm(f => ({ ...f, agent_mailing_address: profileAddr }))}>
                                Use Profile Address
                              </Button>
                            )}
                          </div>
                          <AddressInput
                            value={editForm.agent_mailing_address || ""}
                            onChange={v => setEditForm(f => ({ ...f, agent_mailing_address: v }))}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Referrals & Mailing Addresses</p>
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(n => {
                    const nameKey = `referral_${n}_name`;
                    const amtKey = `referral_${n}_amount`;
                    const addrKey = `referral_${n}_mailing_address`;
                    const refName = editForm[nameKey] || "";
                    const nameLower = refName.trim().toLowerCase();
                    const matchedAgent = nameLower ? agents.find(a =>
                      a.full_name?.toLowerCase() === nameLower ||
                      a.company?.toLowerCase() === nameLower ||
                      (a.companies || []).some(c => c?.toLowerCase() === nameLower)
                    ) : null;
                    const profileAddr = matchedAgent?.mailing_address;
                    return (
                      <div key={n} className="p-3 border rounded-lg bg-gray-50 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div><Label>Referral {n} Name</Label><Input className="mt-1" value={refName} onChange={e => setEditForm({ ...editForm, [nameKey]: e.target.value })} /></div>
                          <div><Label>Amount $</Label><Input type="number" className="mt-1" value={editForm[amtKey] || ""} onChange={e => setEditForm({ ...editForm, [amtKey]: parseFloat(e.target.value) || 0 })} /></div>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs">Mailing Address</Label>
                            {matchedAgent && profileAddr && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Internal agent</span>
                                <Button size="sm" variant="outline" className="h-6 text-xs border-green-400 text-green-700 hover:bg-green-50"
                                  onClick={() => setEditForm(f => ({ ...f, [addrKey]: profileAddr }))}>
                                  Use Profile Address
                                </Button>
                              </div>
                            )}
                            {matchedAgent && !profileAddr && (
                              <span className="text-xs text-amber-600">Internal agent — no address on profile</span>
                            )}
                          </div>
                          <AddressInput value={editForm[addrKey] || ""} onChange={v => setEditForm(f => ({ ...f, [addrKey]: v }))} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Other</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Admin Fee Payable To</Label><Input className="mt-1" value={editForm.admin_fee_payable_to || ""} onChange={e => setEditForm({ ...editForm, admin_fee_payable_to: e.target.value })} /></div>
                  <div><Label>Admin Fee $</Label><Input type="number" className="mt-1" value={editForm.admin_fee_amount || ""} onChange={e => setEditForm({ ...editForm, admin_fee_amount: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Client Concession $</Label><Input type="number" className="mt-1" value={editForm.client_concession || ""} onChange={e => setEditForm({ ...editForm, client_concession: parseFloat(e.target.value) || 0 })} /></div>
                  <div><Label>Agent Net Commission $</Label><Input type="number" className="mt-1" value={editForm.agent_net_commission || ""} onChange={e => setEditForm({ ...editForm, agent_net_commission: parseFloat(e.target.value) || 0 })} /></div>
                  <div>
                    <Label>Status</Label>
                    <Select value={editForm.status || "submitted"} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                      <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="correction_needed">Correction Needed</SelectItem>
                        <SelectItem value="approved" disabled={!editForm.file_type_name}>Approved{!editForm.file_type_name ? " (File Type required)" : ""}</SelectItem>
                        <SelectItem value="paid" disabled={!editForm.file_type_name}>Paid{!editForm.file_type_name ? " (File Type required)" : ""}</SelectItem>
                      </SelectContent>
                    </Select>
                    {(editForm.status === "approved" || editForm.status === "paid") && !editForm.file_type_name && (
                      <p className="text-xs text-red-500 mt-1">⚠ File Type is required before setting status to Approved or Paid.</p>
                    )}
                  </div>
                  <div><Label>Category</Label><CategorySelect className="mt-1" type="income" value={editForm.category || ""} onChange={v => setEditForm({ ...editForm, category: v })} placeholder="Select category (optional)" /></div>
                  <div className="col-span-2"><Label>Notes</Label><Textarea className="mt-1" rows={3} value={editForm.notes || ""} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} /></div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setDeleteOptions({ accounting: false, documents: false }); }}>Cancel</Button>
            <Button onClick={handleAction} disabled={
                saving ||
                (actionDialog?.type === "correct" && !correctionNotes) ||
                (actionDialog?.type === "edit" && (editForm.status === "approved" || editForm.status === "paid") && !editForm.file_type_name)
              }
              className={actionDialog?.type === "delete" || actionDialog?.type === "bulkDelete" ? "bg-red-600 hover:bg-red-700" : ""}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}