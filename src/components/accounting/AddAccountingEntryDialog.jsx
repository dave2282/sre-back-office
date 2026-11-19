import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import RecurringBlock from "@/components/accounting/RecurringBlock";
import ApplyEntryTo from "@/components/accounting/ApplyEntryTo";
import CategorySelect from "@/components/shared/CategorySelect";

const EMPTY_FORM = {
  property_address: "",
  closing_date: "",
  sale_price: "",
  total_commission_amount: "",
  agent_gross_commission: "",
  company_gross_commission: "",
  referral_fee_amount: "",
  agent_net_commission: "",
  transaction_type: "",
  category: "",
  status: "pending",
  notes: "",
};

const CSV_TEMPLATE = [
  ["agent_email", "property_address", "closing_date", "sale_price", "total_commission_amount", "company_gross_commission", "agent_gross_commission", "referral_fee_amount", "agent_net_commission", "transaction_type", "status", "notes"],
  ["agent@example.com", "123 Main St", "2026-04-15", "450000", "13500", "4050", "9450", "0", "9450", "buyer_side", "pending", ""],
];

function downloadTemplate() {
  const csv = CSV_TEMPLATE.map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "accounting_entries_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  });
}

export default function AddAccountingEntryDialog({ open, onClose, onCreated }) {
  const [agents, setAgents] = useState([]);
  const [deskFeePlans, setDeskFeePlans] = useState([]);
  const [tab, setTab] = useState("manual");
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // CSV tab
  const [csvFile, setCsvFile] = useState(null);
  const [csvDragging, setCsvDragging] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const [csvError, setCsvError] = useState(null);
  const [csvLoading, setCsvLoading] = useState(false);

  // Desk fees tab
  const [deskFeeForm, setDeskFeeForm] = useState({
    agent_name: "",
    agent_email: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [deskFeeSaving, setDeskFeeSaving] = useState(false);

  // Misc income tab
  const [miscIncomeForm, setMiscIncomeForm] = useState({
    description: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
  });
  const [miscIncomeSaving, setMiscIncomeSaving] = useState(false);

  // Office income tab
  const [officeIncomeForm, setOfficeIncomeForm] = useState({
    description: "",
    amount: "",
    date: new Date().toISOString().split("T")[0],
    category: "",
    notes: "",
  });
  const [officeIncomeSaving, setOfficeIncomeSaving] = useState(false);
  const [officeIncomeErrors, setOfficeIncomeErrors] = useState({});

  // Recurring state
  const [recurringEnabled, setRecurringEnabled] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState("monthly");
  const [recurringStartDate, setRecurringStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [recurringEndDate, setRecurringEndDate] = useState("");

  useEffect(() => {
    if (open) {
      base44.entities.Agent.filter({ status: "active" }).then(a => setAgents(a || []));
      base44.entities.BrokerageSettings.list().then(s => {
        const plans = s?.[0]?.desk_fee_plans || [];
        setDeskFeePlans(plans);
      });
    }
  }, [open]);

  const toggleAgent = (email) => {
    setSelectedAgents(prev =>
      prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]
    );
  };

  const generateRecurringDates = () => {
    const dates = [];
    let current = new Date(recurringStartDate);
    const end = recurringEndDate ? new Date(recurringEndDate) : new Date(current.getFullYear() + 1, current.getMonth(), current.getDate());
    const today = new Date();
    today.setHours(23, 59, 59, 999); // include all of today

    while (current <= end) {
      if (current <= today) {
        dates.push(new Date(current).toISOString().split("T")[0]);
      }
      if (recurringFrequency === "daily") {
        current.setDate(current.getDate() + 1);
      } else if (recurringFrequency === "weekly") {
        current.setDate(current.getDate() + 7);
      } else if (recurringFrequency === "monthly") {
        current.setMonth(current.getMonth() + 1);
      } else if (recurringFrequency === "quarterly") {
        current.setMonth(current.getMonth() + 3);
      }
    }
    
    return dates;
  };

  const handleManualSubmit = async () => {
    setSaving(true);
    const targets = agents.filter(a => selectedAgents.includes(a.user_email));

    const baseEntry = {
      property_address: form.property_address,
      closing_date: form.closing_date || undefined,
      sale_price: parseFloat(form.sale_price) || 0,
      total_commission_amount: parseFloat(form.total_commission_amount) || 0,
      company_gross_commission: parseFloat(form.company_gross_commission) || 0,
      agent_gross_commission: parseFloat(form.agent_gross_commission) || 0,
      referral_fee_amount: parseFloat(form.referral_fee_amount) || 0,
      agent_net_commission: parseFloat(form.agent_net_commission) || 0,
      transaction_type: form.transaction_type || undefined,
      category: form.category || undefined,
      status: form.status || "pending",
      notes: form.notes || undefined,
    };

    const datesToCreate = recurringEnabled ? generateRecurringDates() : [form.closing_date || undefined];
    const recurringId = recurringEnabled ? crypto.randomUUID() : undefined;
    const recurringLabel = recurringEnabled ? (form.property_address || "Recurring Entry") : undefined;

    if (targets.length === 0) {
      await Promise.all(datesToCreate.map(date =>
        base44.entities.AccountingEntry.create({
          ...baseEntry,
          closing_date: date,
          ...(recurringId ? { recurring_id: recurringId, recurring_label: recurringLabel } : {}),
        })
      ));
    } else {
      const promises = [];
      targets.forEach(agent => {
        datesToCreate.forEach(date => {
          promises.push(
            base44.entities.AccountingEntry.create({
              ...baseEntry,
              closing_date: date,
              agent_name: agent.full_name,
              agent_email: agent.user_email,
              ...(recurringId ? { recurring_id: recurringId, recurring_label: recurringLabel } : {}),
            })
          );
        });
      });
      await Promise.all(promises);
    }

    setSaving(false);
    onCreated();
    handleClose();
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvLoading(true);
    setCsvResult(null);
    setCsvError(null);
    try {
      const text = await csvFile.text();
      const rows = parseCSV(text);
      let success = 0, failed = 0;
      for (const row of rows) {
        if (!row.property_address) { failed++; continue; }
        // Find agent info if email provided
        const agent = agents.find(a => a.user_email?.toLowerCase() === row.agent_email?.toLowerCase());
        await base44.entities.AccountingEntry.create({
          agent_email: row.agent_email || undefined,
          agent_name: agent?.full_name || row.agent_name || row.agent_email || undefined,
          property_address: row.property_address,
          closing_date: row.closing_date || undefined,
          sale_price: parseFloat(row.sale_price) || 0,
          total_commission_amount: parseFloat(row.total_commission_amount) || 0,
          company_gross_commission: parseFloat(row.company_gross_commission) || 0,
          agent_gross_commission: parseFloat(row.agent_gross_commission) || 0,
          referral_fee_amount: parseFloat(row.referral_fee_amount) || 0,
          agent_net_commission: parseFloat(row.agent_net_commission) || 0,
          transaction_type: row.transaction_type || undefined,
          status: row.status || "pending",
          notes: row.notes || undefined,
        });
        success++;
      }
      setCsvResult({ success, failed });
      if (success > 0) onCreated();
    } catch (err) {
      setCsvError("Import failed: " + err.message);
    }
    setCsvLoading(false);
  };

  const handleDeskFeeSubmit = async () => {
    setDeskFeeSaving(true);
    try {
      const dates = recurringEnabled ? generateRecurringDates() : [deskFeeForm.date];
      const recurringId = recurringEnabled ? crypto.randomUUID() : undefined;
      const targets = agents.filter(a => selectedAgents.includes(a.user_email));
      const promises = [];
      const getEntries = (agent) => {
        const name = agent ? agent.full_name : deskFeeForm.agent_name;
        const email = agent ? agent.user_email : deskFeeForm.agent_email || undefined;
        const recurringLabel = recurringEnabled ? `Desk Fee - ${name}` : undefined;
        return dates.map(date =>
          base44.entities.AccountingEntry.create({
            agent_name: name,
            agent_email: email,
            property_address: `Desk Fee - ${name}`,
            closing_date: date,
            transaction_type: "desk_fee",
            company_gross_commission: parseFloat(deskFeeForm.amount) || 0,
            agent_gross_commission: 0,
            agent_net_commission: 0,
            status: "pending",
            notes: deskFeeForm.notes || undefined,
            ...(recurringId ? { recurring_id: recurringId, recurring_label: recurringLabel } : {}),
          })
        );
      };
      if (targets.length === 0) {
        promises.push(...getEntries(null));
      } else {
        targets.forEach(agent => promises.push(...getEntries(agent)));
      }
      await Promise.all(promises);
      onCreated();
      handleClose();
    } finally {
      setDeskFeeSaving(false);
    }
  };

  const handleOfficeIncomeSubmit = async () => {
    const errors = {};
    if (!officeIncomeForm.description) errors.description = true;
    if (!officeIncomeForm.amount) errors.amount = true;
    if (!officeIncomeForm.category) errors.category = true;
    if (Object.keys(errors).length > 0) {
      setOfficeIncomeErrors(errors);
      return;
    }
    setOfficeIncomeErrors({});
    setOfficeIncomeSaving(true);
    try {
      const dates = recurringEnabled ? generateRecurringDates() : [officeIncomeForm.date];
      const recurringId = recurringEnabled ? crypto.randomUUID() : undefined;
      const recurringLabel = recurringEnabled ? (officeIncomeForm.description || "Office Income") : undefined;
      const targets = agents.filter(a => selectedAgents.includes(a.user_email));
      const baseEntry = {
        transaction_type: "office_income",
        category: officeIncomeForm.category || undefined,
        company_gross_commission: parseFloat(officeIncomeForm.amount) || 0,
        agent_gross_commission: 0,
        agent_net_commission: 0,
        status: "pending",
        notes: officeIncomeForm.notes || undefined,
      };
      const promises = [];
      const makeEntries = (agent) => dates.map(date =>
        base44.entities.AccountingEntry.create({
          ...baseEntry,
          property_address: officeIncomeForm.description || "Office Income",
          closing_date: date,
          agent_name: agent?.full_name || undefined,
          agent_email: agent?.user_email || undefined,
          ...(recurringId ? { recurring_id: recurringId, recurring_label: recurringLabel } : {}),
        })
      );
      if (targets.length === 0) {
        promises.push(...makeEntries(null));
      } else {
        targets.forEach(agent => promises.push(...makeEntries(agent)));
      }
      await Promise.all(promises);
      onCreated();
      handleClose();
    } finally {
      setOfficeIncomeSaving(false);
    }
  };

  const handleMiscIncomeSubmit = async () => {
    setMiscIncomeSaving(true);
    try {
      const dates = recurringEnabled ? generateRecurringDates() : [miscIncomeForm.date];
      const recurringId = recurringEnabled ? crypto.randomUUID() : undefined;
      const recurringLabel = recurringEnabled ? (miscIncomeForm.description || "Misc. Income") : undefined;
      const targets = agents.filter(a => selectedAgents.includes(a.user_email));
      const promises = [];
      const getEntries = (agent) => dates.map(date =>
        base44.entities.AccountingEntry.create({
          property_address: miscIncomeForm.description || "Misc. Income",
          closing_date: date,
          transaction_type: "misc_income",
          company_gross_commission: parseFloat(miscIncomeForm.amount) || 0,
          agent_gross_commission: 0,
          agent_net_commission: 0,
          agent_name: agent?.full_name || undefined,
          agent_email: agent?.user_email || undefined,
          status: "pending",
          notes: miscIncomeForm.notes || undefined,
          ...(recurringId ? { recurring_id: recurringId, recurring_label: recurringLabel } : {}),
        })
      );
      if (targets.length === 0) {
        promises.push(...getEntries(null));
      } else {
        targets.forEach(agent => promises.push(...getEntries(agent)));
      }
      await Promise.all(promises);
      onCreated();
      handleClose();
    } finally {
      setMiscIncomeSaving(false);
    }
  };

  const handleClose = () => {
    setForm({ ...EMPTY_FORM });
    setSelectedAgents([]);
    setTab("manual");
    setCsvFile(null);
    setCsvResult(null);
    setCsvError(null);
    setDeskFeeForm({
      agent_name: "",
      agent_email: "",
      amount: "",
      plan_name: "",
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setMiscIncomeForm({
      description: "",
      amount: "",
      date: new Date().toISOString().split("T")[0],
      notes: "",
    });
    setOfficeIncomeForm({
      description: "",
      amount: "",
      date: new Date().toISOString().split("T")[0],
      category: "",
      notes: "",
    });
    setRecurringEnabled(false);
    setRecurringFrequency("monthly");
    setRecurringStartDate(new Date().toISOString().split("T")[0]);
    setRecurringEndDate("");
    onClose();
  };

  const f = (key, val) => setForm(p => {
    const updated = { ...p, [key]: val };
    // Auto-calculate agent net commission
    const agentGross = parseFloat(key === "agent_gross_commission" ? val : updated.agent_gross_commission) || 0;
    const referral = parseFloat(key === "referral_fee_amount" ? val : updated.referral_fee_amount) || 0;
    updated.agent_net_commission = agentGross - referral;
    return updated;
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="text-left">
          <DialogTitle>Add Accounting Entry</DialogTitle>
          <DialogDescription>Manually create an entry for one or more agents, or bulk import via CSV.</DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
           <TabsList className="mb-4">
             <TabsTrigger value="manual">Property Transaction</TabsTrigger>
             <TabsTrigger value="office_income">Office Income</TabsTrigger>
             <TabsTrigger value="csv">Bulk CSV Import</TabsTrigger>
           </TabsList>

          {/* ── MANUAL TAB ── */}
          <TabsContent value="manual" className="space-y-5">
            {/* Entry Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Category <span className="text-red-500">*</span></Label>
                <CategorySelect className="mt-1" type="income" value={form.category} onChange={v => f("category", v)} placeholder="Select category" />
              </div>
              <div className="col-span-2">
                <Label>Description or Property Address <span className="text-red-500">*</span></Label>
                <Input className="mt-1" placeholder="123 Main St" value={form.property_address} onChange={e => f("property_address", e.target.value)} />
              </div>
              </div>
              <ApplyEntryTo
                agents={agents}
                selectedAgents={selectedAgents}
                toggleAgent={(email) => {
                  setSelectedAgents(prev => prev.includes(email) ? [] : [email]);
                }}
                singleSelect={true}
                required={true}
              />
              <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Closing Date</Label>
                <Input type="date" className="mt-1" value={form.closing_date} onChange={e => f("closing_date", e.target.value)} />
              </div>
              <div>
                <Label>Transaction Type</Label>
                <CategorySelect className="mt-1" type="income" value={form.transaction_type} onChange={v => f("transaction_type", v)} placeholder="Select type (optional)" />
              </div>
              <div>
                <Label>Sale Price $</Label>
                <Input type="number" className="mt-1" placeholder="450000" value={form.sale_price} onChange={e => f("sale_price", e.target.value)} />
              </div>
              <div>
                <Label>Total Commission $</Label>
                <Input type="number" className="mt-1" placeholder="13500" value={form.total_commission_amount} onChange={e => f("total_commission_amount", e.target.value)} />
              </div>
              <div>
                <Label>Office Gross Comm. $</Label>
                <Input type="number" className="mt-1" placeholder="4050" value={form.company_gross_commission} onChange={e => f("company_gross_commission", e.target.value)} />
              </div>
              <div>
                <Label>Agent Gross Comm. $</Label>
                <Input type="number" className="mt-1" placeholder="9450" value={form.agent_gross_commission} onChange={e => f("agent_gross_commission", e.target.value)} />
              </div>
              <div>
                <Label>Referral Fee $</Label>
                <Input type="number" className="mt-1" placeholder="0" value={form.referral_fee_amount} onChange={e => f("referral_fee_amount", e.target.value)} />
              </div>
              <div>
                <Label>Agent Net Commission $</Label>
                <div className="mt-1 flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 py-1 text-sm font-semibold text-gray-800">
                  ${(parseFloat(form.agent_net_commission) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  <span className="ml-auto text-xs font-normal text-muted-foreground">auto-calculated</span>
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={v => f("status", v)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Input className="mt-1" placeholder="Optional notes..." value={form.notes} onChange={e => f("notes", e.target.value)} />
              </div>
              </div>
              </TabsContent>

          {/* ── OFFICE INCOME TAB ── */}
          <TabsContent value="office_income" className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Category <span className="text-red-500">*</span></Label>
                <CategorySelect className={`mt-1 ${officeIncomeErrors.category ? "border-red-500" : ""}`} type="income" value={officeIncomeForm.category} onChange={v => { setOfficeIncomeErrors(p => ({ ...p, category: false })); setOfficeIncomeForm(p => ({ ...p, category: v })); }} placeholder="Select category" />
                {officeIncomeErrors.category && <p className="text-xs text-red-500 mt-1">Category is required</p>}
              </div>
              <div className="col-span-2">
                <Label>Description <span className="text-red-500">*</span></Label>
                <Input className={`mt-1 ${officeIncomeErrors.description ? "border-red-500 focus-visible:ring-red-500" : ""}`} placeholder="e.g. Franchise Fee, Training Income" value={officeIncomeForm.description} onChange={e => { setOfficeIncomeErrors(p => ({ ...p, description: false })); setOfficeIncomeForm(p => ({ ...p, description: e.target.value })); }} />
                {officeIncomeErrors.description && <p className="text-xs text-red-500 mt-1">Description is required</p>}
              </div>
              <div>
                <Label>Date</Label>
                <Input type="date" className="mt-1" value={officeIncomeForm.date} onChange={e => setOfficeIncomeForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div>
                <Label>Amount $</Label>
                <Input type="number" className={`mt-1 ${officeIncomeErrors.amount ? "border-red-500 focus-visible:ring-red-500" : ""}`} placeholder="0.00" value={officeIncomeForm.amount} onChange={e => { setOfficeIncomeErrors(p => ({ ...p, amount: false })); setOfficeIncomeForm(p => ({ ...p, amount: e.target.value })); }} />
                {officeIncomeErrors.amount && <p className="text-xs text-red-500 mt-1">Amount is required</p>}
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Input className="mt-1" placeholder="Optional notes..." value={officeIncomeForm.notes} onChange={e => setOfficeIncomeForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <ApplyEntryTo agents={agents} selectedAgents={selectedAgents} toggleAgent={toggleAgent} />
            <RecurringBlock
              enabled={recurringEnabled} setEnabled={setRecurringEnabled}
              frequency={recurringFrequency} setFrequency={setRecurringFrequency}
              startDate={recurringStartDate} setStartDate={setRecurringStartDate}
              endDate={recurringEndDate} setEndDate={setRecurringEndDate}
            />
          </TabsContent>

          {/* ── CSV TAB ── */}
          <TabsContent value="csv" className="space-y-4">
            <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2 w-full">
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
                <span>{csvResult.success} entries imported{csvResult.failed > 0 ? `, ${csvResult.failed} failed (missing property_address)` : " successfully."}
                </span>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          {tab === "manual" ? (
            <Button
              onClick={handleManualSubmit}
              disabled={saving || !form.property_address || !form.category || selectedAgents.length === 0}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          ) : tab === "office_income" ? (
            <Button onClick={handleOfficeIncomeSubmit} disabled={officeIncomeSaving}>
              {officeIncomeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Office Income"}
            </Button>
          ) : (
            <Button onClick={handleCsvImport} disabled={!csvFile || csvLoading}>
              {csvLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import CSV"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}