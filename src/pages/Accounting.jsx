import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, FileText, DollarSign, TrendingUp, Building2, Trash2, Loader2, ArrowUpDown, ChevronUp, ChevronDown, Plus, RefreshCw, AlertCircle, TrendingDown, Receipt, Upload, Download, CheckCircle2 } from "lucide-react";
import CategorySelect from "@/components/shared/CategorySelect";
import AddAccountingEntryDialog from "@/components/accounting/AddAccountingEntryDialog";
import RecurringPaymentsDialog from "@/components/accounting/RecurringPaymentsDialog.jsx";
import ExpensesTab from "@/components/accounting/ExpensesTab";
import FilterButton from "@/components/accounting/FilterButton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { format, parseISO } from "date-fns";

function safeDate(str) {
  if (!str) return "—";
  try {
    const d = str.includes("T") ? parseISO(str) : parseISO(str + "T00:00:00");
    return format(d, "MM/dd/yyyy");
  } catch { return str; }
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

export default function Accounting() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState(() => localStorage.getItem("accounting_dateRange") || "all");
  const [customStartDate, setCustomStartDate] = useState(() => localStorage.getItem("accounting_customStart") || "");
  const [customEndDate, setCustomEndDate] = useState(() => localStorage.getItem("accounting_customEnd") || "");
  const [sort, setSort] = useState(() => { try { return JSON.parse(localStorage.getItem("accounting_sort")) || { field: "closing_date", dir: "asc" }; } catch { return { field: "closing_date", dir: "asc" }; } });
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [deleteOptions, setDeleteOptions] = useState({ commission: false, documents: false });
  const [saving, setSaving] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showRecurring, setShowRecurring] = useState(false);
  const { gridTemplateColumns, onMouseDown } = useResizableColumns([32, 260, 120, 110, 130, 130, 80, 110, 100, 44]);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  const [uncheckDialog, setUncheckDialog] = useState(null);
  const [editingPaidDate, setEditingPaidDate] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem("accounting_activeTab") || "income");
  const [csvFile, setCsvFile] = useState(null);
  const [csvDragging, setCsvDragging] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const [csvError, setCsvError] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [incomeFilters, setIncomeFilters] = useState(() => { try { return JSON.parse(localStorage.getItem("accounting_incomeFilters")) || {}; } catch { return {}; } });
  const [expenseFilters, setExpenseFilters] = useState(() => { try { return JSON.parse(localStorage.getItem("accounting_expenseFilters")) || {}; } catch { return {}; } });
  const [expenses, setExpenses] = useState([]);
  const [transactions, setTransactions] = useState([]);

  const load = () =>
    Promise.all([
      base44.entities.AccountingEntry.list("-created_date", 500),
      base44.entities.Expense.list("-expense_date", 500),
      base44.entities.Transaction.list("-created_date", 500),
    ]).then(([data, expData, txnData]) => {
      setEntries(data || []);
      setExpenses(expData || []);
      setTransactions(txnData || []);
      setLoading(false);
    });

  useEffect(() => {
    load();
    const unsubEntries = base44.entities.AccountingEntry.subscribe(() => { load(); });
    const unsubExpenses = base44.entities.Expense.subscribe(() => { load(); });
    return () => { unsubEntries(); unsubExpenses(); };
  }, []);

  // Persist filter/sort preferences
  useEffect(() => { localStorage.setItem("accounting_dateRange", dateRange); }, [dateRange]);
  useEffect(() => { localStorage.setItem("accounting_customStart", customStartDate); }, [customStartDate]);
  useEffect(() => { localStorage.setItem("accounting_customEnd", customEndDate); }, [customEndDate]);
  useEffect(() => { localStorage.setItem("accounting_sort", JSON.stringify(sort)); }, [sort]);
  useEffect(() => { localStorage.setItem("accounting_activeTab", activeTab); }, [activeTab]);
  useEffect(() => { localStorage.setItem("accounting_incomeFilters", JSON.stringify(incomeFilters)); }, [incomeFilters]);
  useEffect(() => { localStorage.setItem("accounting_expenseFilters", JSON.stringify(expenseFilters)); }, [expenseFilters]);

  const getDateRange = () => {
    const today = new Date();
    const year = today.getFullYear();
    let start, end = new Date(today);
    if (dateRange === "all") { return { start: null, end: null }; }
    else if (dateRange === "current_year") { start = new Date(year, 0, 1); end = new Date(year, 11, 31, 23, 59, 59); }
    else if (dateRange === "prior_year") { start = new Date(year - 1, 0, 1); end = new Date(year - 1, 11, 31, 23, 59, 59); }
    else if (dateRange === "ytd") { start = new Date(year, 0, 1); }
    else if (dateRange === "12months") { start = new Date(today); start.setFullYear(start.getFullYear() - 1); }
    else if (dateRange === "30days") { start = new Date(today); start.setDate(start.getDate() - 30); }
    else if (dateRange === "7days") { start = new Date(today); start.setDate(start.getDate() - 7); }
    else if (dateRange === "custom") {
      start = customStartDate ? new Date(customStartDate) : new Date(0);
      end = customEndDate ? new Date(customEndDate) : today;
    }
    return { start, end };
  };

  const toggleOfficePayment = async (entry, force = false) => {
    if (entry.office_payment_received && !force) { setUncheckDialog(entry); return; }
    const newVal = !entry.office_payment_received;
    const today = new Date().toISOString().split("T")[0];
    const paidDate = newVal ? today : null;
    const newStatus = newVal ? "approved" : "pending";
    await base44.entities.AccountingEntry.update(entry.id, { office_payment_received: newVal, office_paid_date: paidDate, status: newStatus });
    if (entry.transaction_id) {
      await base44.entities.Transaction.update(entry.transaction_id, { office_payment_received: newVal }).catch(() => {});
    }
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, office_payment_received: newVal, office_paid_date: paidDate, status: newStatus } : e));
  };

  const updatePaidDate = async (entry, newDate) => {
    await base44.entities.AccountingEntry.update(entry.id, { office_paid_date: newDate });
    setEntries(prev => prev.map(e => e.id === entry.id ? { ...e, office_paid_date: newDate } : e));
    setEditingPaidDate(null);
  };

  const handleEditEntry = (entry) => { setEditForm({ ...entry }); setExpandedId(entry.id); };

  const handleSaveEdit = async () => {
    setSaving(true);
    await base44.entities.AccountingEntry.update(editForm.id, editForm);
    if (editForm.transaction_id) {
      await base44.entities.Transaction.update(editForm.transaction_id, editForm).catch(() => {});
    }
    setExpandedId(null);
    await load();
    setSaving(false);
  };

  const handleSort = (field) => {
    setSort(prev => prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" });
  };

  const handleDelete = async () => {
    setSaving(true);
    const entry = deleteDialog;
    await base44.entities.AccountingEntry.delete(entry.id);
    if (deleteOptions.commission && entry.transaction_id) {
      await base44.entities.Transaction.delete(entry.transaction_id).catch(() => {});
    }
    if (deleteOptions.documents && entry.transaction_id) {
      const docs = await base44.entities.Document.filter({ transaction_id: entry.transaction_id });
      await Promise.all(docs.map(d => base44.entities.Document.delete(d.id)));
    }
    setDeleteDialog(null);
    setDeleteOptions({ commission: false, documents: false });
    setSaving(false);
    load();
  };

  const handleBulkDelete = async () => {
    setSaving(true);
    await Promise.all([...selected].map(id => base44.entities.AccountingEntry.delete(id)));
    setSelected(new Set());
    setBulkDeleteDialog(false);
    setSaving(false);
    load();
  };

  const toggleSelect = (id) => {
    setSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) { setSelected(new Set()); }
    else { setSelected(new Set(filtered.map(e => e.id))); }
  };

  const filtered = useMemo(() => {
    const { start, end } = getDateRange();
    let data = entries.filter(e => {
      const matchSearch = !search ||
        e.property_address?.toLowerCase().includes(search.toLowerCase()) ||
        e.agent_name?.toLowerCase().includes(search.toLowerCase());
      const entryDate = e.closing_date ? new Date(e.closing_date) : null;
      const matchDate = !start || (entryDate && entryDate >= start && entryDate <= end);
      if (incomeFilters["Status"]?.length > 0 && !incomeFilters["Status"].includes(e.status)) return false;
      if (incomeFilters["Category"]?.length > 0 && !incomeFilters["Category"].includes(e.category)) return false;
      if (incomeFilters["Office Paid"]?.length > 0) {
        const isPaid = e.office_payment_received ? "Yes" : "No";
        if (!incomeFilters["Office Paid"].includes(isPaid)) return false;
      }
      return matchSearch && matchDate;
    });

    return [...data].sort((a, b) => {
      let av, bv;
      if (sort.field === "closing_date") { av = a.closing_date || ""; bv = b.closing_date || ""; }
      else if (sort.field === "sale_price") { av = a.sale_price || 0; bv = b.sale_price || 0; }
      else if (sort.field === "company_gross_commission") { av = a.company_gross_commission || 0; bv = b.company_gross_commission || 0; }
      else if (sort.field === "agent_gross_commission") { av = a.agent_gross_commission || 0; bv = b.agent_gross_commission || 0; }
      else if (sort.field === "office_payment_received") { av = a.office_payment_received ? 1 : 0; bv = b.office_payment_received ? 1 : 0; }
      else if (sort.field === "office_paid_date") { av = a.office_paid_date || ""; bv = b.office_paid_date || ""; }
      else { av = a[sort.field] || ""; bv = b[sort.field] || ""; }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [entries, search, dateRange, customStartDate, customEndDate, sort, incomeFilters]);

  const filteredExpenses = useMemo(() => {
    const { start, end } = getDateRange();
    return expenses.filter(e => {
      if (!start) return true;
      const d = e.expense_date ? new Date(e.expense_date) : null;
      return d && d >= start && d <= end;
    });
  }, [expenses, dateRange, customStartDate, customEndDate]);

  const totalOffice = filtered.reduce((s, e) => s + (e.company_gross_commission || 0), 0);
  const totalAgent = filtered.reduce((s, e) => s + (e.agent_gross_commission || 0), 0);
  const totalSales = filtered.reduce((s, e) => s + (e.sale_price || 0), 0);
  const officeFeesCollected = filtered.filter(e => e.office_payment_received).reduce((s, e) => s + (e.company_gross_commission || 0), 0);
  const deskFeesCollected = entries.filter(e => e.transaction_type === "desk_fee" && e.office_payment_received).reduce((s, e) => s + (e.company_gross_commission || 0), 0);
  const miscIncomeCollected = filtered.filter(e => !e.transaction_id && e.transaction_type !== "desk_fee" && e.transaction_type !== "office_income").reduce((s, e) => s + (e.company_gross_commission || 0), 0);
  const unpaidOfficeRevenue = filtered.filter(e => !e.office_payment_received).reduce((s, e) => s + (e.company_gross_commission || 0), 0);
  const allOfficeTotal = entries.reduce((s, e) => s + (e.company_gross_commission || 0), 0);
  const allOfficeReceived = entries.filter(e => e.office_payment_received).reduce((s, e) => s + (e.company_gross_commission || 0), 0);
  const officeProgress = allOfficeTotal > 0 ? Math.round((allOfficeReceived / allOfficeTotal) * 100) : 0;
  const totalExpenses = filteredExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const paidExpenses = filteredExpenses.filter(e => e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
  const pendingExpenses = filteredExpenses.filter(e => e.status === "pending").reduce((s, e) => s + (e.amount || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-full p-12"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounting</h1>
          <p className="text-gray-500 text-sm mt-1">Auto-synced from CDA entries in Commissions</p>
        </div>
      </div>

      {/* Office Payment Progress Bar */}
      <div className="mb-5 p-4 bg-white border rounded-xl shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-green-600" />
            <span className="text-sm font-semibold text-gray-700">Office Commission Received</span>
          </div>
          <span className="text-sm font-bold text-green-700">
            ${allOfficeReceived.toLocaleString("en-US", { maximumFractionDigits: 0 })} / ${allOfficeTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })} ({officeProgress}%)
          </span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
          <div className="h-3 rounded-full bg-green-500 transition-all duration-500" style={{ width: `${officeProgress}%` }} />
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Check "Office Paid" on each row when the office commission has been received</p>
      </div>

      {/* Summary Cards */}
      {activeTab === "income" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 mb-6">
          <Card><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Total Sales Volume</p><p className="text-2xl font-bold text-gray-900">${totalSales.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><TrendingUp className="w-5 h-5 text-blue-600" /></div>
          </CardContent></Card>
          <Card><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Office Commission</p><p className="text-2xl font-bold text-green-700">${totalOffice.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><Building2 className="w-5 h-5 text-green-600" /></div>
          </CardContent></Card>
          <Card><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Agent Commission</p><p className="text-2xl font-bold text-gray-900">${totalAgent.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
            <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5 text-purple-600" /></div>
          </CardContent></Card>
          <Card><CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Office Fees Collected</p>
              <p className="text-2xl font-bold text-emerald-700">${officeFeesCollected.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-gray-400 mt-0.5">{totalOffice > 0 ? Math.round((officeFeesCollected / totalOffice) * 100) : 0}% of office comm.</p>
            </div>
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><Building2 className="w-5 h-5 text-emerald-600" /></div>
          </CardContent></Card>

          <Card><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Desk Fees Collected</p><p className="text-2xl font-bold text-amber-700">${deskFeesCollected.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5 text-amber-600" /></div>
          </CardContent></Card>
          <Card><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Misc. Income</p><p className="text-2xl font-bold text-violet-700">${miscIncomeCollected.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5 text-violet-600" /></div>
          </CardContent></Card>
          <Card className="border-orange-200"><CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Unpaid Office Revenue</p>
              <p className="text-2xl font-bold text-orange-600">${unpaidOfficeRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-gray-400 mt-0.5">Office paid unchecked</p>
            </div>
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center"><AlertCircle className="w-5 h-5 text-orange-500" /></div>
          </CardContent></Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card><CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Expenses</p>
              <p className="text-2xl font-bold text-red-600">${totalExpenses.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
              <p className="text-xs text-gray-400 mt-0.5">{filteredExpenses.length} expense{filteredExpenses.length !== 1 ? "s" : ""}</p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><TrendingDown className="w-5 h-5 text-red-600" /></div>
          </CardContent></Card>
          <Card><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Paid</p><p className="text-2xl font-bold text-gray-900">${paidExpenses.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
            <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><DollarSign className="w-5 h-5 text-green-600" /></div>
          </CardContent></Card>
          <Card className="border-orange-200"><CardContent className="p-5 flex items-center justify-between">
            <div><p className="text-sm text-gray-500">Pending / Owed</p><p className="text-2xl font-bold text-orange-600">${pendingExpenses.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p></div>
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center"><Receipt className="w-5 h-5 text-orange-500" /></div>
          </CardContent></Card>
        </div>
      )}

      {/* Income / Expenses Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <TabsList>
            <TabsTrigger value="income">Income</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
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
            {dateRange === "custom" && (
              <>
                <Input type="date" value={customStartDate} onChange={e => setCustomStartDate(e.target.value)} className="w-32" />
                <Input type="date" value={customEndDate} onChange={e => setCustomEndDate(e.target.value)} className="w-32" />
              </>
            )}
          </div>
        </div>

        {/* INCOME TAB */}
        <TabsContent value="income">
          <div className="flex flex-wrap gap-3 mb-4 items-center">
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input className="pl-9" placeholder="Search address or agent..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <FilterButton
              filters={incomeFilters}
              onFiltersChange={setIncomeFilters}
              filterOptions={{

                "Office Paid": ["Yes", "No"],
                "Category": [...new Set(entries.filter(e => e.category).map(e => e.category))]
              }}
            />
            {selected.size > 0 && (
              <>
                <Button
                  variant="outline"
                  className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
                  onClick={async () => {
                    const today = new Date().toISOString().split("T")[0];
                    const ids = [...selected];
                    await Promise.all(ids.map(id => base44.entities.AccountingEntry.update(id, { office_payment_received: true, office_paid_date: today, status: "approved" })));
                    const entries_to_sync = entries.filter(e => ids.includes(e.id) && e.transaction_id);
                    await Promise.all(entries_to_sync.map(e => base44.entities.Transaction.update(e.transaction_id, { office_payment_received: true }).catch(() => {})));
                    setEntries(prev => prev.map(e => ids.includes(e.id) ? { ...e, office_payment_received: true, office_paid_date: today, status: "approved" } : e));
                    setSelected(new Set());
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" /> Mark Office Paid ({selected.size})
                </Button>
                <Button variant="destructive" className="gap-2" onClick={() => setBulkDeleteDialog(true)}>
                  <Trash2 className="w-4 h-4" /> Delete Selected ({selected.size})
                </Button>
              </>
            )}
            <div className="ml-auto flex gap-2">
              <Button variant="outline" onClick={() => { setCsvFile(null); setCsvResult(null); setCsvError(null); setShowBulkImport(true); }} className="gap-2">
                <Upload className="w-4 h-4" /> Bulk Import
              </Button>
              <Button variant="outline" onClick={() => setShowRecurring(true)} className="gap-2">
                <RefreshCw className="w-4 h-4" /> Recurring
              </Button>
              <Button onClick={() => setShowAddEntry(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Add Transaction
              </Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No accounting entries yet. They are created automatically from CDA submissions.</p>
            </div>
          ) : (
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="grid px-4 py-3 bg-gray-50 border-b" style={{ gridTemplateColumns }}>
                <div className="flex items-center">
                  <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleSelectAll} />
                </div>
                {["Description", "Closing Date", "Sale Price", "Office Comm.", "Agent Comm.", "Office Paid", "Paid Date", "Income Category"].map((label, i) => {
                  const fields = ["agent_name", "closing_date", "sale_price", "company_gross_commission", "agent_gross_commission", "office_payment_received", "office_paid_date", "category"];
                  return (
                    <div key={label} className="relative flex items-center pr-3">
                      <SortHeader label={label} field={fields[i]} sort={sort} onSort={handleSort} className={label === "Office Paid" ? "justify-center" : ""} />
                      <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize flex items-center justify-center group" onMouseDown={e => onMouseDown(e, i + 1)}>
                        <div className="w-px h-4 bg-gray-300 group-hover:bg-blue-400 group-hover:w-0.5 transition-all" />
                      </div>
                    </div>
                  );
                })}
                <div></div>
              </div>

              {filtered.map(e => (
                <div key={e.id}>
                  <div
                    onClick={() => handleEditEntry(e)}
                    className={`grid px-4 py-3 items-center border-b last:border-0 hover:bg-gray-50 transition-colors cursor-pointer ${selected.has(e.id) ? "bg-blue-50" : ""}`}
                    style={{ gridTemplateColumns }}
                  >
                    <div className="flex items-center">
                      <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggleSelect(e.id)} onClick={ev => ev.stopPropagation()} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate text-sm">{e.property_address}</p>
                      <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                        {e.agent_name || e.agent_email}
                        {e.category && <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{e.category}</span>}
                        {(() => { const txn = transactions.find(t => t.id === e.transaction_id); return txn?.admin_fee_amount > 0 ? <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs">Admin Fee: ${(txn.admin_fee_amount).toLocaleString()}{txn.admin_fee_payable_to ? ` → ${txn.admin_fee_payable_to}` : ''}</span> : null; })()}
                      </p>
                    </div>
                    <div className="text-sm text-gray-700">{safeDate(e.closing_date)}</div>
                    <div className="text-sm font-medium">${(e.sale_price || 0).toLocaleString()}</div>
                    <div className="text-sm font-semibold text-green-700 flex flex-col gap-0.5">
                      <span>${(e.company_gross_commission || 0).toLocaleString()}</span>
                      {(() => { const txn = transactions.find(t => t.id === e.transaction_id); return txn?.admin_fee_amount > 0 ? <span className="text-xs font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded w-fit">+${(txn.admin_fee_amount).toLocaleString()} fee</span> : null; })()}
                    </div>
                    <div className="text-sm text-gray-700">${(e.agent_gross_commission || 0).toLocaleString()}</div>
                    <div className="flex justify-center">
                      <Checkbox
                        checked={!!e.office_payment_received}
                        onCheckedChange={() => toggleOfficePayment(e)}
                        onClick={ev => ev.stopPropagation()}
                        className={e.office_payment_received ? "border-green-500 data-[state=checked]:bg-green-500" : ""}
                      />
                    </div>
                    <div className="text-sm text-gray-700">
                      {editingPaidDate === e.id ? (
                        <input
                          type="date"
                          autoFocus
                          defaultValue={e.office_paid_date || ""}
                          className="border rounded px-1 py-0.5 text-xs w-full"
                          onBlur={ev => updatePaidDate(e, ev.target.value)}
                          onKeyDown={ev => { if (ev.key === "Enter") updatePaidDate(e, ev.target.value); if (ev.key === "Escape") setEditingPaidDate(null); }}
                          onClick={ev => ev.stopPropagation()}
                        />
                      ) : (
                        <span
                          className={`cursor-pointer hover:underline hover:text-blue-600 transition-colors ${e.office_payment_received ? "text-gray-700" : "text-gray-400"}`}
                          title="Click to edit paid date"
                          onClick={ev => { ev.stopPropagation(); setEditingPaidDate(e.id); }}
                        >
                          {safeDate(e.office_paid_date)}
                        </span>
                      )}
                    </div>
                    <div className="text-xs" onClick={ev => ev.stopPropagation()}>
                      <CategorySelect
                        className="h-8"
                        type="income"
                        value={e.category || ""}
                        onChange={async (v) => {
                          // Optimistic update — no reload needed
                          setEntries(prev => prev.map(en => en.id === e.id ? { ...en, category: v } : en));
                          base44.entities.AccountingEntry.update(e.id, { category: v }).catch(() => {});
                          if (e.transaction_id) {
                            base44.entities.Transaction.update(e.transaction_id, { category: v }).catch(() => {});
                          }
                        }}
                        placeholder="Select category"
                      />
                    </div>
                    <div onClick={ev => ev.stopPropagation()}>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                        onClick={() => { setDeleteOptions({ commission: false, documents: false }); setDeleteDialog(e); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {expandedId === e.id && (
                    <div className="px-6 py-4 bg-gray-50 border-b space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs">Description or Property Address</Label>
                          <Input className="mt-1 text-sm" value={editForm.property_address || ""} onChange={ev => setEditForm({ ...editForm, property_address: ev.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Closing Date</Label>
                          <Input type="date" className="mt-1" value={editForm.closing_date || ""} onChange={ev => setEditForm({ ...editForm, closing_date: ev.target.value })} />
                        </div>
                        <div>
                          <Label className="text-xs">Sale Price $</Label>
                          <Input type="number" className="mt-1 text-sm" value={editForm.sale_price || ""} onChange={ev => setEditForm({ ...editForm, sale_price: parseFloat(ev.target.value) || 0 })} />
                        </div>
                        <div>
                          <Label className="text-xs">Office Gross Comm. $</Label>
                          <Input type="number" className="mt-1 text-sm" value={editForm.company_gross_commission || ""} onChange={ev => setEditForm({ ...editForm, company_gross_commission: parseFloat(ev.target.value) || 0 })} />
                        </div>
                        <div>
                          <Label className="text-xs">Agent Gross Comm. $</Label>
                          <Input type="number" className="mt-1 text-sm" value={editForm.agent_gross_commission || ""} onChange={ev => setEditForm({ ...editForm, agent_gross_commission: parseFloat(ev.target.value) || 0 })} />
                        </div>
                        <div>
                          <Label className="text-xs">Agent Net Commission $</Label>
                          <Input type="number" className="mt-1 text-sm" value={editForm.agent_net_commission || ""} onChange={ev => setEditForm({ ...editForm, agent_net_commission: parseFloat(ev.target.value) || 0 })} />
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2 border-t items-center">
                        <Button size="sm" className="gap-1.5" onClick={handleSaveEdit} disabled={saving}>
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setExpandedId(null)}>Cancel</Button>
                        {editForm.transaction_id && (
                          <a
                            href="/Commissions"
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto text-sm text-blue-600 hover:underline flex items-center gap-1.5"
                          >
                            <FileText className="w-4 h-4" /> View Original CDA
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* EXPENSES TAB */}
        <TabsContent value="expenses">
          <ExpensesTab
            dateRange={dateRange}
            customStartDate={customStartDate}
            customEndDate={customEndDate}
            filters={expenseFilters}
            onFiltersChange={setExpenseFilters}
          />
        </TabsContent>
      </Tabs>

      {/* CSV Import Dialog */}
      <Dialog open={showBulkImport} onOpenChange={(o) => { if (!o) { setShowBulkImport(false); setCsvFile(null); setCsvResult(null); setCsvError(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle>Bulk Import Income Entries</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Button variant="outline" size="sm" onClick={() => {
              const CSV_TEMPLATE = [
                ["agent_name", "agent_email", "property_address", "closing_date", "sale_price", "total_commission_amount", "company_gross_commission", "agent_gross_commission", "referral_fee_amount", "agent_net_commission", "transaction_type", "category", "status", "notes"],
                ["Agent Name", "agent@example.com", "123 Main St", "2026-03-18", "450000", "13500", "4050", "9450", "0", "9450", "buyer_side", "income_category", "pending", ""]
              ];
              const csv = CSV_TEMPLATE.map(r => r.join(",")).join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = "income_entries_template.csv"; a.click();
              URL.revokeObjectURL(url);
            }} className="gap-2 w-full">
              <Download className="w-4 h-4" /> Download CSV Template
            </Button>
            <label
              className={`flex flex-col items-center gap-3 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${csvDragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-400"}`}
              onDragOver={e => { e.preventDefault(); setCsvDragging(true); }}
              onDragLeave={() => setCsvDragging(false)}
              onDrop={e => { e.preventDefault(); setCsvDragging(false); const f = e.dataTransfer.files[0]; if (f) { setCsvFile(f); setCsvResult(null); setCsvError(null); } }}
            >
              <Upload className="w-6 h-6 text-gray-400" />
              <span className="text-sm text-gray-500 text-center">{csvFile ? csvFile.name : "Click to select or drag & drop a CSV file"}</span>
              <input type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) { setCsvFile(f); setCsvResult(null); setCsvError(null); } }} />
            </label>
            {csvError && <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"><AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{csvError}</div>}
            {csvResult && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${csvResult.failed > 0 ? "bg-orange-50 border border-orange-200 text-orange-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{csvResult.success} entries imported{csvResult.failed > 0 ? `, ${csvResult.failed} failed` : " successfully."}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBulkImport(false); setCsvFile(null); setCsvResult(null); setCsvError(null); }}>Close</Button>
            <Button onClick={async () => {
              if (!csvFile) return;
              setCsvLoading(true); setCsvResult(null); setCsvError(null);
              try {
                const text = await csvFile.text();
                const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
                if (lines.length < 2) throw new Error("CSV must have at least a header and one data row");
                const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
                const rows = lines.slice(1).map(line => {
                  const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
                  const row = {}; headers.forEach((h, i) => { row[h] = vals[i] || ""; }); return row;
                });
                let success = 0, failed = 0;
                for (const row of rows) {
                  if (!row.property_address || !row.sale_price) { failed++; continue; }
                  await base44.entities.AccountingEntry.create({
                    agent_email: row.agent_email || undefined,
                    agent_name: row.agent_name || row.agent_email || undefined,
                    property_address: row.property_address,
                    closing_date: row.closing_date || undefined,
                    sale_price: parseFloat(row.sale_price) || 0,
                    total_commission_amount: parseFloat(row.total_commission_amount) || 0,
                    company_gross_commission: parseFloat(row.company_gross_commission) || 0,
                    agent_gross_commission: parseFloat(row.agent_gross_commission) || 0,
                    referral_fee_amount: parseFloat(row.referral_fee_amount) || 0,
                    agent_net_commission: parseFloat(row.agent_net_commission) || 0,
                    transaction_type: row.transaction_type || undefined,
                    category: row.category || undefined,
                    status: row.status || "pending",
                    notes: row.notes || undefined,
                  });
                  success++;
                }
                setCsvResult({ success, failed });
                if (success > 0) await load();
              } catch (err) { setCsvError("Import failed: " + err.message); }
              setCsvLoading(false);
            }} disabled={!csvFile || csvLoading}>
              {csvLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import CSV"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RecurringPaymentsDialog open={showRecurring} onClose={() => setShowRecurring(false)} onStopped={load} />
      <AddAccountingEntryDialog open={showAddEntry} onClose={() => setShowAddEntry(false)} onCreated={() => { setShowAddEntry(false); load(); }} />

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteDialog} onOpenChange={() => setBulkDeleteDialog(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {selected.size} Entries</DialogTitle></DialogHeader>
          <p className="text-sm text-red-600 py-2">Permanently delete <strong>{selected.size}</strong> selected accounting entries? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteDialog(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleBulkDelete} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : `Delete ${selected.size} Entries`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Uncheck Office Paid Confirmation */}
      <Dialog open={!!uncheckDialog} onOpenChange={() => setUncheckDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertCircle className="w-5 h-5 text-orange-500" /> Confirm Uncheck</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-sm text-gray-700">Are you sure you want to uncheck <strong>Office Paid</strong> for:</p>
            <p className="text-sm font-medium text-gray-900 bg-gray-50 border rounded px-3 py-2">{uncheckDialog?.property_address}</p>
            <p className="text-sm text-orange-600 font-medium">⚠️ The paid date will be cleared.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUncheckDialog(null)}>Cancel</Button>
            <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => { const e = uncheckDialog; setUncheckDialog(null); toggleOfficePayment(e, true); }}>
              Yes, Uncheck
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={() => { setDeleteDialog(null); setDeleteOptions({ commission: false, documents: false }); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Accounting Entry</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-red-600">Permanently delete the accounting entry for <strong>{deleteDialog?.property_address}</strong>? This cannot be undone.</p>
            {deleteDialog?.transaction_id && (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Also delete associated records:</p>
                <div className="space-y-2 p-3 bg-gray-50 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox id="delCommission" checked={deleteOptions.commission} onCheckedChange={v => setDeleteOptions(o => ({ ...o, commission: !!v }))} />
                    <label htmlFor="delCommission" className="text-sm text-gray-700 cursor-pointer">Commission record in Commissions tab</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="delDocs" checked={deleteOptions.documents} onCheckedChange={v => setDeleteOptions(o => ({ ...o, documents: !!v }))} />
                    <label htmlFor="delDocs" className="text-sm text-gray-700 cursor-pointer">Documents in Document Vault linked to this transaction</label>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialog(null); setDeleteOptions({ commission: false, documents: false }); }}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}