import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Search, FolderOpen, Loader2, Trash2, Building2, FileText, ChevronDown, ChevronUp, Pencil, ArrowUpDown, Sparkles, Eye, CheckCircle2, Download } from "lucide-react";
import { format, startOfYear, subYears, subDays } from "date-fns";
import TransactionSearchSelect from "@/components/documents/TransactionSearchSelect";
import SmartScanUpload from "@/components/documents/SmartScanUpload";
import AgentSmartScanUpload from "@/components/documents/AgentSmartScanUpload";
import FolderAuditPanel from "@/components/documents/FolderAuditPanel";

const TRANSACTION_CATEGORIES = [
  { value: "purchase_agreement", label: "Purchase Agreement" },
  { value: "counter_proposal", label: "Counter Proposal" },
  { value: "addendum", label: "Addendum" },
  { value: "commission_agreement", label: "Commission Agreement" },
  { value: "id_verification", label: "ID Verification" },
  { value: "other", label: "Other" },
];

const OFFICE_CATEGORIES = [
  { value: "agent_signup_form", label: "Agent Signup Form" },
  { value: "form_1099", label: "1099 Form" },
  { value: "contractor_agreement", label: "Contractor Agreement" },
  { value: "policy_manual", label: "Policy Manual" },
  { value: "office_announcement", label: "Office Announcement" },
  { value: "other", label: "Other" },
];

const REQUIRED_DOCS = {
  transaction: ["purchase_agreement", "counter_proposal", "addendum", "commission_agreement"],
  office: ["agent_signup_form", "form_1099", "contractor_agreement"],
};

const FILE_STATUS_CONFIG = {
  pending:        { label: "Pending",        className: "bg-gray-100 text-gray-600" },
  ai_approved:    { label: "AI Approved",    className: "bg-blue-100 text-blue-700" },
  approved:       { label: "Approved",       className: "bg-green-100 text-green-700" },
  rejected:       { label: "Rejected",       className: "bg-red-100 text-red-700" },
  needs_revision: { label: "Needs Revision", className: "bg-orange-100 text-orange-700" },
};

export default function DocumentVault() {
  const [docs, setDocs] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState("transaction");
  const [expanded, setExpanded] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [form, setForm] = useState({ name: "", category: "other", notes: "", doc_section: "transaction", transaction_id: null, transaction_type: "", file_type_name: "", file_status: "pending", status: "in_progress" });
  const [file, setFile] = useState(null);
  const [editDoc, setEditDoc] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", notes: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [creatingTransaction, setCreatingTransaction] = useState(false);
  const [showCDAPrompt, setShowCDAPrompt] = useState(false);
  const [newTransactionForCDA, setNewTransactionForCDA] = useState(null);
  const [showAgentList, setShowAgentList] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [sort, setSort] = useState({ field: "closing_date", dir: "desc" });
  const [bulkDeleteDialog, setBulkDeleteDialog] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkDeleteOptions, setBulkDeleteOptions] = useState({ accounting: false, commission: false });
  const [docDeleteDialog, setDocDeleteDialog] = useState(null);
  const [docDeleteOptions, setDocDeleteOptions] = useState({ commission: false, accounting: false });
  const [docDeleting, setDocDeleting] = useState(false);
  const [showSmartScan, setShowSmartScan] = useState(false);
  const [showAgentSmartScan, setShowAgentSmartScan] = useState(false);
  const [showUploadTypeDialog, setShowUploadTypeDialog] = useState(false);
  const [folderSelectedDocs, setFolderSelectedDocs] = useState({});
  const [folderDeleteConfirm, setFolderDeleteConfirm] = useState(null);
  const [folderAuditResults, setFolderAuditResults] = useState({});
  const [folderDocs, setFolderDocs] = useState({});
  const [loadingFolderIds, setLoadingFolderIds] = useState(new Set());
  const expandedRef = useRef(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [dateRange, setDateRange] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 100;
  const [folderChanges, setFolderChanges] = useState({});
  const [agentFilter, setAgentFilter] = useState(new Set());
  const [agentFilterOpen, setAgentFilterOpen] = useState(false);
  const [fileStatusFilter, setFileStatusFilter] = useState(new Set());
  const [bulkStatusPending, setBulkStatusPending] = useState("");
  const [bulkStatusConfirm, setBulkStatusConfirm] = useState(false);
  const [fileStatusOpen, setFileStatusOpen] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState(null);
  const [folderSmartScanTxnId, setFolderSmartScanTxnId] = useState(null);
  const [nameDropOpen, setNameDropOpen] = useState(false);
  const navigate = useNavigate();

  const toggleFileStatus = (status) => {
    setFileStatusFilter(prev => {
      const next = new Set(prev);
      next.has(status) ? next.delete(status) : next.add(status);
      return next;
    });
  };

  const load = async () => {
    const me = await base44.auth.me();
    setUser(me);
    const viewAsAgent = localStorage.getItem("viewAsAgent") === "true";
    const isAgentView = (me.role !== 'admin' && me.role !== 'staff') || viewAsAgent;
    const settingsData = await base44.entities.BrokerageSettings.list();
    if (settingsData?.length > 0) setSettings(settingsData[0]);

    if (!isAgentView) {
      const retryWithBackoff = async (fn, maxRetries = 2) => {
        let lastError;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          try {
            return await fn();
          } catch (error) {
            lastError = error;
            if (error.message?.includes('429') || error.message?.includes('Rate limit')) {
              const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
              console.warn(`Rate limit, retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
              await new Promise(r => setTimeout(r, delay));
            } else {
              throw error;
            }
          }
        }
        throw lastError;
      };
      const [txnData, agentData, docData] = await Promise.all([
        retryWithBackoff(() => base44.entities.Transaction.list("-created_date", 1000)),
        retryWithBackoff(() => base44.entities.Agent.list("-created_date", 100)),
        retryWithBackoff(() => base44.entities.Document.list("-created_date", 1000)),
      ]);
      setTransactions(txnData || []);
      setAgents(agentData || []);
      setDocs(docData || []);
    } else {
      const allAgents = await base44.entities.Agent.list("-created_date", 500);
      const tcForAgents = (allAgents || []).filter(a =>
        (a.transaction_coordinators || []).includes(me.email)
      );
      const tcAgentEmails = tcForAgents.map(a => a.user_email);

      const [myTxns, myDocs] = await Promise.all([
        base44.entities.Transaction.filter({ agent_email: me.email }, "-created_date", 500),
        base44.entities.Document.filter({ agent_email: me.email }, "-created_date", 500),
      ]);

      let tcTxns = [];
      let tcDocs = [];
      if (tcAgentEmails.length > 0) {
        const batchSize = 3;
        for (let i = 0; i < tcAgentEmails.length; i += batchSize) {
          const batch = tcAgentEmails.slice(i, i + batchSize);
          const [txnBatch, docBatch] = await Promise.all([
            Promise.all(batch.map(email => base44.entities.Transaction.filter({ agent_email: email }, "-created_date", 500))),
            Promise.all(batch.map(email => base44.entities.Document.filter({ agent_email: email }, "-created_date", 500))),
          ]);
          tcTxns = [...tcTxns, ...txnBatch.flat()];
          tcDocs = [...tcDocs, ...docBatch.flat()];
        }
      }

      const allTxns = [...(myTxns || []), ...tcTxns.filter(t => !(myTxns || []).find(m => m.id === t.id))];
      const allDocs = [...(myDocs || []), ...tcDocs.filter(d => !(myDocs || []).find(m => m.id === d.id))];

      // For the agent filter dropdown: show self + all TC agents
      const myAgentRecord = allAgents.find(a => a.user_email === me.email);
      const filterableAgents = [
        ...(myAgentRecord ? [myAgentRecord] : []),
        ...tcForAgents.filter(a => a.user_email !== me.email),
      ];
      setTransactions(allTxns);
      setAgents(filterableAgents);
      setDocs(allDocs);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    let reloadTimer = null;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => load(), 3000);
    };
    const unsubDocs = base44.entities.Document.subscribe(scheduleReload);
    const unsubTxns = base44.entities.Transaction.subscribe(scheduleReload);
    return () => { unsubDocs(); unsubTxns(); if (reloadTimer) clearTimeout(reloadTimer); };
  }, []);

  const loadFolderDocs = async (id, section, record) => {
    setLoadingFolderIds(prev => new Set([...prev, id]));
    let fetched;
    if (section === 'office') {
      fetched = await base44.entities.Document.filter({ agent_email: record.user_email, doc_section: 'office' }, '-created_date', 500);
    } else {
      fetched = await base44.entities.Document.filter({ transaction_id: id }, '-created_date', 500);
    }
    setFolderDocs(prev => ({ ...prev, [id]: fetched || [] }));
    setLoadingFolderIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  const handleExpand = (record) => {
    const id = record.id;
    const isOpen = expanded === id;
    if (isOpen) {
      setExpanded(null);
      expandedRef.current = null;
    } else {
      setExpanded(id);
      expandedRef.current = { id, section: activeSection, record };
      if (isAdmin && folderDocs[id] === undefined) {
        loadFolderDocs(id, activeSection, record);
      }
    }
  };

  const openUpload = (section, transactionId = null, opts = {}) => {
    const txn = transactionId ? transactions.find(t => t.id === transactionId) : null;
    setForm({ name: "", category: "other", notes: "", doc_section: section, transaction_id: transactionId, transaction_type: "", file_type_name: txn?.file_type_name || "", file_status: "pending", status: "in_progress", agent_name: txn?.agent_name || "", lockFileType: opts.lockFileType || false, terminatedOnly: opts.terminatedOnly || false, lockedTransaction: opts.lockedTransaction || false });
    setFile(null);
    setShowUpload(true);
  };

  const handleCreateNewTransaction = async (txnData) => {
    setCreatingTransaction(true);
    try {
      const created = await base44.entities.Transaction.create({
        agent_email: user.email,
        agent_name: txnData.agent_name || user.email,
        property_address: txnData.property_address,
        sale_price: 0,
        status: "draft",
      });
      setTransactions([created, ...transactions]);
      setNewTransactionForCDA(created);
      setShowCDAPrompt(true);
      return created;
    } finally {
      setCreatingTransaction(false);
    }
  };

  const handleCreateCDA = async () => {
    if (!newTransactionForCDA) return;
    setForm(f => ({ ...f, transaction_id: newTransactionForCDA.id }));
    setShowCDAPrompt(false);
    setNewTransactionForCDA(null);
  };

  const analyzeFile = async (selectedFile) => {
    setAnalyzing(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });
    const allCategories = activeSection === "office" ? OFFICE_CATEGORIES : TRANSACTION_CATEGORIES;
    const categoryValues = allCategories.map(c => c.value).join(", ");
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Analyze this real estate document and extract key information. Return a JSON with:
   - "name": a concise descriptive title for the document (e.g. "Purchase Agreement - 123 Main St")
   - "category": one of [${categoryValues}] that best fits this document. Only if category is left blank/auto-detect.
   - "notes": a 1-2 sentence summary of the document's key details (parties, dates, amounts, property address if visible)

   Only return valid JSON, nothing else.`,
      file_urls: [file_url],
      response_json_schema: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string" },
          notes: { type: "string" }
        }
      }
    });
    setForm(f => ({
      ...f,
      name: result.name || f.name,
      category: !f.category ? (result.category || f.category) : f.category,
      notes: result.notes || f.notes,
    }));
    setAnalyzing(false);
    return file_url;
  };

  const handleFileSelect = async (selectedFile) => {
    setFile(selectedFile);
    const url = await analyzeFile(selectedFile);
    setUploadedUrl(url);
  };

  const handleUpload = async () => {
    if (!file || !form.name || (form.doc_section === "transaction" && (!form.transaction_id || !form.agent_name))) return;
    if (form.doc_section === "office" && !form.office_agent_email) return;
    setUploading(true);
    const file_url = uploadedUrl || (await base44.integrations.Core.UploadFile({ file })).file_url;

    const txn = transactions.find(t => t.id === form.transaction_id);
    const isTCEntry = txn && txn.agent_email !== user.email;
    const tcNote = isTCEntry ? `[TC entry by ${user.full_name || user.email}]` : "";
    const finalNotes = [form.notes, tcNote].filter(Boolean).join(" ");

    await base44.entities.Document.create({
      ...form,
      notes: finalNotes,
      file_url,
      file_type: file.type,
      agent_email: form.doc_section === "office" ? (isAdmin ? form.office_agent_email : user.email) : (txn?.agent_email || user.email),
    });
    await load();
    setShowUpload(false);
    setFile(null);
    setUploadedUrl(null);
    setUploading(false);
  };

  const handleDelete = (doc) => {
    setDocDeleteOptions({ commission: false, accounting: false });
    setDocDeleteDialog({ doc });
  };

  const confirmDocDelete = async () => {
    const { doc } = docDeleteDialog;
    setDocDeleting(true);
    await base44.entities.Document.delete(doc.id);
    setDocDeleteDialog(null);
    setDocDeleting(false);
    await new Promise(resolve => setTimeout(resolve, 500));
    await load();
  };

  const handleEditSave = async () => {
    if (!editDoc || !editForm.name) return;
    setEditSaving(true);
    const txn = transactions.find(t => t.id === editDoc.transaction_id);
    const isTCEdit = txn && txn.agent_email !== user.email;
    const tcTag = isTCEdit ? ` [TC edit by ${user.full_name || user.email}]` : "";
    const finalNotes = editForm.notes + tcTag;
    const updatePayload = { name: editForm.name, notes: finalNotes };
    if (editForm.category) updatePayload.category = editForm.category;
    await base44.entities.Document.update(editDoc.id, updatePayload);
    // Refresh folder docs for admin so changes are reflected immediately
    if (isAdmin && editDoc.transaction_id) {
      const record = transactions.find(t => t.id === editDoc.transaction_id);
      if (record) await loadFolderDocs(editDoc.transaction_id, 'transaction', record);
    }
    await load();
    setEditDoc(null);
    setEditSaving(false);
  };

  const viewAsAgent = localStorage.getItem("viewAsAgent") === "true";
  const isAdmin = (user?.role === "admin" || user?.role === "staff") && !viewAsAgent;
  const categories = activeSection === "office" ? OFFICE_CATEGORIES : TRANSACTION_CATEGORIES;

  const handleSort = (field) => {
    setSort(prev => prev.field === field ? { field, dir: prev.dir === "asc" ? "desc" : "asc" } : { field, dir: "asc" });
    setSelected(new Set());
  };

  const now = new Date();
  const rangeStart = (() => {
    switch (dateRange) {
      case "30d": return subDays(now, 30);
      case "90d": return subDays(now, 90);
      case "ytd": return startOfYear(now);
      case "last_year": return startOfYear(subYears(now, 1));
      case "custom": return customStart ? new Date(customStart) : null;
      default: return null;
    }
  })();
  const rangeEnd = (() => {
    if (dateRange === "last_year") return startOfYear(now);
    if (dateRange === "custom") return customEnd ? new Date(customEnd + "T23:59:59") : null;
    return null;
  })();

  const records = useMemo(() => {
    let data;
    if (activeSection === "office") {
      data = agents.filter(a => {
        if (!(!search || a.full_name?.toLowerCase().includes(search.toLowerCase()))) return false;
        if (fileStatusFilter.size > 0 && fileStatusFilter.size < 5) {
          const agentDocs = docs.filter(d => d.agent_email === a.user_email && d.doc_section === "office");
          const status = agentDocs[0]?.status || "in_progress";
          if (!fileStatusFilter.has(status)) return false;
        }
        if (agentFilter.size > 0 && !agentFilter.has(a.user_email)) return false;
        return true;
      });
      return [...data].sort((a, b) => {
        const av = sort.field === "full_name" ? (a.full_name || "") : (a.user_email || "");
        const bv = sort.field === "full_name" ? (b.full_name || "") : (b.user_email || "");
        return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    data = transactions.filter(t => {
      const matchSearch = !search ||
        t.property_address?.toLowerCase().includes(search.toLowerCase()) ||
        t.agent_name?.toLowerCase().includes(search.toLowerCase()) ||
        t.closing_date?.includes(search);
      if (!matchSearch) return false;
      if (rangeStart || rangeEnd) {
        const d = t.closing_date ? new Date(t.closing_date) : new Date(t.created_date);
        if (rangeStart && d < rangeStart) return false;
        if (rangeEnd && d >= rangeEnd) return false;
      }
      if (fileStatusFilter.size > 0) {
        const vaultStatus = t.doc_vault_status || "in_progress";
        if (!fileStatusFilter.has(vaultStatus)) return false;
      }
      if (agentFilter.size > 0 && !agentFilter.has(t.agent_email)) return false;
      return true;
    });
    return [...data].sort((a, b) => {
      let av, bv;
      if (sort.field === "closing_date") { av = a.closing_date || ""; bv = b.closing_date || ""; }
      else if (sort.field === "property_address") { av = a.property_address || ""; bv = b.property_address || ""; }
      else if (sort.field === "agent_name") { av = a.agent_name || ""; bv = b.agent_name || ""; }
      else { av = a[sort.field] || ""; bv = b[sort.field] || ""; }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    });
  }, [activeSection, transactions, agents, docs, search, sort, rangeStart, rangeEnd, fileStatusFilter, agentFilter]);

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return records.slice(start, start + pageSize);
  }, [records, page, pageSize]);

  const totalPages = Math.ceil(records.length / pageSize);

  useEffect(() => setPage(1), [records.length]);

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const toggleAll = () => {
    setSelected(selected.size === records.length ? new Set() : new Set(records.map(r => r.id)));
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    for (const id of selected) {
      const recordDocs = folderDocs[id] || (activeSection === "office"
        ? docs.filter(d => { const r = records.find(x => x.id === id); return d.agent_email === r?.user_email && d.doc_section === "office"; })
        : docs.filter(d => d.transaction_id === id));
      for (const doc of recordDocs) {
        await base44.entities.Document.delete(doc.id);
      }
      if (activeSection === "transaction") {
        if (bulkDeleteOptions.commission) {
          await base44.entities.Transaction.delete(id).catch(() => {});
        }
        if (bulkDeleteOptions.accounting) {
          const entries = await base44.entities.AccountingEntry.filter({ transaction_id: id });
          await Promise.all((entries || []).map(e => base44.entities.AccountingEntry.delete(e.id)));
        }
      }
    }
    setSelected(new Set());
    setBulkDeleteDialog(false);
    setBulkDeleting(false);
    setBulkDeleteOptions({ accounting: false, commission: false });
    await new Promise(resolve => setTimeout(resolve, 500));
    await load();
  };

  if (loading) return <div className="flex items-center justify-center h-full p-12"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Document Vault</h1>
        <div className="flex items-center gap-2">
          {activeSection === "transaction" && (
            <Button variant="outline" onClick={() => setShowSmartScan(true)} className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50">
              <Sparkles className="w-4 h-4" /> Smart File Upload
            </Button>
          )}
          {activeSection === "office" && isAdmin && (
            <Button variant="outline" onClick={() => setShowAgentSmartScan(true)} className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50">
              <Sparkles className="w-4 h-4" /> Smart File Upload
            </Button>
          )}
          <Button onClick={() => activeSection === "office" ? openUpload(activeSection) : setShowUploadTypeDialog(true)} className="gap-2">
            <Upload className="w-4 h-4" />Manual File Upload
          </Button>
        </div>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-2 mb-5">
        <button
          onClick={() => { setActiveSection("transaction"); setExpanded(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeSection === "transaction" ? "bg-gray-900 text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}
        >
          <FileText className="w-4 h-4" /> Transaction Records
        </button>
        <button
          onClick={() => { setActiveSection("office"); setExpanded(null); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeSection === "office" ? "bg-gray-900 text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}
        >
          <Building2 className="w-4 h-4" /> {isAdmin ? "Agent Records" : "My Agent File"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input className="pl-9 w-64" placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="relative">
          <button
            className="px-3 py-2 border rounded-lg text-sm bg-white hover:bg-gray-50 flex items-center gap-2 min-w-48"
            onClick={() => setFileStatusOpen(o => !o)}
          >
            File Status {fileStatusFilter.size > 0 && <span className="text-xs bg-blue-500 text-white px-1.5 rounded-full font-medium">{fileStatusFilter.size}</span>}
            <ChevronDown className="w-3.5 h-3.5 ml-auto text-gray-400" />
          </button>
          {fileStatusOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setFileStatusOpen(false)} />
              <div className="absolute z-50 top-full mt-1 left-0 bg-white border rounded-lg shadow-lg p-3 space-y-2 min-w-60">
                <button className="text-xs text-gray-400 hover:text-gray-600 w-full text-left mb-1" onClick={() => setFileStatusFilter(new Set())}>Clear filter</button>
                {["in_progress", "under_review", "missing_docs", "completed"].map(status => (
                  <div key={status} className="flex items-center gap-2">
                    <Checkbox
                      id={`status-${status}`}
                      checked={fileStatusFilter.has(status)}
                      onCheckedChange={() => toggleFileStatus(status)}
                    />
                    <label htmlFor={`status-${status}`} className="text-sm text-gray-700 cursor-pointer flex-1">
                      {status === "in_progress" ? "In Progress" : status === "under_review" ? "Review Requested" : status === "missing_docs" ? "Missing Docs" : "Completed"}
                    </label>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="relative">
          <button
            className="px-3 py-2 border rounded-lg text-sm bg-white hover:bg-gray-50 flex items-center gap-2 min-w-48"
            onClick={() => setAgentFilterOpen(o => !o)}
          >
            {agentFilter.size > 0 ? `${agentFilter.size} Agent${agentFilter.size > 1 ? "s" : ""}` : "All Agents"}
            {agentFilter.size > 0 && <span className="text-xs bg-blue-500 text-white px-1.5 rounded-full font-medium">{agentFilter.size}</span>}
            <ChevronDown className="w-3.5 h-3.5 ml-auto text-gray-400" />
          </button>
          {agentFilterOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setAgentFilterOpen(false)} />
              <div className="absolute z-50 top-full mt-1 left-0 bg-white border rounded-lg shadow-lg p-3 space-y-2 min-w-56 max-h-64 overflow-y-auto">
                <button className="text-xs text-gray-400 hover:text-gray-600 w-full text-left mb-1" onClick={() => setAgentFilter(new Set())}>Clear filter</button>
                {agents.map(agent => (
                  <div key={agent.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`agent-${agent.id}`}
                      checked={agentFilter.has(agent.user_email)}
                      onCheckedChange={() => setAgentFilter(prev => {
                        const next = new Set(prev);
                        next.has(agent.user_email) ? next.delete(agent.user_email) : next.add(agent.user_email);
                        return next;
                      })}
                    />
                    <label htmlFor={`agent-${agent.id}`} className="text-sm text-gray-700 cursor-pointer flex-1 truncate">{agent.full_name}</label>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {activeSection === "transaction" && (
          <>
            <Select value={dateRange} onValueChange={v => { setDateRange(v); setCustomStart(""); setCustomEnd(""); }}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
                <SelectItem value="ytd">Current Year (YTD)</SelectItem>
                <SelectItem value="last_year">Last Year</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            {dateRange === "custom" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="h-9 px-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
                <span className="text-gray-400 text-sm">—</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="h-9 px-2 text-sm border rounded-md focus:outline-none focus:ring-1 focus:ring-gray-300"
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg flex-wrap">
          <span className="text-sm font-medium text-blue-800">{selected.size} selected</span>
          {isAdmin && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500">Set file status:</span>
              <select
                className="text-xs border rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                value={bulkStatusPending}
                onChange={e => { setBulkStatusPending(e.target.value); setBulkStatusConfirm(false); }}
              >
                <option value="">— Change Status —</option>
                <option value="in_progress">In Progress</option>
                <option value="under_review">Request Review</option>
                <option value="missing_docs">Missing Docs</option>
                <option value="completed">Completed</option>
              </select>
              {bulkStatusPending && !bulkStatusConfirm && (
                <Button size="sm" className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-white gap-1"
                  onClick={() => setBulkStatusConfirm(true)}>
                  Apply to {selected.size}
                </Button>
              )}
              {bulkStatusConfirm && (
                <>
                  <span className="text-xs text-red-600 font-medium">Confirm update {selected.size} records?</span>
                  <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                    onClick={async () => {
                      const status = bulkStatusPending;
                      const ids = [...selected];
                      if (activeSection === "transaction") {
                        for (let i = 0; i < ids.length; i += 5) {
                          const batch = ids.slice(i, i + 5);
                          await Promise.all(batch.map(id => base44.entities.Transaction.update(id, { doc_vault_status: status })));
                        }
                        if (status === "completed") {
                          ids.forEach(id => {
                            const record = records.find(r => r.id === id);
                            if (record?.agent_email) base44.functions.invoke('sendDocVaultStatusEmail', { transaction: record, settings }).catch(() => {});
                          });
                        }
                      } else {
                        const allDocUpdates = ids.flatMap(id => {
                          const r = records.find(x => x.id === id);
                          return docs.filter(d => r && d.agent_email === r.user_email && d.doc_section === "office");
                        });
                        for (let i = 0; i < allDocUpdates.length; i += 5) {
                          const batch = allDocUpdates.slice(i, i + 5);
                          await Promise.all(batch.map(doc => base44.entities.Document.update(doc.id, { status })));
                        }
                      }
                      setTransactions(prev => prev.map(t => selected.has(t.id) ? { ...t, doc_vault_status: status } : t));
                      setSelected(new Set());
                      setBulkStatusPending("");
                      setBulkStatusConfirm(false);
                    }}>
                    Yes, Update
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs"
                    onClick={() => { setBulkStatusConfirm(false); setBulkStatusPending(""); }}>
                    Cancel
                  </Button>
                </>
              )}
            </div>
          )}
          <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 gap-1.5"
            onClick={() => setBulkDeleteDialog(true)}>
            <Trash2 className="w-4 h-4" /> Delete Selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {records.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No records found</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border bg-white overflow-hidden">
            {/* Sortable Header */}
            <div className="grid px-4 py-3 bg-gray-50 border-b gap-3" style={{ gridTemplateColumns: "32px 1fr 150px 130px 150px 40px 40px" }}>
              <div className="flex items-center">
                <Checkbox checked={records.length > 0 && selected.size === records.length} onCheckedChange={toggleAll} />
              </div>
              {activeSection === "transaction" ? (
                <>
                  <button className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-800 text-left" onClick={() => handleSort("property_address")}>
                    Property / Agent {sort.field === "property_address" ? (sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                  </button>
                  <button className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-800" onClick={() => handleSort("closing_date")}>
                    Closing Date {sort.field === "closing_date" ? (sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                  </button>
                  <button className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-800" onClick={() => handleSort("agent_name")}>
                    Agent {sort.field === "agent_name" ? (sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                  </button>
                </>
              ) : (
                <>
                  <button className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-800 text-left" onClick={() => handleSort("full_name")}>
                    Agent Name {sort.field === "full_name" ? (sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                  </button>
                  <button className="flex items-center gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-800" onClick={() => handleSort("user_email")}>
                    Email {sort.field === "user_email" ? (sort.dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-30" />}
                  </button>
                  <div />
                </>
              )}
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">File Status</div>
              <div />
              <div />
            </div>

            {paginated.map(record => {
              const id = record.id;
              const isOpen = expanded === id;
              const recordDocs = isAdmin
                ? (folderDocs[record.id] || [])
                : (activeSection === "office"
                    ? docs.filter(d => d.agent_email === record.user_email && d.doc_section === "office")
                    : docs.filter(d => d.transaction_id === record.id));
              const folderFileStatus = activeSection === "transaction"
                ? (record.doc_vault_status || "in_progress")
                : (recordDocs[0]?.status || "in_progress");
              const isTCRecord = !isAdmin && record.agent_email && user && record.agent_email !== user.email;
              const canModifyDocs = isAdmin || isTCRecord || folderFileStatus !== 'completed';

              const agentChecklist = settings?.agent_document_checklist || [];
              const fileTypeDocs = activeSection === "transaction" && record.file_type_name
                ? (settings?.document_file_types?.find(ft => ft.name === record.file_type_name)?.required_docs || [])
                : activeSection === "office" ? agentChecklist : [];
              const useFileTypeDocs = fileTypeDocs.length > 0;
              const requiredDocs = useFileTypeDocs ? fileTypeDocs : REQUIRED_DOCS[activeSection];
              const docsByCategory = useFileTypeDocs
                ? requiredDocs.reduce((acc, docName) => {
                    acc[docName] = recordDocs.find(d => d.name?.toLowerCase().includes(docName.toLowerCase()) || d.notes?.toLowerCase().includes(docName.toLowerCase())) || null;
                    return acc;
                  }, {})
                : requiredDocs.reduce((acc, cat) => {
                    acc[cat] = recordDocs.find(d => d.category === cat) || null;
                    return acc;
                  }, {});

              return (
                <div key={id}>
                  <div
                    onClick={() => handleExpand(record)}
                    className={`grid px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-gray-50 transition-colors items-center gap-3 ${isOpen ? "bg-blue-50/40" : ""} ${selected.has(id) ? "bg-blue-50" : ""}`}
                    style={{ gridTemplateColumns: "32px 1fr 150px 130px 150px 40px 40px" }}
                  >
                    <div onClick={e => e.stopPropagation()}>
                      <Checkbox checked={selected.has(id)} onCheckedChange={() => {}} onClick={e => toggleSelect(id, e)} />
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <FolderOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <div className="min-w-0">
                        {activeSection === "office" ? (
                          <p className="font-medium text-gray-900 truncate">{record.full_name}</p>
                        ) : (
                          <p className="font-medium text-gray-900 truncate text-sm">{record.property_address}</p>
                        )}
                      </div>
                    </div>
                    {activeSection === "transaction" ? (
                      <div className="text-sm text-gray-700">
                        {record.closing_date ? (() => { try { return format(new Date(record.closing_date), "MM/dd/yyyy"); } catch { return record.closing_date; } })() : <span className="text-gray-400">—</span>}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-500 truncate">{record.user_email || "—"}</div>
                    )}
                    <div className="text-sm text-gray-600 truncate">
                      {activeSection === "transaction" ? (record.agent_name || record.agent_email || "—") : ""}
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      {(() => {
                        const fileStatus = folderFileStatus;
                        const statusStyles = {
                          in_progress: "bg-slate-100 text-slate-700 border-slate-200",
                          under_review: "bg-blue-50 text-blue-700 border-blue-200",
                          missing_docs: "bg-orange-50 text-orange-700 border-orange-200",
                          completed: "bg-green-50 text-green-700 border-green-200",
                        };
                        const statusLabels = {
                          in_progress: "In Progress",
                          under_review: "Request Review",
                          missing_docs: "Missing Docs",
                          completed: "Completed",
                        };
                        if (isAdmin) {
                          return (
                            <select
                              value={fileStatus}
                              onChange={async e => {
                                const newStatus = e.target.value;
                                if (activeSection === "transaction") {
                                  await base44.entities.Transaction.update(record.id, { doc_vault_status: newStatus });
                                  setTransactions(prev => prev.map(t => t.id === record.id ? { ...t, doc_vault_status: newStatus } : t));
                                  if (newStatus === "completed" && record.agent_email) {
                                    base44.functions.invoke('sendDocVaultStatusEmail', { transaction: record, settings }).catch(() => {});
                                  }
                                } else {
                                  for (const doc of recordDocs) {
                                    await base44.entities.Document.update(doc.id, { status: newStatus });
                                  }
                                  await load();
                                }
                              }}
                              className={`text-xs rounded-md border px-2 py-1 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-300 w-full ${statusStyles[fileStatus] || "bg-gray-50 text-gray-600 border-gray-200"}`}
                            >
                              <option value="in_progress">In Progress</option>
                              <option value="under_review">Request Review</option>
                              <option value="missing_docs">Missing Docs</option>
                              <option value="completed">Completed</option>
                            </select>
                          );
                        }
                        if (!isAdmin && (fileStatus === "in_progress" || fileStatus === "missing_docs")) {
                          return (
                            <select
                              value={fileStatus}
                              onChange={async e => {
                                const newStatus = e.target.value;
                                if (activeSection === "transaction") {
                                  await base44.entities.Transaction.update(record.id, { doc_vault_status: newStatus });
                                  setTransactions(prev => prev.map(t => t.id === record.id ? { ...t, doc_vault_status: newStatus } : t));
                                } else {
                                  await Promise.all(recordDocs.map(doc => base44.entities.Document.update(doc.id, { status: newStatus })));
                                  await load();
                                }
                              }}
                              className={`text-xs rounded-md border px-2 py-1 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-300 w-full ${statusStyles[fileStatus] || "bg-gray-50 text-gray-600 border-gray-200"}`}
                            >
                              <option value="in_progress">In Progress</option>
                              <option value="missing_docs">Missing Docs</option>
                              <option value="under_review">Request Review</option>
                            </select>
                          );
                        }
                        return (
                          <span className={`text-xs px-2 py-1 rounded-md font-medium border ${statusStyles[fileStatus] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
                            {statusLabels[fileStatus] || fileStatus}
                          </span>
                        );
                      })()}
                    </div>
                    <div onClick={e => e.stopPropagation()}>
                      {recordDocs.length > 0 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-blue-500 hover:text-blue-700"
                          disabled={downloadingZip}
                          onClick={async e => {
                            e.stopPropagation();
                            setDownloadingZip(true);
                            const res = await base44.functions.invoke('downloadDocZip', { docs: recordDocs, transactions });
                            const { zip_base64 } = res.data;
                            const binary = atob(zip_base64);
                            const bytes = new Uint8Array(binary.length);
                            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                            const blob = new Blob([bytes], { type: 'application/zip' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${(record.property_address || record.full_name || 'documents').replace(/\s+/g, '_')}_files.zip`;
                            a.click();
                            URL.revokeObjectURL(url);
                            setDownloadingZip(false);
                          }}
                        >
                          {downloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        </Button>
                      )}
                    </div>
                    <div className="flex justify-end">
                      {isOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {isOpen && (() => {
                    if (loadingFolderIds.has(id)) return (
                      <div className="px-4 py-8 flex items-center justify-center bg-gray-50 border-b">
                        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                      </div>
                    );
                    const folderSel = folderSelectedDocs[id] || new Set();
                    const setFolderSel = (updater) => setFolderSelectedDocs(prev => {
                      const cur = prev[id] || new Set();
                      const next = typeof updater === 'function' ? updater(cur) : updater;
                      return { ...prev, [id]: next };
                    });
                    const folderChanges_ = folderChanges[id] || {};
                    const getEffectiveCategory = (doc) => folderChanges_[doc.id] || doc.category;
                    const handleDownloadZip = async (docsToDownload) => {
                      setDownloadingZip(true);
                      const res = await base44.functions.invoke('downloadDocZip', { docs: docsToDownload, transactions });
                      const { zip_base64 } = res.data;
                      const binary = atob(zip_base64);
                      const bytes = new Uint8Array(binary.length);
                      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                      const blob = new Blob([bytes], { type: 'application/zip' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${(record.property_address || record.full_name || 'documents').replace(/\s+/g, '_')}_files.zip`;
                      a.click();
                      URL.revokeObjectURL(url);
                      setDownloadingZip(false);
                    };
                    const handleDeleteSelected = () => {
                      if (folderSel.size === 0) return;
                      setFolderDeleteConfirm({ docIds: new Set(folderSel), count: folderSel.size });
                    };
                    return (
                      <div className="px-4 py-4 bg-gray-50 border-b last:border-0 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Documents</p>
                            {(() => {
                              const canEditFileType = folderFileStatus !== 'completed' && (isAdmin || folderFileStatus === 'in_progress');
                              if (canEditFileType && activeSection === "transaction") {
                                const fileTypeOptions = settings?.document_file_types?.length > 0 ? settings.document_file_types : [
                                  { name: "Listing Closing Checklist" }, { name: "Buyers Closing Checklist" },
                                  { name: "Terminated Listing Check List" }, { name: "Terminated Buyer Checklist" }
                                ];
                                return (
                                  <select
                                    value={record.file_type_name || ""}
                                    onClick={e => e.stopPropagation()}
                                    onChange={async e => {
                                      e.stopPropagation();
                                      await base44.entities.Transaction.update(record.id, { file_type_name: e.target.value });
                                      await load();
                                    }}
                                    className="text-xs text-purple-700 font-medium bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full cursor-pointer focus:outline-none focus:ring-1 focus:ring-purple-300"
                                  >
                                    <option value="">— Select File Type —</option>
                                    {fileTypeOptions.map(ft => <option key={ft.name} value={ft.name}>{ft.name}</option>)}
                                  </select>
                                );
                              }
                              return record.file_type_name ? (
                                <span className="text-xs text-purple-600 font-medium bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">{record.file_type_name}</span>
                              ) : null;
                            })()}
                          </div>
                          <div className="flex items-center gap-2">
                            {Object.keys(folderChanges[id] || {}).length > 0 && (
                              <Button
                                size="sm"
                                className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const changes = folderChanges[id];
                                  await Promise.all(
                                    Object.entries(changes).map(async ([docId, newCat]) => {
                                      const doc = recordDocs.find(d => d.id === docId);
                                      await base44.entities.Document.update(docId, { category: newCat });
                                      if (doc) {
                                        const txn = transactions.find(t => t.id === doc.transaction_id);
                                        await base44.entities.DocumentFeedback.create({
                                          document_name: doc.name,
                                          document_category: newCat,
                                          checklist_item: newCat?.replace(/_/g, ' '),
                                          file_type_name: txn?.file_type_name || doc.file_type_name,
                                          action: 'categorized',
                                          approved_by: user.email
                                        }).catch(() => {});
                                      }
                                    })
                                  );
                                  setFolderChanges(prev => ({ ...prev, [id]: {} }));
                                  await load();
                                }}
                              >
                                Save Changes
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {recordDocs.length > 0 && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1.5 text-blue-700 border-blue-300 hover:bg-blue-50"
                                onClick={e => { e.stopPropagation(); setFolderSel(folderSel.size === recordDocs.length ? new Set() : new Set(recordDocs.map(d => d.id))); }}
                              >
                                {folderSel.size === recordDocs.length ? 'Deselect All' : 'Select All'}
                              </Button>
                              {requiredDocs.length > 0 && (
                                <FolderAuditPanel
                                  recordId={id}
                                  recordDocs={recordDocs}
                                  requiredDocs={requiredDocs}
                                  useFileTypeDocs={useFileTypeDocs}
                                  onResults={results => setFolderAuditResults(prev => ({ ...prev, [id]: results }))}
                                  onReload={async () => {
                                    await load();
                                    if (isAdmin) {
                                      setFolderDocs(prev => { const n = {...prev}; delete n[id]; return n; });
                                      await loadFolderDocs(id, activeSection, record);
                                    }
                                  }}
                                />
                              )}
                              {folderSel.size > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1.5 text-red-600 border-red-300 hover:bg-red-50"
                                  onClick={e => { e.stopPropagation(); handleDeleteSelected(); }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Delete {folderSel.size}
                                </Button>
                              )}
                              <Button
                                size="sm"
                                className="h-7 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                                disabled={downloadingZip}
                                onClick={e => { e.stopPropagation(); handleDownloadZip(folderSel.size > 0 ? recordDocs.filter(d => folderSel.has(d.id)) : recordDocs); }}
                              >
                                {downloadingZip ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                {folderSel.size > 0 && folderSel.size < recordDocs.length ? `Download ${folderSel.size} as ZIP` : 'Download All as ZIP'}
                              </Button>
                            </>
                          )}
                          {isAdmin && recordDocs.length > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 text-green-700 border-green-300 hover:bg-green-50 h-7 text-xs"
                              onClick={async (e) => {
                                e.stopPropagation();
                                await Promise.all(recordDocs.map(doc => base44.entities.Document.update(doc.id, { file_status: 'approved' })));
                                await load();
                              }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" /> Approve All
                            </Button>
                          )}
                          {canModifyDocs && (
                            <div className="flex items-center gap-1.5">
                              {activeSection === 'transaction' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
                                  onClick={(e) => { e.stopPropagation(); setFolderSmartScanTxnId(record.id); setShowSmartScan(true); }}
                                >
                                  <Sparkles className="w-3 h-3" /> Smart File Upload
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={(e) => { e.stopPropagation(); openUpload(activeSection, activeSection === 'transaction' ? record.id : null, { lockedTransaction: true }); }}
                              >
                                + Add Doc
                              </Button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-2">
                          {requiredDocs.map(key => {
                            const doc = docsByCategory[key] || recordDocs.find(d => getEffectiveCategory(d) === key);
                            const label = useFileTypeDocs ? key : (categories.find(c => c.value === key)?.label || key.replace(/_/g, " "));
                            const statusCfg = FILE_STATUS_CONFIG[doc?.file_status || "pending"] || FILE_STATUS_CONFIG["pending"];
                            const isAiApproved = doc?.file_status === 'ai_approved';
                            return (
                              <div key={key} className={`flex items-center gap-3 p-2.5 rounded-lg border bg-white ${doc ? "border-green-200" : "border-gray-200"}`}>
                                {doc ? (
                                  <Checkbox
                                    checked={folderSel.has(doc.id)}
                                    onCheckedChange={() => setFolderSel(prev => { const n = new Set(prev); n.has(doc.id) ? n.delete(doc.id) : n.add(doc.id); return n; })}
                                    onClick={e => e.stopPropagation()}
                                  />
                                ) : (
                                  <Checkbox checked={false} disabled />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-700 font-medium truncate">{label}</p>
                                  {doc && doc.name !== label && <p className="text-xs text-gray-500 truncate mt-0.5">📄 {doc.name}</p>}
                                  {isAiApproved && <p className="text-xs text-blue-400 mt-0.5">AI matched — click status to change</p>}
                                </div>
                                {doc ? (
                                  <div className="flex items-center gap-2 min-w-fit">
                                    {isAiApproved && canModifyDocs ? (
                                      <>
                                        <Select value={key} onValueChange={async (newKey) => {
                                          await base44.entities.Document.update(doc.id, { category: newKey });
                                          if (isAdmin && doc.transaction_id) {
                                            const txnRec = transactions.find(t => t.id === doc.transaction_id);
                                            if (txnRec) await loadFolderDocs(doc.transaction_id, 'transaction', txnRec);
                                          }
                                          await load();
                                        }} onClick={e => e.stopPropagation()}>
                                          <SelectTrigger className="h-7 w-32 text-xs"><SelectValue placeholder="Move to..." /></SelectTrigger>
                                          <SelectContent>
                                            {requiredDocs.map(checklistKey => {
                                              const checklistLabel = useFileTypeDocs ? checklistKey : (categories.find(c => c.value === checklistKey)?.label || checklistKey.replace(/_/g, " "));
                                              return <SelectItem key={checklistKey} value={checklistKey}>{checklistLabel}</SelectItem>;
                                            })}
                                          </SelectContent>
                                        </Select>
                                        <select
                                          value={doc.file_status || "pending"}
                                          onChange={async e => { await base44.entities.Document.update(doc.id, { file_status: e.target.value }); await load(); }}
                                          onClick={e => e.stopPropagation()}
                                          className={`text-xs rounded-md border-0 px-2 py-1 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-300 ${statusCfg.className}`}
                                        >
                                          <option value="pending">Pending</option>
                                          <option value="ai_approved">AI Approved</option>
                                          <option value="approved">Approved</option>
                                          <option value="rejected">Rejected</option>
                                          <option value="needs_revision">Needs Revision</option>
                                        </select>
                                      </>
                                    ) : isAdmin ? (
                                      <>
                                        <select
                                          value={doc.file_status || "pending"}
                                          onChange={async e => { await base44.entities.Document.update(doc.id, { file_status: e.target.value }); await load(); }}
                                          onClick={e => e.stopPropagation()}
                                          className={`text-xs rounded-md border-0 px-2 py-1 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-300 ${statusCfg.className}`}
                                        >
                                          <option value="pending">Pending</option>
                                          <option value="ai_approved">AI Approved</option>
                                          <option value="approved">Approved</option>
                                          <option value="rejected">Rejected</option>
                                          <option value="needs_revision">Needs Revision</option>
                                        </select>
                                      </>
                                    ) : (
                                      <span className={`text-xs px-2 py-1 rounded-md font-medium ${statusCfg.className}`}>{statusCfg.label}</span>
                                    )}
                                    <a href={doc.file_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-700"><Eye className="w-4 h-4" /></Button>
                                    </a>
                                    {canModifyDocs && (
                                      <>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600" onClick={e => { e.stopPropagation(); setEditDoc(doc); setEditForm({ name: doc.name, notes: doc.notes || "", category: doc.category || "" }); }}>
                                          <Pencil className="w-3.5 h-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={e => { e.stopPropagation(); handleDelete(doc); }}>
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                        </>
                                        )}
                                        </div>
                                        ) : (
                                  canModifyDocs ? (
                                    <Button size="sm" variant="outline" className="text-xs h-7 flex-shrink-0"
                                      onClick={e => { e.stopPropagation(); openUpload(activeSection, activeSection === "transaction" ? record.id : null); }}>
                                      Add
                                    </Button>
                                  ) : <span className="text-xs text-gray-400">Locked</span>
                                )}
                              </div>
                            );
                          })}

                          {recordDocs.filter(d => {
                            const effectiveCat = getEffectiveCategory(d);
                            return !requiredDocs.includes(effectiveCat) && !Object.values(docsByCategory).includes(d);
                          }).map(doc => {
                            const statusCfg = FILE_STATUS_CONFIG[doc.file_status || 'pending'] || FILE_STATUS_CONFIG['pending'];
                            const changes = folderChanges[id] || {};
                            const docChangedCat = changes[doc.id];
                            return (
                              <div key={doc.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 bg-white">
                                <Checkbox
                                  checked={folderSel.has(doc.id)}
                                  onCheckedChange={() => setFolderSel(prev => { const n = new Set(prev); n.has(doc.id) ? n.delete(doc.id) : n.add(doc.id); return n; })}
                                  onClick={e => e.stopPropagation()}
                                />
                                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-700 font-medium truncate">{doc.name}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">{(docChangedCat || doc.category)?.replace(/_/g, ' ')}</p>
                                </div>
                                <Select value={docChangedCat || doc.category || ""} onValueChange={(newCat) => setFolderChanges(prev => ({ ...prev, [id]: { ...(prev[id] || {}), [doc.id]: newCat } }))} onClick={e => e.stopPropagation()}>
                                  <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Assign to..." /></SelectTrigger>
                                  <SelectContent>
                                    {requiredDocs.map(key => {
                                      const label = useFileTypeDocs ? key : (categories.find(c => c.value === key)?.label || key.replace(/_/g, " "));
                                      return <SelectItem key={key} value={key}>{label}</SelectItem>;
                                    })}
                                  </SelectContent>
                                </Select>
                                {isAdmin ? (
                                  <select
                                    value={doc.file_status || 'pending'}
                                    onChange={async e => { try { await base44.entities.Document.update(doc.id, { file_status: e.target.value }); await load(); } catch (err) { console.error('Status update failed:', err); } }}
                                    onClick={e => e.stopPropagation()}
                                    className={`text-xs rounded-md border-0 px-2 py-1 font-medium cursor-pointer focus:outline-none focus:ring-1 focus:ring-gray-300 ${statusCfg.className}`}
                                  >
                                    <option value="pending">Pending</option>
                                    <option value="ai_approved">AI Approved</option>
                                    <option value="approved">Approved</option>
                                    <option value="rejected">Rejected</option>
                                    <option value="needs_revision">Needs Revision</option>
                                  </select>
                                ) : (
                                  <span className={`text-xs px-2 py-1 rounded-md font-medium whitespace-nowrap ${statusCfg.className}`}>{statusCfg.label}</span>
                                )}
                                <a href={doc.file_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-700"><Eye className="w-4 h-4" /></Button>
                                </a>
                                {canModifyDocs && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-gray-600" onClick={e => { e.stopPropagation(); setEditDoc(doc); setEditForm({ name: doc.name, notes: doc.notes || '', category: doc.category || '' }); }}>
                                      <Pencil className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-400 hover:text-red-600" onClick={e => { e.stopPropagation(); handleDelete(doc); }}>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 bg-white border rounded-lg">
              <p className="text-sm text-gray-600">{records.length} total · Page {page} of {totalPages}</p>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                  <Button
                    key={pageNum}
                    size="sm"
                    variant={page === pageNum ? "default" : "outline"}
                    onClick={() => setPage(pageNum)}
                    className="w-8 h-8 p-0 flex items-center justify-center"
                  >
                    {pageNum}
                  </Button>
                ))}
                <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Document Dialog */}
      <Dialog open={!!editDoc} onOpenChange={open => !open && setEditDoc(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Document Name *</Label>
              <Input className="mt-1.5" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Document Type / Category</Label>
              <Select value={editForm.category || ""} onValueChange={v => setEditForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  {(editDoc?.doc_section === "office" ? OFFICE_CATEGORIES : TRANSACTION_CATEGORIES).map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input className="mt-1.5" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDoc(null)}>Cancel</Button>
            <Button onClick={handleEditSave} disabled={editSaving || !editForm.name}>
              {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Upload {form.doc_section === "office" ? "Office Document" : "Transaction File"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 overflow-y-auto flex-1 pr-1">
            {form.doc_section === "office" && isAdmin && (
              <div>
                <Label>Agent Name *</Label>
                <Select value={form.office_agent_email || ""} onValueChange={v => setForm(f => ({ ...f, office_agent_email: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select agent..." /></SelectTrigger>
                  <SelectContent>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.user_email}>{a.full_name} · {a.user_email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.doc_section === "transaction" && (
              <>
                <div>
                  <Label>Transaction *</Label>
                  {form.lockedTransaction && form.transaction_id ? (
                    <div className="mt-1.5 px-3 py-2 bg-gray-50 border rounded-md text-sm text-gray-700 font-medium">
                      {transactions.find(t => t.id === form.transaction_id)?.property_address || form.transaction_id}
                    </div>
                  ) : (
                    <TransactionSearchSelect
                      transactions={transactions}
                      docs={docs}
                      value={form.transaction_id}
                      onChange={v => {
                        const txn = transactions.find(t => t.id === v);
                        setForm(f => ({ ...f, transaction_id: v, agent_name: txn?.agent_name || f.agent_name, file_type_name: f.lockFileType && txn?.file_type_name ? txn.file_type_name : (txn?.file_type_name || f.file_type_name) }));
                      }}
                      onNewTransaction={handleCreateNewTransaction}
                      isCreatingTransaction={creatingTransaction}
                    />
                  )}
                </div>
                <div>
                  <Label>Agent Name *</Label>
                  <div className="relative mt-1.5">
                    <Input
                      placeholder="Start typing agent name..."
                      value={form.agent_name}
                      onChange={e => !form.transaction_id && setForm(f => ({ ...f, agent_name: e.target.value }))}
                      onFocus={() => !form.transaction_id && setShowAgentList(true)}
                      disabled={!!form.transaction_id}
                      className="mt-0"
                    />
                    {showAgentList && form.agent_name && !form.transaction_id && (
                      <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                        {agents
                          .filter(a => a.full_name?.toLowerCase().includes(form.agent_name.toLowerCase()))
                          .map(agent => (
                            <button
                              key={agent.id}
                              type="button"
                              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors border-b last:border-0"
                              onClick={() => {
                                setForm(f => ({ ...f, agent_name: agent.full_name }));
                                setShowAgentList(false);
                              }}
                            >
                              <p className="text-sm font-medium text-gray-900">{agent.full_name}</p>
                              <p className="text-xs text-gray-400">{agent.user_email}</p>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
            <div className="relative">
              <Label>Document Name *</Label>
              {(() => {
                const txn = transactions.find(t => t.id === form.transaction_id);
                const fileTypeName = form.file_type_name || txn?.file_type_name;
                const checklistItems = fileTypeName
                  ? (settings?.document_file_types?.find(ft => ft.name === fileTypeName)?.required_docs || [])
                  : [];
                const filtered = checklistItems.filter(item => !form.name || item.toLowerCase().includes(form.name.toLowerCase()));
                return checklistItems.length > 0 ? (
                  <div className="relative mt-1.5">
                    <Input
                      value={form.name}
                      onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setNameDropOpen(true); }}
                      onFocus={() => setNameDropOpen(true)}
                      onBlur={() => setTimeout(() => setNameDropOpen(false), 150)}
                      placeholder="Type or select from checklist..."
                      className="h-8 text-sm"
                    />
                    {nameDropOpen && filtered.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border rounded-md shadow-md max-h-36 overflow-y-auto">
                        {filtered.map((item, i) => (
                          <button
                            key={i}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 border-b last:border-0 truncate"
                            onMouseDown={() => { setForm(f => ({ ...f, name: item })); setNameDropOpen(false); }}
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <Input className="mt-1.5 h-8 text-sm" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                );
              })()}
            </div>
            <div>
              <Label>Document Type</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Auto-detect from document" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                  {categories.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.doc_section === "transaction" && !form.transaction_id && (
              <div>
                <Label>Transaction Type</Label>
                <Select value={form.transaction_type || ""} onValueChange={v => setForm(f => ({ ...f, transaction_type: v }))}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="buyer">Buyer Side</SelectItem>
                    <SelectItem value="seller">Seller Side</SelectItem>
                    <SelectItem value="both">Both Sides</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {form.doc_section === "transaction" && (
              <>
                <div>
                  <Label>File Type</Label>
                  {(() => {
                    const fileTypeOptions = (settings?.document_file_types?.length > 0
                      ? settings.document_file_types
                      : [
                          { name: "Listing Closing Checklist" },
                          { name: "Buyers Closing Checklist" },
                          { name: "Terminated Listing Check List" },
                          { name: "Terminated Buyer Checklist" },
                        ]
                    ).filter(ft => !form.terminatedOnly || ft.name.toLowerCase().includes("terminated"));
                    return (
                      <div className="relative mt-1.5">
                        <Input
                          list="file-type-options"
                          value={form.file_type_name || ""}
                          onChange={e => !form.lockFileType && setForm(f => ({ ...f, file_type_name: e.target.value }))}
                          disabled={form.lockFileType}
                          placeholder="Type or select file type..."
                          className="h-8 text-sm"
                        />
                        <datalist id="file-type-options">
                          {fileTypeOptions.map(ft => <option key={ft.name} value={ft.name} />)}
                        </datalist>
                      </div>
                    );
                  })()}
                  {form.lockFileType && form.file_type_name && (
                    <p className="text-xs text-gray-400 mt-1">File type is set by the existing transaction and cannot be changed.</p>
                  )}
                </div>
              </>
            )}
            <div>
              <Label>File Status</Label>
              <Select value={form.file_status || "pending"} onValueChange={v => setForm(f => ({ ...f, file_status: v }))}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="ai_approved">AI Approved</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="needs_revision">Needs Revision</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Input className="mt-1.5" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div>
              <Label>File *</Label>
              <label
                className={`mt-1.5 flex items-center gap-3 p-3 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                  file
                    ? "border-green-400 bg-green-50"
                    : "border-gray-200 hover:border-gray-400 hover:bg-gray-50"
                }`}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-blue-400", "bg-blue-50"); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-blue-400", "bg-blue-50"); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove("border-blue-400", "bg-blue-50");
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              >
                {analyzing ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" /> : <Upload className="w-4 h-4 text-gray-400" />}
                <span className="text-sm text-gray-500">
                  {analyzing ? "AI is analyzing your document..." : file ? file.name : "Click or drag and drop file"}
                </span>
                <input type="file" className="hidden" accept=".txt,.doc,.docx,.xls,.xlsx,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }} />
              </label>
              {analyzing && <p className="text-xs text-blue-500 mt-1">Fields will be auto-populated once analysis is complete.</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || analyzing || !file || !form.name || (form.doc_section === "transaction" && (!form.transaction_id || !form.agent_name)) || (form.doc_section === "office" && isAdmin && !form.office_agent_email)}>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteDialog} onOpenChange={open => { if (!open) { setBulkDeleteDialog(false); setBulkDeleteOptions({ accounting: false, commission: false }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete {selected.size} Record{selected.size !== 1 ? "s" : ""}</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <p className="text-sm text-red-600">
              Permanently delete <strong>{selected.size}</strong> selected record{selected.size !== 1 ? "s" : ""} and all their associated documents? This cannot be undone.
            </p>
            {activeSection === "transaction" && (
              <>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Also delete associated records:</p>
                <div className="space-y-2 p-3 bg-gray-50 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Checkbox id="bulkDelCommission" checked={bulkDeleteOptions.commission} onCheckedChange={v => setBulkDeleteOptions(o => ({ ...o, commission: !!v }))} />
                    <label htmlFor="bulkDelCommission" className="text-sm text-gray-700 cursor-pointer">Commission entry (Commissions tab)</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Checkbox id="bulkDelAccounting" checked={bulkDeleteOptions.accounting} onCheckedChange={v => setBulkDeleteOptions(o => ({ ...o, accounting: !!v }))} />
                    <label htmlFor="bulkDelAccounting" className="text-sm text-gray-700 cursor-pointer">Accounting entries linked to this transaction</label>
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setBulkDeleteDialog(false); setBulkDeleteOptions({ accounting: false, commission: false }); }}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : `Delete ${selected.size} Record${selected.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Delete Dialog */}
      <Dialog open={!!docDeleteDialog} onOpenChange={open => { if (!open) { setDocDeleteDialog(null); setDocDeleteOptions({ commission: false, accounting: false }); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Document</DialogTitle></DialogHeader>
          <div className="py-2">
            <p className="text-sm text-red-600">Permanently delete <strong>{docDeleteDialog?.doc?.name}</strong>? This cannot be undone.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDocDeleteDialog(null); setDocDeleteOptions({ commission: false, accounting: false }); }}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={confirmDocDelete} disabled={docDeleting}>
              {docDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Folder Doc Delete Confirmation Dialog */}
      <Dialog open={!!folderDeleteConfirm} onOpenChange={open => { if (!open) setFolderDeleteConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete Documents</DialogTitle></DialogHeader>
          <p className="text-sm text-red-600 py-2">
            Permanently delete <strong>{folderDeleteConfirm?.count}</strong> selected document{folderDeleteConfirm?.count !== 1 ? 's' : ''}? This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDeleteConfirm(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={async () => {
              const { docIds } = folderDeleteConfirm;
              setFolderDeleteConfirm(null);
              for (const docId of docIds) {
                await base44.entities.Document.delete(docId);
              }
              setFolderSelectedDocs({});
              await load();
            }}>
              Delete {folderDeleteConfirm?.count} Document{folderDeleteConfirm?.count !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CDA Creation Prompt Dialog */}
      <Dialog open={showCDAPrompt} onOpenChange={setShowCDAPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Commission Record?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 py-2">
            A new transaction "{newTransactionForCDA?.property_address}" was created. Would you also like to create a corresponding CDA (Commission Disbursement Authorization) for commission tracking?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCDAPrompt(false); setNewTransactionForCDA(null); }}>
              Skip for Now
            </Button>
            <Button onClick={handleCreateCDA}>
              Yes, Create CDA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Type Dialog */}
      <Dialog open={showUploadTypeDialog} onOpenChange={setShowUploadTypeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Upload Transaction Document</DialogTitle></DialogHeader>
          <div className="py-2 space-y-3">
            <button
              className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all"
              onClick={() => { setShowUploadTypeDialog(false); openUpload("transaction"); }}
            >
              <p className="font-semibold text-gray-900">Standard Upload</p>
              <p className="text-xs text-gray-500 mt-0.5">Upload a single document to a transaction</p>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadTypeDialog(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SmartScanUpload
        open={showSmartScan}
        onClose={() => { setShowSmartScan(false); setFolderSmartScanTxnId(null); }}
        transactions={transactions}
        docs={docs}
        settings={settings}
        user={user}
        initialTransactionId={folderSmartScanTxnId}
        onUploaded={load}
      />

      <AgentSmartScanUpload
        open={showAgentSmartScan}
        onClose={() => setShowAgentSmartScan(false)}
        agents={agents}
        docs={docs}
        user={user}
        onUploaded={load}
      />
    </div>
  );
}