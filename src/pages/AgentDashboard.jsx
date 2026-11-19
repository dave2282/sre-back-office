import { useState, useEffect } from "react";
import { useCardLayout } from "@/hooks/useCardLayout";
import CardCustomizerButton from "@/components/dashboard/CardCustomizerButton";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, TrendingUp, Clock, PlusCircle, ArrowRight, Download, FolderOpen, Users, Home, AlertCircle, MessageSquare, Send, Loader2, Eye, X } from "lucide-react";
import * as XLSX from "xlsx";
import { format, subMonths, subDays } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const statusColors = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  correction_needed: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  paid: "bg-emerald-100 text-emerald-700",
};

export default function AgentDashboard() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [agentProfile, setAgentProfile] = useState(null);
  const [accountingEntries, setAccountingEntries] = useState([]);
  const [agentDocs, setAgentDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(() => localStorage.getItem("agentDash_dateRange") || "ytd");
  const [customStart, setCustomStart] = useState(() => localStorage.getItem("agentDash_customStart") || "");
  const [customEnd, setCustomEnd] = useState(() => localStorage.getItem("agentDash_customEnd") || "");
  const [communityPosts, setCommunityPosts] = useState([]);
  const [newPost, setNewPost] = useState("");
  const [posting, setPosting] = useState(false);
  const [previewingAgent, setPreviewingAgent] = useState(null);

  const AGENT_DEFAULT_CARDS = [
    { id: "stat_total_sales", label: "Stat: Total Sales", visible: true },
    { id: "stat_pending_cdas", label: "Stat: Pending CDAs", visible: true },
    { id: "stat_total_revenue", label: "Stat: Total Revenue", visible: true },
    { id: "stat_outstanding", label: "Stat: Outstanding Balance", visible: true },
    { id: "doc_vault", label: "Document Vault Stats", visible: true },
    { id: "doc_files", label: "My Document Files", visible: true },
    { id: "recent_txns", label: "Recent Transactions", visible: true },
    { id: "community", label: "Agent Talk / Community", visible: true },
  ];
  const { cards: layoutCards, setCards: setLayoutCards, visibleCards } = useCardLayout("agent_dashboard", AGENT_DEFAULT_CARDS);

  useEffect(() => { localStorage.setItem("agentDash_dateRange", dateRange); }, [dateRange]);
  useEffect(() => { localStorage.setItem("agentDash_customStart", customStart); }, [customStart]);
  useEffect(() => { localStorage.setItem("agentDash_customEnd", customEnd); }, [customEnd]);
  const isVisible = (id) => visibleCards.some(c => c.id === id);

  useEffect(() => {
    const load = async () => {
      const me = await base44.auth.me();
      setUser(me);
      // Check if admin is previewing an agent's portal
      const adminViewingRaw = localStorage.getItem("adminViewingAgent");
      const adminViewing = adminViewingRaw ? JSON.parse(adminViewingRaw) : null;
      const targetEmail = (adminViewing && (me.role === "admin" || me.role === "staff")) ? adminViewing.email : me.email;
      if (adminViewing && (me.role === "admin" || me.role === "staff")) {
        setPreviewingAgent(adminViewing);
      }
      // Split into 2 batches to avoid rate limiting
      const [txns, agents, entries] = await Promise.all([
        base44.entities.Transaction.filter({ agent_email: targetEmail }, "-created_date", 50),
        base44.entities.Agent.filter({ user_email: targetEmail }),
        base44.entities.AccountingEntry.filter({ agent_email: targetEmail }),
      ]);
      const [allDocs, posts] = await Promise.all([
        base44.entities.Document.filter({ agent_email: targetEmail }, "-created_date", 200),
        base44.entities.CommunityPost.list("-created_date", 10),
      ]);
      setTransactions(txns || []);
      setAgentProfile(agents?.[0] || null);
      setAccountingEntries(entries || []);
      setAgentDocs(allDocs || []);
      const sorted = [...(posts || [])].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.created_date) - new Date(a.created_date);
      });
      setCommunityPosts(sorted);
      setLoading(false);
    };
    load();
  }, []);

  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    // Transactions sheet
    const txRows = transactions.map(t => ({
      "Property Address": t.property_address || "",
      "Closing Date": t.closing_date || "",
      "Working With": t.working_with || "",
      "Sale Price": t.sale_price || 0,
      "Total Commission": t.total_commission_amount || 0,
      "Agent Gross Comm.": t.agent_gross_commission || 0,
      "Office Gross Comm.": t.company_gross_commission || 0,
      "Agent Net Comm.": t.agent_net_commission || 0,
      "Referral Fees": t.total_referral_amount || 0,
      "Status": t.status || "",
      "Buyer": t.buyer_name || "",
      "Seller": t.seller_name || "",
      "Title Company": t.title_company_name || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), "Transactions");

    // Accounting entries sheet
    const entryRows = accountingEntries.map(e => ({
      "Property Address": e.property_address || "",
      "Closing Date": e.closing_date || "",
      "Transaction Type": e.transaction_type || "",
      "Sale Price": e.sale_price || 0,
      "Agent Gross Comm.": e.agent_gross_commission || 0,
      "Office Gross Comm.": e.company_gross_commission || 0,
      "Agent Net Comm.": e.agent_net_commission || 0,
      "Referral Fee": e.referral_fee_amount || 0,
      "Status": e.status || "",
      "Office Paid": e.office_payment_received ? "Yes" : "No",
      "Notes": e.notes || "",
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entryRows), "Accounting Entries");

    XLSX.writeFile(wb, `${user?.full_name || "Agent"}_Report_${new Date().getFullYear()}.xlsx`);
  };

  const now = new Date();
  const getRangeStart = () => {
    const year = now.getFullYear();
    switch (dateRange) {
      case "ytd": return new Date(year, 0, 1);
      case "current_year": return new Date(year, 0, 1);
      case "prior_year": return new Date(year - 1, 0, 1);
      case "12months": return subMonths(now, 12);
      case "30days": return subDays(now, 30);
      case "7days": return subDays(now, 7);
      case "custom": return customStart ? new Date(customStart) : null;
      case "all": return null;
      default: return new Date(year, 0, 1);
    }
  };
  const getRangeEnd = () => {
    if (dateRange === "current_year") return new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    if (dateRange === "prior_year") return new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
    if (dateRange === "custom") return customEnd ? new Date(customEnd + "T23:59:59") : null;
    return null;
  };

  const rangeStart = getRangeStart();
  const rangeEnd = getRangeEnd();

  const inRange = (e) => {
    const d = e.closing_date ? new Date(e.closing_date) : new Date(e.created_date);
    if (rangeStart && d < rangeStart) return false;
    if (rangeEnd && d >= rangeEnd) return false;
    return true;
  };

  const filteredEntries = accountingEntries.filter(e =>
    (e.status === "paid" || e.status === "approved" || e.office_payment_received) && inRange(e)
  );

  // Also include approved/paid transactions that don't yet have an accounting entry
  const accountedTxnIds = new Set(accountingEntries.map(e => e.transaction_id).filter(Boolean));
  const filteredTxns = transactions.filter(t =>
    (t.status === "approved" || t.status === "paid") &&
    !accountedTxnIds.has(t.id) &&
    inRange(t)
  );

  const ytdGross =
    filteredEntries.reduce((sum, e) => sum + (e.agent_gross_commission || 0), 0) +
    filteredTxns.reduce((sum, t) => sum + (t.agent_gross_commission || 0), 0);
  const pendingCount = transactions.filter(t => ["submitted", "correction_needed"].includes(t.status)).length;
  const totalClosed = filteredEntries.length + filteredTxns.length;

  // Total Sales breakdown: count all non-draft transactions in range by working_with
  const calcSales = (items, getType) => {
    let buyer = 0, seller = 0;
    items.forEach(item => {
      const t = (getType(item) || "").toLowerCase();
      if (t.includes("both")) { buyer += 0.5; seller += 0.5; }
      else if (t.includes("buyer")) buyer += 1;
      else if (t.includes("seller")) seller += 1;
    });
    return { buyer, seller, total: buyer + seller };
  };

  // All non-draft transactions in the selected date range
  const allTxnsInRange = transactions.filter(t =>
    t.status !== "draft" && inRange(t)
  );
  const totalSales = calcSales(allTxnsInRange, t => t.working_with);

  const outstandingEntries = accountingEntries.filter(e => e.status === "pending" || e.status === "approved");
  // Also include submitted/approved/paid transactions not yet in accounting
  const outstandingTxns = transactions.filter(t =>
    ["submitted", "approved"].includes(t.status) && !accountedTxnIds.has(t.id)
  );
  const outstandingTotal =
    outstandingEntries.reduce((sum, e) => sum + (e.company_gross_commission || 0), 0) +
    outstandingTxns.reduce((sum, t) => sum + (t.company_gross_commission || 0), 0);
  const totalRevenue =
    accountingEntries.filter(inRange).reduce((sum, e) => sum + (e.agent_net_commission || 0), 0) +
    transactions.filter(t => !accountedTxnIds.has(t.id) && inRange(t)).reduce((sum, t) => sum + (t.agent_net_commission || 0), 0);

  // Document Vault stats — only show docs belonging to this agent's own transactions
  const myTxnIds = new Set(transactions.map(t => t.id));
  const txnDocs = agentDocs.filter(d => d.transaction_id && myTxnIds.has(d.transaction_id));
  const uniqueTxnIds = [...new Set(txnDocs.map(d => d.transaction_id))];
  const totalDocFiles = uniqueTxnIds.length;
  const closedFiles = uniqueTxnIds.filter(txnId => {
    const docsForTxn = txnDocs.filter(d => d.transaction_id === txnId);
    // closed = all docs in this file have file_status "approved", or the transaction-level status is "completed"
    return docsForTxn.some(d => d.status === "completed") || docsForTxn.every(d => d.file_status === "approved");
  }).length;
  const buyerFiles = uniqueTxnIds.filter(txnId =>
    txnDocs.some(d => d.transaction_id === txnId && d.transaction_type === "buyer")
  ).length;
  const sellerFiles = uniqueTxnIds.filter(txnId =>
    txnDocs.some(d => d.transaction_id === txnId && d.transaction_type === "seller")
  ).length;
  const pendingDocFiles = uniqueTxnIds.filter(txnId => {
    const docsForTxn = txnDocs.filter(d => d.transaction_id === txnId);
    return docsForTxn.some(d => d.file_status === "pending" || d.file_status === "needs_revision" || d.file_status === "rejected");
  }).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Admin Preview Banner */}
      {previewingAgent && (
        <div className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-xl">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-800">Viewing portal as: <strong>{previewingAgent.name}</strong> ({previewingAgent.email})</span>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 border-purple-300 text-purple-700 hover:bg-purple-100" onClick={() => { localStorage.removeItem("adminViewingAgent"); window.location.href = "/AgentRoster"; }}>
            <X className="w-3.5 h-3.5" /> Exit Preview
          </Button>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome back, {user?.full_name?.split(" ")[0] || "Agent"}
          </h1>
          <p className="text-gray-500 text-sm mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex gap-2 items-center">
          <CardCustomizerButton cards={layoutCards} setCards={setLayoutCards} defaultCards={AGENT_DEFAULT_CARDS} />
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="current_year">Current Year ({now.getFullYear()})</SelectItem>
              <SelectItem value="prior_year">Prior Year ({now.getFullYear() - 1})</SelectItem>
              <SelectItem value="ytd">Year to Date</SelectItem>
              <SelectItem value="12months">Last 12 Months</SelectItem>
              <SelectItem value="30days">Last 30 Days</SelectItem>
              <SelectItem value="7days">Last 7 Days</SelectItem>
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
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" /> Export Excel
          </Button>
          <Link to="/SubmitCDA">
            <Button className="gap-2">
              <PlusCircle className="w-4 h-4" />
              Submit CDA
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      {["stat_total_sales","stat_pending_cdas","stat_total_revenue","stat_outstanding"].some(isVisible) && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {isVisible("stat_total_sales") && <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Sales</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalSales.total % 1 === 0 ? totalSales.total : totalSales.total.toFixed(1)}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-blue-600 font-medium">B: {totalSales.buyer % 1 === 0 ? totalSales.buyer : totalSales.buyer.toFixed(1)}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-purple-600 font-medium">S: {totalSales.seller % 1 === 0 ? totalSales.seller : totalSales.seller.toFixed(1)}</span>
                </div>
              </div>
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center"><Home className="w-5 h-5 text-indigo-600" /></div>
            </div>
          </CardContent>
        </Card>}
        {isVisible("stat_pending_cdas") && <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending CDAs</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{pendingCount}</p>
              </div>
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center"><Clock className="w-5 h-5 text-orange-600" /></div>
            </div>
          </CardContent>
        </Card>}
        {isVisible("stat_total_revenue") && <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Revenue Generated</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">${totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-gray-400 mt-0.5">Selected period · net commission</p>
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><TrendingUp className="w-5 h-5 text-green-600" /></div>
            </div>
          </CardContent>
        </Card>}
        {isVisible("stat_outstanding") && <Card className="border-amber-200">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Outstanding Balance</p>
                <p className="text-2xl font-bold text-amber-600 mt-1">${outstandingTotal.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-gray-400 mt-0.5">{outstandingEntries.length} pending / approved</p>
              </div>
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center"><Clock className="w-5 h-5 text-amber-600" /></div>
            </div>
          </CardContent>
        </Card>}
      </div>
      )}

      {/* Document Vault Stats */}
      {isVisible("doc_vault") && (
      <div>
        <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Document Vault</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Closed Files</p><p className="text-2xl font-bold text-green-700 mt-1">{closedFiles}</p><p className="text-xs text-gray-400 mt-0.5">of {totalDocFiles} total files</p></div><div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center"><FolderOpen className="w-5 h-5 text-green-600" /></div></div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Buyer Files</p><p className="text-2xl font-bold text-blue-700 mt-1">{buyerFiles}</p><p className="text-xs text-gray-400 mt-0.5">Buyer side transactions</p></div><div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center"><Users className="w-5 h-5 text-blue-600" /></div></div></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Seller Files</p><p className="text-2xl font-bold text-purple-700 mt-1">{sellerFiles}</p><p className="text-xs text-gray-400 mt-0.5">Seller side transactions</p></div><div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center"><Home className="w-5 h-5 text-purple-600" /></div></div></CardContent></Card>
          <Card className={pendingDocFiles > 0 ? "border-orange-200" : ""}><CardContent className="p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-gray-500">Needs Attention</p><p className={`text-2xl font-bold mt-1 ${pendingDocFiles > 0 ? "text-orange-600" : "text-gray-900"}`}>{pendingDocFiles}</p><p className="text-xs text-gray-400 mt-0.5">Files with non-approved docs</p></div><div className={`w-10 h-10 rounded-xl flex items-center justify-center ${pendingDocFiles > 0 ? "bg-orange-100" : "bg-gray-100"}`}><AlertCircle className={`w-5 h-5 ${pendingDocFiles > 0 ? "text-orange-600" : "text-gray-400"}`} /></div></div></CardContent></Card>
        </div>
      </div>
      )}

      {/* Document Vault Transaction Files */}
      {isVisible("doc_files") && uniqueTxnIds.length > 0 && (
        <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Recent Transactions</CardTitle>
          <Link to="/MyTransactions">
            <Button variant="ghost" size="sm" className="gap-1 text-sm">
              View All <ArrowRight className="w-3 h-3" />
            </Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No transactions yet</p>
              <Link to="/SubmitCDA">
                <Button size="sm" className="mt-3">Submit Your First CDA</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              {transactions.slice(0, 5).map(t => (
                <div key={t.id} className="flex items-center justify-between px-6 py-3 hover:bg-gray-50 gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm text-gray-900">{t.property_address}</p>
                    <p className="text-xs text-gray-400">
                      {t.closing_date ? format(new Date(t.closing_date), "MMM d, yyyy") : "—"}
                    </p>
                  </div>
                  <div onClick={e => e.stopPropagation()}>
                    <Select
                      value={t.working_with || ""}
                      onValueChange={async (val) => {
                        await base44.entities.Transaction.update(t.id, { working_with: val });
                        setTransactions(prev => prev.map(tx => tx.id === t.id ? { ...tx, working_with: val } : tx));
                      }}
                    >
                      <SelectTrigger className="w-28 h-7 text-xs">
                        <SelectValue placeholder="Type..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Buyer">Buyer</SelectItem>
                        <SelectItem value="Seller">Seller</SelectItem>
                        <SelectItem value="Both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-semibold text-sm text-gray-900">
                      ${(t.agent_gross_commission || 0).toLocaleString()}
                    </p>
                    <Badge className={`text-xs mt-1 ${statusColors[t.status]}`}>
                      {t.status?.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Community Board */}
      {isVisible("community") && (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2"><MessageSquare className="w-4 h-4" />Agent Talk</CardTitle>
          <Link to="/Community"><Button variant="ghost" size="sm" className="gap-1 text-sm">View All <ArrowRight className="w-3 h-3" /></Button></Link>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <input className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-gray-300" placeholder="Share something with the team..." value={newPost} onChange={e => setNewPost(e.target.value)} onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleCommunityPost()} />
            <Button size="sm" onClick={handleCommunityPost} disabled={posting || !newPost.trim()} className="gap-1.5">
              {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Post
            </Button>
          </div>
          {communityPosts.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No posts yet. Be the first!</p>
          ) : (
            <div className="space-y-2">
              {communityPosts.slice(0, 5).map(post => (
                <div key={post.id} className={`p-3 rounded-lg border ${post.pinned ? "border-amber-300 bg-amber-50/30" : "bg-gray-50"}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-xs text-gray-900">{post.author_name || "Agent"}</span>
                    <span className="text-xs text-gray-400">{post.created_date ? format(new Date(post.created_date), "MMM d, h:mm a") : ""}</span>
                    {post.pinned && <span className="text-xs text-amber-600 font-medium">📌 Pinned</span>}
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-line">{post.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Correction Needed Alert */}
      {transactions.some(t => t.status === "correction_needed") && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="font-semibold text-orange-800">Action Required</p>
              <p className="text-sm text-orange-600">{transactions.filter(t => t.status === "correction_needed").length} CDA(s) need corrections</p>
            </div>
            <Link to="/MyTransactions"><Button size="sm" variant="outline" className="border-orange-300 text-orange-700">Review</Button></Link>
          </CardContent>
        </Card>
      )}
    </div>
  );

  async function handleCommunityPost() {
    if (!newPost.trim()) return;
    setPosting(true);
    await base44.entities.CommunityPost.create({
      author_name: user?.full_name || "Agent",
      author_email: user?.email,
      content: newPost.trim(),
      category: "general",
      pinned: false,
    });
    setNewPost("");
    const posts = await base44.entities.CommunityPost.list("-created_date", 10);
    const sorted = [...(posts || [])].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.created_date) - new Date(a.created_date);
    });
    setCommunityPosts(sorted);
    setPosting(false);
  }
}