import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useResizableColumns } from "@/hooks/useResizableColumns";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Search, FileText, Trash2, Loader2, ArrowUpDown, ChevronUp, ChevronDown, Plus, Upload, Download, CheckCircle2, AlertCircle } from "lucide-react";
import CategorySelect from "@/components/shared/CategorySelect";
import VendorSelect from "@/components/shared/VendorSelect";
import FilterButton from "@/components/accounting/FilterButton";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";

function safeDate(str) {
  if (!str) return "—";
  try {
    const d = str.includes("T") ? parseISO(str) : parseISO(str + "T00:00:00");
    return format(d, "MM/dd/yyyy");
  } catch { return str; }
}

function SortHeader({ label, field, sort, onSort }) {
  const active = sort.field === field;
  return (
    <button
      className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-800 transition-colors"
      onClick={() => onSort(field)}
    >
      {label}
      {active
        ? sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        : <ArrowUpDown className="w-3 h-3 opacity-30" />}
    </button>
  );
}

const EMPTY_FORM = {
  description: "",
  expense_date: new Date().toISOString().split("T")[0],
  amount: "",
  category: "",
  paid_by: "",
  payment_method: "other",
  status: "pending",
  notes: "",
};

export default function ExpensesTab({ dateRange, customStartDate, customEndDate, filters = {}, onFiltersChange = () => {} }) {
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ field: "expense_date", dir: "desc" });
  const [selected, setSelected] = useState(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvDragging, setCsvDragging] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const [csvError, setCsvError] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);

  const { gridTemplateColumns, onMouseDown } = useResizableColumns([32, 260, 120, 120, 130, 100, 100, 44]);

  const load = async () => {
    const data = await base44.entities.Expense.list("-expense_date", 500);
    setExpenses(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const unsub = base44.entities.Expense.subscribe(() => { load(); });
    return () => unsub();
  }, []);

  const getDateRange = () => {
    const today = new Date();
    const year = today.getFullYear();
    let start, end = new Date(today);
    if (dateRange === "all") { return { start: null, end: null }; }
    else if (dateRange === "current_year") { start = new Date(year, 0, 1); end = new Date(year, 11, 31, 23, 59, 59); }
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

  const filtered = useMemo(() => {
    const { start, end } = getDateRange();
    let data = expenses.filter(e => {
      const matchSearch = !search ||
        e.description?.toLowerCase().includes(search.toLowerCase()) ||
        e.category?.toLowerCase().includes(search.toLowerCase()) ||
        e.paid_by?.toLowerCase().includes(search.toLowerCase());
      const d = e.expense_date ? new Date(e.expense_date) : null;
      const matchDate = !start || (d && d >= start && d <= end);
      
      // Apply filters
      if (filters.status && filters.status.length > 0 && !filters.status.includes(e.status)) return false;
      if (filters.category && filters.category.length > 0 && !filters.category.includes(e.category)) return false;
      if (filters.payment_method && filters.payment_method.length > 0 && !filters.payment_method.includes(e.payment_method)) return false;
      
      return matchSearch && matchDate;
    });

    return [...data].sort((a, b) => {
      let av, bv;
      if (sort.field === "amount") { av = a.amount || 0; bv = b.amount || 0; }
      else if (sort.field === "expense_date") { av = a.expense_date || ""; bv = b.expense_date || ""; }
      else { av = a[sort.field] || ""; bv = b[sort.field] || ""; }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [expenses, search, dateRange, customStartDate, customEndDate, sort, filters]);

  const totalExpenses = filtered.reduce((s, e) => s + (e.amount || 0), 0);
  const paidExpenses = filtered.filter(e => e.status === "paid").reduce((s, e) => s + (e.amount || 0), 0);
  const pendingExpenses = filtered.filter(e => e.status === "pending").reduce((s, e) => s + (e.amount || 0), 0);

  const handleSort = (field) => {
    setSort(prev => prev.field === field
      ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
      : { field, dir: "desc" }
    );
  };

  const toggleSelect = (id) => {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleSelectAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(e => e.id)));
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { ...form, amount: parseFloat(form.amount) || 0 };
    if (editingExpense) {
      await base44.entities.Expense.update(editingExpense.id, data);
    } else {
      await base44.entities.Expense.create(data);
    }
    setSaving(false);
    setShowAddDialog(false);
    setEditingExpense(null);
    setForm({ ...EMPTY_FORM });
    load();
  };

  const handleDelete = async () => {
    setSaving(true);
    await base44.entities.Expense.delete(deleteDialog.id);
    setDeleteDialog(null);
    setSaving(false);
    load();
  };

  const handleBulkDelete = async () => {
    setSaving(true);
    await Promise.all([...selected].map(id => base44.entities.Expense.delete(id)));
    setSelected(new Set());
    setBulkDeleteDialog(false);
    setSaving(false);
    load();
  };

  const CSV_TEMPLATE = [
    ["description", "expense_date", "amount", "category", "paid_by", "payment_method", "status", "notes"],
    ["Office Supplies", "2026-03-01", "150.00", "Office", "John Smith", "credit_card", "paid", ""],
  ];

  const downloadExpenseTemplate = () => {
    const csv = CSV_TEMPLATE.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "expenses_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseExpenseCSV = (text) => {
    const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
      const row = {};
      headers.forEach((h, i) => { row[h] = vals[i] || ""; });
      return row;
    });
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvLoading(true);
    setCsvResult(null);
    setCsvError(null);
    try {
      const text = await csvFile.text();
      const rows = parseExpenseCSV(text);
      let success = 0, failed = 0;
      for (const row of rows) {
        if (!row.description || !row.amount) { failed++; continue; }
        await base44.entities.Expense.create({
          description: row.description,
          expense_date: row.expense_date || new Date().toISOString().split("T")[0],
          amount: parseFloat(row.amount) || 0,
          category: row.category || undefined,
          paid_by: row.paid_by || undefined,
          payment_method: row.payment_method || "other",
          status: row.status || "pending",
          notes: row.notes || undefined,
        });
        success++;
      }
      setCsvResult({ success, failed });
      if (success > 0) load();
    } catch (err) {
      setCsvError("Import failed: " + err.message);
    }
    setCsvLoading(false);
  };

  const handleEditRow = (expense) => {
    setEditForm({ ...expense });
    setExpandedId(expense.id);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    await base44.entities.Expense.update(editForm.id, { ...editForm, amount: parseFloat(editForm.amount) || 0 });
    setExpandedId(null);
    await load();
    setSaving(false);
  };

  if (loading) return <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Filters & Actions */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9" placeholder="Search description, category..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <FilterButton 
          filters={filters} 
          onFiltersChange={onFiltersChange}
          filterOptions={{
            "Status": ["pending", "paid"],
            "Payment Method": ["check", "credit_card", "bank_transfer", "cash", "other"],
            "Category": [...new Set(expenses.filter(e => e.category).map(e => e.category))]
          }}
        />
        {selected.size > 0 && (
          <>
            <Button
              variant="outline"
              className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
              onClick={async () => {
                const ids = [...selected];
                await Promise.all(ids.map(id => base44.entities.Expense.update(id, { status: "paid" })));
                setExpenses(prev => prev.map(e => ids.includes(e.id) ? { ...e, status: "paid" } : e));
                setSelected(new Set());
              }}
            >
              <CheckCircle2 className="w-4 h-4" /> Mark as Paid ({selected.size})
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
          <Button onClick={() => { setForm({ ...EMPTY_FORM }); setEditingExpense(null); setShowAddDialog(true); }} className="gap-2">
            <Plus className="w-4 h-4" /> Add Expense
          </Button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No expenses found. Click "Add Expense" to get started.</p>
        </div>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className="grid px-4 py-3 bg-gray-50 border-b" style={{ gridTemplateColumns }}>
            <div className="flex items-center">
              <Checkbox checked={filtered.length > 0 && selected.size === filtered.length} onCheckedChange={toggleSelectAll} />
            </div>
            {["Description", "Date", "Category", "Amount", "Status", "Payment Method"].map((label, i) => {
              const fields = ["description", "expense_date", "category", "amount", "status", "payment_method"];
              return (
                <div key={label} className="relative flex items-center pr-3">
                  <SortHeader label={label} field={fields[i]} sort={sort} onSort={handleSort} />
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
                onClick={() => handleEditRow(e)}
                className={`grid px-4 py-3 items-center border-b last:border-0 hover:bg-gray-50 transition-colors cursor-pointer ${selected.has(e.id) ? "bg-blue-50" : ""}`}
                style={{ gridTemplateColumns }}
              >
                <div className="flex items-center">
                  <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggleSelect(e.id)} onClick={ev => ev.stopPropagation()} />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate text-sm">{e.description}</p>
                  {e.paid_by && <p className="text-xs text-gray-400">{e.paid_by}</p>}
                </div>
                <div className="text-sm text-gray-700">{safeDate(e.expense_date)}</div>
                <div className="text-xs" onClick={ev => ev.stopPropagation()}>
                  <CategorySelect
                    className="h-8"
                    type="expense"
                    value={e.category || ""}
                    onChange={async (v) => {
                      await base44.entities.Expense.update(e.id, { category: v });
                      await load();
                    }}
                    placeholder="Category"
                  />
                </div>
                <div className="text-sm font-semibold text-red-600">${(e.amount || 0).toLocaleString()}</div>
                <div>
                  <Badge className={e.status === "paid" ? "bg-green-100 text-green-700 text-xs" : "bg-orange-100 text-orange-700 text-xs"}>
                    {e.status}
                  </Badge>
                </div>
                <div className="text-xs text-gray-500 capitalize">{e.payment_method?.replace(/_/g, " ")}</div>
                <div onClick={ev => ev.stopPropagation()}>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteDialog(e)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {expandedId === e.id && (
                <div className="px-6 py-4 bg-gray-50 border-b space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Description</Label>
                      <VendorSelect
                        className="mt-1"
                        value={editForm.description || ""}
                        onChange={v => setEditForm(f => ({ ...f, description: v }))}
                        onCategoryHint={cat => setEditForm(f => ({ ...f, category: f.category || cat }))}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Date</Label>
                      <Input type="date" className="mt-1" value={editForm.expense_date || ""} onChange={ev => setEditForm({ ...editForm, expense_date: ev.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Amount $</Label>
                      <Input type="number" className="mt-1 text-sm" value={editForm.amount || ""} onChange={ev => setEditForm({ ...editForm, amount: ev.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Paid By</Label>
                      <Input className="mt-1 text-sm" value={editForm.paid_by || ""} onChange={ev => setEditForm({ ...editForm, paid_by: ev.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Status</Label>
                      <Select value={editForm.status || "pending"} onValueChange={v => setEditForm({ ...editForm, status: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="paid">Paid</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Payment Method</Label>
                      <Select value={editForm.payment_method || "other"} onValueChange={v => setEditForm({ ...editForm, payment_method: v })}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="check">Check</SelectItem>
                          <SelectItem value="credit_card">Credit Card</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Category</Label>
                      <CategorySelect className="mt-1" type="expense" value={editForm.category || ""} onChange={v => setEditForm({ ...editForm, category: v })} placeholder="Select category" />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Notes</Label>
                      <Input className="mt-1 text-sm" value={editForm.notes || ""} onChange={ev => setEditForm({ ...editForm, notes: ev.target.value })} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t">
                    <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setExpandedId(null)}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(o) => { if (!o) { setShowAddDialog(false); setEditingExpense(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Description / Vendor <span className="text-red-500">*</span></Label>
              <VendorSelect
                className="mt-1"
                value={form.description}
                onChange={v => setForm(f => ({ ...f, description: v }))}
                onCategoryHint={cat => setForm(f => ({ ...f, category: f.category || cat }))}
                placeholder="e.g. Office Supplies"
              />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" className="mt-1" value={form.expense_date} onChange={e => setForm({ ...form, expense_date: e.target.value })} />
            </div>
            <div>
              <Label>Amount $</Label>
              <Input type="number" className="mt-1" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="col-span-2">
              <Label>Category <span className="text-red-500">*</span></Label>
              <CategorySelect className="mt-1" type="expense" value={form.category} onChange={v => setForm({ ...form, category: v })} placeholder="Select category" />
            </div>
            <div>
              <Label>Paid By</Label>
              <Input className="mt-1" placeholder="Name or department" value={form.paid_by} onChange={e => setForm({ ...form, paid_by: e.target.value })} />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={form.payment_method} onValueChange={v => setForm({ ...form, payment_method: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Owed</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Input className="mt-1" placeholder="Optional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setEditingExpense(null); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.description || !form.amount || !form.category}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : editingExpense ? "Update" : "Add Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Expense</DialogTitle></DialogHeader>
          <p className="text-sm text-red-600 py-2">Permanently delete <strong>{deleteDialog?.description}</strong>? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Import Dialog */}
      <Dialog open={showBulkImport} onOpenChange={(o) => { if (!o) { setShowBulkImport(false); setCsvFile(null); setCsvResult(null); setCsvError(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle>Bulk Import Expenses</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Button variant="outline" size="sm" onClick={downloadExpenseTemplate} className="gap-2 w-full">
              <Download className="w-4 h-4" /> Download CSV Template
            </Button>
            <label
              className={`flex flex-col items-center gap-3 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${csvDragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-400"}`}
              onDragOver={e => { e.preventDefault(); setCsvDragging(true); }}
              onDragLeave={() => setCsvDragging(false)}
              onDrop={e => { e.preventDefault(); setCsvDragging(false); const f = e.dataTransfer.files[0]; if (f) { setCsvFile(f); setCsvResult(null); setCsvError(null); } }}
            >
              <Upload className="w-6 h-6 text-gray-400" />
              <span className="text-sm text-gray-500 text-center">
                {csvFile ? csvFile.name : "Click to select or drag & drop a CSV file"}
              </span>
              <input type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) { setCsvFile(f); setCsvResult(null); setCsvError(null); } }} />
            </label>
            {csvError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{csvError}
              </div>
            )}
            {csvResult && (
              <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${csvResult.failed > 0 ? "bg-orange-50 border border-orange-200 text-orange-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
                <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{csvResult.success} expenses imported{csvResult.failed > 0 ? `, ${csvResult.failed} failed (missing description or amount)` : " successfully."}</span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowBulkImport(false); setCsvFile(null); setCsvResult(null); setCsvError(null); }}>Close</Button>
            <Button onClick={handleCsvImport} disabled={!csvFile || csvLoading}>
              {csvLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import CSV"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteDialog} onOpenChange={() => setBulkDeleteDialog(false)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {selected.size} Expenses</DialogTitle></DialogHeader>
          <p className="text-sm text-red-600 py-2">Permanently delete <strong>{selected.size}</strong> selected expenses? This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteDialog(false)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleBulkDelete} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : `Delete ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}