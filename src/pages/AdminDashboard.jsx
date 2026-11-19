import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useCardLayout } from "@/hooks/useCardLayout";
import CardCustomizerButton from "@/components/dashboard/CardCustomizerButton";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Users, FileText, Clock, TrendingUp, ArrowRight, AlertCircle, AlertTriangle, Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState as useLocalState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { format, subMonths, startOfYear, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";

const statusColors = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  correction_needed: "bg-orange-100 text-orange-700",
  approved: "bg-green-100 text-green-700",
  paid: "bg-emerald-100 text-emerald-700",
};

function getDateRange(period, customStart, customEnd) {
  const now = new Date();
  const year = now.getFullYear();
  if (period === "ytd") return { start: startOfYear(now), end: now };
  if (period === "current_year") return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59) };
  if (period === "prior_year") return { start: new Date(year - 1, 0, 1), end: new Date(year - 1, 11, 31, 23, 59, 59) };
  if (period === "12months") return { start: subMonths(now, 12), end: now };
  if (period === "30days") return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now };
  if (period === "7days") return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
  if (period === "all") return { start: new Date(0), end: now };
  if (period === "custom" && customStart && customEnd) {
    const [sy, sm, sd] = customStart.split("-").map(Number);
    const [ey, em, ed] = customEnd.split("-").map(Number);
    return { start: new Date(sy, sm - 1, sd), end: new Date(ey, em - 1, ed, 23, 59, 59) };
  }
  return { start: startOfYear(now), end: now };
}

function buildChartData(accountingEntries, period, customStart, customEnd) {
  const { start, end } = getDateRange(period, customStart, customEnd);
  const months = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push(new Date(cur));
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }
  return months.map(m => {
  const label = format(m, "MMM yy");
  const mStart = startOfMonth(m);
  const mEnd = endOfMonth(m);
  const inMonth = accountingEntries.filter(e => {
    const isCountable = e.status === "paid" || e.status === "approved" || e.office_payment_received;
    if (!isCountable || !e.closing_date) return false;
    try {
      const [y, mo, d] = e.closing_date.substring(0, 10).split("-").map(Number);
      return isWithinInterval(new Date(y, mo - 1, d), { start: mStart, end: mEnd });
    } catch { return false; }
  });
  const officeFees = inMonth
    .filter(e => e.transaction_type !== "desk_fee" && e.transaction_type !== "misc_income")
    .reduce((s, e) => s + (e.company_gross_commission || 0), 0);
  const deskFees = inMonth
    .filter(e => e.transaction_type === "desk_fee")
    .reduce((s, e) => s + (e.company_gross_commission || 0), 0);
  const miscIncome = inMonth
    .filter(e => e.transaction_type === "misc_income")
    .reduce((s, e) => s + (e.company_gross_commission || 0), 0);
  return { month: label, officeFees: Math.round(officeFees), deskFees: Math.round(deskFees), miscIncome: Math.round(miscIncome) };
  });
}

const DEFAULT_SECTIONS = [
  { id: "stat_cards", label: "Statistics Row", visible: true },
  { id: "revenue_chart", label: "Revenue Chart", visible: true },
  { id: "income_sources", label: "Top Income Sources", visible: true },
  { id: "recent_cdas", label: "Recent CDAs", visible: true },
  { id: "agent_rankings", label: "Agent Rankings", visible: true },
  { id: "team_rankings", label: "Team Rankings", visible: true },
  { id: "referral_rankings", label: "Referral / Split Rankings", visible: true },
];

const BACKUP_ACK_KEY = "backup_reminder_ack";
const LAST_BACKUP_KEY = "brokerage_last_backup";

const ADMIN_DEFAULT_CARDS = [
  { id: "stat_sales_volume", label: "Stat: Sales Volume", visible: true },
  { id: "stat_total_sales", label: "Stat: Total Sales", visible: true },
  { id: "stat_agents", label: "Stat: Agents", visible: true },
  { id: "stat_pending", label: "Stat: Pending Actions", visible: true },
  { id: "stat_office_fees", label: "Stat: Office Fees Collected", visible: true },
  { id: "revenue_chart", label: "Revenue Breakdown Chart", visible: true },
  { id: "income_sources", label: "Top Income Sources", visible: true },
  { id: "recent_cdas", label: "Recent CDAs", visible: true },
  { id: "agent_rankings", label: "Agent Rankings", visible: true },
  { id: "team_rankings", label: "Team Rankings", visible: true },
  { id: "referral_rankings", label: "Referral / Split Rankings", visible: true },
];

function useBackupReminder() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const now = new Date();
      // Check acknowledgment timestamp
      const ackTime = localStorage.getItem(BACKUP_ACK_KEY);
      if (ackTime) {
        const ackDate = new Date(ackTime);
        const diffDays = (now - ackDate) / (1000 * 60 * 60 * 24);
        if (diffDays < 30) { setShow(false); return; }
      }
      // Check actual backup timestamp
      const backupData = localStorage.getItem(LAST_BACKUP_KEY);
      if (backupData) {
        try {
          const parsed = JSON.parse(backupData);
          if (parsed.dateStamp) {
            const backupDate = new Date(parsed.dateStamp);
            const diffDays = (now - backupDate) / (1000 * 60 * 60 * 24);
            if (diffDays < 30) { setShow(false); return; }
          }
        } catch {}
      }
      // Show if no recent ack or backup
      setShow(true);
    } catch { setShow(true); }
  }, []);
  const acknowledge = () => {
    localStorage.setItem(BACKUP_ACK_KEY, new Date().toISOString());
    setShow(false);
  };
  return { show, acknowledge };
}

export default function AdminDashboard() {
  const [transactions, setTransactions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(() => localStorage.getItem("adminDash_period") || "ytd");
  const [customStart, setCustomStart] = useState(() => localStorage.getItem("adminDash_customStart") || "");
  const [customEnd, setCustomEnd] = useState(() => localStorage.getItem("adminDash_customEnd") || "");
  const { show: showBackupReminder, acknowledge: ackBackup } = useBackupReminder();

  const [settings, setSettings] = useState(null);
  const [accountingEntries, setAccountingEntries] = useState([]);

  useEffect(() => { localStorage.setItem("adminDash_period", period); }, [period]);
  useEffect(() => { localStorage.setItem("adminDash_customStart", customStart); }, [customStart]);
  useEffect(() => { localStorage.setItem("adminDash_customEnd", customEnd); }, [customEnd]);

  useEffect(() => {
    const loadData = async () => {
      // Split into 2 batches to avoid rate limiting
      const [txns, ags] = await Promise.all([
        base44.entities.Transaction.list("-created_date", 200),
        base44.entities.Agent.list("-created_date", 200),
      ]);
      setTransactions(txns || []);
      setAgents(ags || []);

      const [sets, entries] = await Promise.all([
        base44.entities.BrokerageSettings.list(),
        base44.entities.AccountingEntry.list("-closing_date", 500),
      ]);
      if (sets?.length > 0) setSettings(sets[0]);
      setAccountingEntries(entries || []);
      setLoading(false);
    };
    loadData();
  }, []);

  const { start, end } = getDateRange(period, customStart, customEnd);

  // Revenue from AccountingEntries with status=approved or paid within range
  const inRange = accountingEntries.filter(e => {
    if (e.status !== "approved" && e.status !== "paid" && !e.office_payment_received) return false;
    const dateStr = e.closing_date;
    if (!dateStr) return false;
    try {
      // Parse date-only strings as local time to avoid UTC offset issues
      const [y, m, d] = dateStr.substring(0, 10).split("-").map(Number);
      const localDate = new Date(y, m - 1, d);
      return isWithinInterval(localDate, { start, end });
    } catch { return false; }
  });

  const cdaRevenue = inRange.reduce((sum, e) => sum + (e.company_gross_commission || 0), 0);
  const ytdAgentFees = inRange.reduce((sum, e) => sum + (e.agent_gross_commission || 0), 0);
  const totalSalesVolume = inRange.reduce((sum, e) => sum + (e.sale_price || 0), 0);
  const officeFeesCollected = accountingEntries.filter(e => e.office_payment_received).reduce((sum, e) => sum + (e.company_gross_commission || 0), 0);

  // Total Sales breakdown — count all non-draft transactions in range using working_with
  const allTxnsInRange = transactions.filter(t => {
    if (t.status === "draft") return false;
    if (period === "all") return true;
    const dateStr = t.closing_date;
    if (!dateStr) return false;
    try {
      const [y, m, d] = dateStr.substring(0, 10).split("-").map(Number);
      return isWithinInterval(new Date(y, m - 1, d), { start, end });
    } catch { return false; }
  });

  const calcAdminSales = (items, getType) => {
    let buyer = 0, seller = 0;
    items.forEach(item => {
      const t = (getType(item) || "").toLowerCase();
      if (t.includes("both")) { buyer += 0.5; seller += 0.5; }
      else if (t.includes("buyer")) buyer += 1;
      else if (t.includes("seller")) seller += 1;
    });
    return { buyer, seller, total: buyer + seller };
  };
  const adminSales = calcAdminSales(allTxnsInRange, t => t.working_with);

  // Monthly plan income: flat fee × active agents (annualized over range months)
  const activeAgentsList = agents.filter(a => a.status === "active");
  const flatFee = settings?.flat_fee_enabled ? (settings?.flat_fee_amount || 0) : 0;
  const rangeMonths = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24 * 30)));
  const planIncome = flatFee * activeAgentsList.length * rangeMonths;

  const ytdRevenue = cdaRevenue + planIncome;
  const pendingApproval = transactions.filter(t => t.status === "submitted").length;
  const needsCorrection = transactions.filter(t => t.status === "correction_needed").length;
  const activeAgents = activeAgentsList.length;

  const chartData = buildChartData(accountingEntries, period, customStart, customEnd);
  const { cards: sectionCards, setCards: setSectionCards, visibleCards } = useCardLayout("admin_dashboard", ADMIN_DEFAULT_CARDS);
  const isVisible = (id) => visibleCards.some(c => c.id === id);

  const periodLabel = period === "all" ? "All Time" : period === "current_year" ? `${new Date().getFullYear()}` : period === "prior_year" ? `${new Date().getFullYear() - 1}` : period === "ytd" ? "YTD" : period === "12months" ? "Last 12 Months" : period === "30days" ? "Last 30 Days" : period === "7days" ? "Last 7 Days" : "Custom Range";

  if (loading) return <div className="flex items-center justify-center h-full p-12"><div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        {/* Period selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <CardCustomizerButton cards={sectionCards} setCards={setSectionCards} defaultCards={ADMIN_DEFAULT_CARDS} />
          <Select value={period} onValueChange={setPeriod}>
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
          {period === "custom" && (
            <>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-gray-500">From</Label>
                <Input type="date" className="w-36 h-9 text-sm" value={customStart} onChange={e => setCustomStart(e.target.value)} />
              </div>
              <div className="flex items-center gap-1">
                <Label className="text-xs text-gray-500">To</Label>
                <Input type="date" className="w-36 h-9 text-sm" value={customEnd} onChange={e => setCustomEnd(e.target.value)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Monthly Backup Reminder */}
      {showBackupReminder && (
        <div className="flex items-start gap-4 p-4 bg-amber-50 border border-amber-300 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">Monthly Backup Reminder</p>
            <p className="text-sm text-amber-800 mt-0.5">
              It's been over 30 days since your last backup reminder. Head to Brokerage Settings to download a full data backup.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <RouterLink to="/BrokerageSettings">
              <Button size="sm" variant="outline" className="border-amber-400 text-amber-800 hover:bg-amber-100">
                Go to Backup
              </Button>
            </RouterLink>
            <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white" onClick={ackBackup}>
              Acknowledged
            </Button>
          </div>
        </div>
      )}

      {/* Alerts */}
       {(pendingApproval > 0 || needsCorrection > 0) && (
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {pendingApproval > 0 && (
            <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-semibold text-blue-800">{pendingApproval} CDAs Pending Approval</p>
                  <p className="text-sm text-blue-600">Waiting for your review</p>
                </div>
              </div>
              <Link to="/Commissions?status=submitted"><Button size="sm">Review</Button></Link>
            </div>
          )}
          {needsCorrection > 0 && (
            <div className="flex items-center justify-between p-4 bg-orange-50 border border-orange-200 rounded-xl">
              <div className="flex items-center gap-3">
                <AlertCircle className="w-5 h-5 text-orange-600" />
                <div>
                  <p className="font-semibold text-orange-800">{needsCorrection} CDAs Need Correction</p>
                  <p className="text-sm text-orange-600">Awaiting agent response</p>
                </div>
              </div>
              <Link to="/AllTransactions"><Button size="sm" variant="outline">View</Button></Link>
            </div>
          )}
        </div>
      )}

      {/* Stats */}
      {["stat_sales_volume","stat_total_sales","stat_agents","stat_pending","stat_office_fees"].some(isVisible) && (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {isVisible("stat_sales_volume") && <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{periodLabel} Sales Volume</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">${totalSalesVolume.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-gray-400 mt-0.5">{inRange.length} transaction{inRange.length !== 1 ? "s" : ""}</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>}
        {isVisible("stat_total_sales") && <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{periodLabel} Total Sales</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{adminSales.total % 1 === 0 ? adminSales.total : adminSales.total.toFixed(1)}</p>
                <div className="flex gap-2 mt-1">
                  <span className="text-xs text-blue-600 font-medium">B: {adminSales.buyer % 1 === 0 ? adminSales.buyer : adminSales.buyer.toFixed(1)}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-purple-600 font-medium">S: {adminSales.seller % 1 === 0 ? adminSales.seller : adminSales.seller.toFixed(1)}</span>
                </div>
              </div>
              <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </CardContent>
        </Card>}
        {isVisible("stat_agents") && <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Agents</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{agents.filter(a => a.status !== "inactive").length}</p>
              </div>
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Users className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>}
        {isVisible("stat_pending") && <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pending Actions</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{pendingApproval + needsCorrection}</p>
              </div>
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>}
        {isVisible("stat_office_fees") && <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Office Fees Collected</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">${officeFeesCollected.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-gray-400 mt-0.5">All time · paid</p>
              </div>
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>}
      </div>
      )}

      {/* Dynamic Sections */}
      {(() => {
        const sectionMap = {
          revenue_chart: (
            <Card key="revenue_chart">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue Breakdown — {periodLabel}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} barCategoryGap="30%">
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v, name) => [`$${v.toLocaleString()}`, name === "officeFees" ? "Office Commission" : name === "deskFees" ? "Desk Fees" : "Misc Income"]} />
                    <Legend formatter={v => v === "officeFees" ? "Office Commission" : v === "deskFees" ? "Desk Fees" : "Misc Income"} />
                    <Bar dataKey="officeFees" fill="#1e3a5f" radius={[3, 3, 0, 0]} name="officeFees" />
                    <Bar dataKey="deskFees" fill="#c9a84c" radius={[3, 3, 0, 0]} name="deskFees" />
                    <Bar dataKey="miscIncome" fill="#7c3aed" radius={[3, 3, 0, 0]} name="miscIncome" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ),
          income_sources: <TopIncomeSources key="income_sources" accountingEntries={inRange} />,
          recent_cdas: (
            <Card key="recent_cdas">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base">Recent CDAs</CardTitle>
                <Link to="/AllTransactions"><Button variant="ghost" size="sm" className="gap-1 text-xs">All <ArrowRight className="w-3 h-3" /></Button></Link>
              </CardHeader>
              <CardContent className="p-0">
                {transactions.slice(0, 6).map(t => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 border-b last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 truncate">{t.property_address}</p>
                      <p className="text-xs text-gray-400">{t.agent_name || t.agent_email?.split("@")[0]}</p>
                    </div>
                    <Badge className={`text-xs ml-2 flex-shrink-0 ${statusColors[t.status]}`}>{t.status?.replace(/_/g, " ")}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          ),
          agent_rankings: <AgentRankings key="agent_rankings" accountingEntries={inRange} period={periodLabel} agents={agents} transactions={allTxnsInRange} />,
          team_rankings: <TeamRankings key="team_rankings" accountingEntries={inRange} period={periodLabel} agents={agents} transactions={allTxnsInRange} />,
          referral_rankings: <ReferralRankings key="referral_rankings" transactions={allTxnsInRange} agents={agents} period={periodLabel} />,
        };
        const orderedVisible = visibleCards.filter(c => c.id !== "stat_cards" && sectionMap[c.id]);
        const rows = [];
        let i = 0;
        while (i < orderedVisible.length) {
          const a = orderedVisible[i];
          const b = orderedVisible[i + 1];
          rows.push(
            <div key={`row-${i}`} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {sectionMap[a.id]}
              {b && sectionMap[b.id]}
            </div>
          );
          i += b ? 2 : 1;
        }
        return rows;
      })()}

    </div>
  );
}

const INCOME_COLORS = ["#1e3a5f", "#c9a84c", "#7c3aed", "#059669", "#dc2626"];

function TopIncomeSources({ accountingEntries }) {
  const sourceMap = {};
  accountingEntries.forEach(e => {
    const key = e.category || "Uncategorized";
    sourceMap[key] = (sourceMap[key] || 0) + (e.company_gross_commission || 0);
  });
  const data = Object.entries(sourceMap)
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Top 5 Office Income Sources</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No income data for this period.</p>
        ) : (
          <div className="space-y-3">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                  {data.map((_, i) => <Cell key={i} fill={INCOME_COLORS[i % INCOME_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={v => `$${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {data.map((d, i) => (
                <div key={d.name} className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: INCOME_COLORS[i % INCOME_COLORS.length] }} />
                  <p className="text-sm text-gray-700 flex-1 truncate">{d.name}</p>
                  <p className="text-sm font-semibold text-gray-900">${d.value.toLocaleString()}</p>
                  <p className="text-xs text-gray-400 w-10 text-right">{total > 0 ? Math.round((d.value / total) * 100) : 0}%</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TeamRankings({ accountingEntries, period, agents = [], transactions = [] }) {
  const [showAll, setShowAll] = useLocalState(false);
  const [selectedTeam, setSelectedTeam] = useLocalState(null);

  // Build agent→team map
  const agentTeamMap = {};
  agents.forEach(a => {
    if (a.full_name && a.team) agentTeamMap[a.full_name.toLowerCase()] = a.team;
    if (a.user_email && a.team) agentTeamMap[a.user_email.toLowerCase()] = a.team;
  });

  const teamMap = {};
  const ensureTeam = (team) => {
    if (!teamMap[team]) teamMap[team] = { name: team, volume: 0, agentCommission: 0, officeCommission: 0, agentNet: 0, count: 0, agentNames: new Set() };
  };

  accountingEntries.forEach(e => {
    const agentKey = (e.agent_name || e.agent_email || "").toLowerCase();
    const team = agentTeamMap[agentKey];
    if (!team) return;
    ensureTeam(team);
    teamMap[team].volume += e.sale_price || 0;
    teamMap[team].agentCommission += e.agent_gross_commission || 0;
    teamMap[team].officeCommission += e.company_gross_commission || 0;
    teamMap[team].agentNet += e.agent_net_commission || 0;
    teamMap[team].count += 1;
    if (e.agent_name) teamMap[team].agentNames.add(e.agent_name);
  });

  const ranked = Object.values(teamMap)
    .map(t => ({ ...t, agentNames: [...t.agentNames] }))
    .sort((a, b) => b.agentCommission - a.agentCommission);

  if (ranked.length === 0) return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4 text-green-500" />Team Rankings — {period}</CardTitle>
      </CardHeader>
      <CardContent><p className="text-sm text-gray-400 text-center py-8">No team data available. Assign teams to agents in the Agent Roster.</p></CardContent>
    </Card>
  );

  const displayed = showAll ? ranked : ranked.slice(0, 10);
  const maxCommission = ranked[0]?.agentCommission || 1;
  const medalColors = ["text-yellow-500", "text-gray-400", "text-amber-600"];

  const teamDeals = selectedTeam
    ? accountingEntries.filter(e => {
        const agentKey = (e.agent_name || e.agent_email || "").toLowerCase();
        return agentTeamMap[agentKey] === selectedTeam.name;
      }).sort((a, b) => (b.closing_date || "").localeCompare(a.closing_date || ""))
    : [];

  const teamTotals = teamDeals.reduce((acc, e) => ({
    volume: acc.volume + (e.sale_price || 0),
    gross: acc.gross + (e.agent_gross_commission || 0),
    net: acc.net + (e.agent_net_commission || 0),
    office: acc.office + (e.company_gross_commission || 0),
  }), { volume: 0, gross: 0, net: 0, office: 0 });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-green-500" />
            Team Rankings — {period}
          </CardTitle>
          <span className="text-xs text-gray-400">{ranked.length} team{ranked.length !== 1 ? "s" : ""}</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {displayed.map((team, i) => (
              <div
                key={team.name}
                className="flex items-center gap-4 px-6 py-3 hover:bg-green-50 cursor-pointer transition-colors"
                onClick={() => setSelectedTeam(team)}
              >
                <div className={`w-7 text-center font-bold text-sm flex-shrink-0 ${i < 3 ? medalColors[i] : "text-gray-400"}`}>
                  {i < 3 ? ["🥇", "🥈", "🥉"][i] : `#${i + 1}`}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{team.name}</p>
                  <p className="text-xs text-gray-400 truncate">{team.agentNames.slice(0, 3).join(", ")}{team.agentNames.length > 3 ? ` +${team.agentNames.length - 3} more` : ""}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-1.5 rounded-full bg-green-500" style={{ width: `${Math.round((team.agentCommission / maxCommission) * 100)}%` }} />
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">${team.agentCommission.toLocaleString("en-US", { maximumFractionDigits: 0 })} agent comm.</p>
                  <p className="text-xs text-green-600">${team.officeCommission.toLocaleString("en-US", { maximumFractionDigits: 0 })} office · {team.count} deal{team.count !== 1 ? "s" : ""}</p>
                  <p className="text-xs text-gray-400">${team.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })} vol.</p>
                </div>
              </div>
            ))}
          </div>
          {ranked.length > 10 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-green-600 hover:bg-green-50 transition-colors border-t font-medium"
            >
              {showAll ? <><ChevronUp className="w-4 h-4" /> Show Top 10</> : <><ChevronDown className="w-4 h-4" /> Show All {ranked.length} Teams</>}
            </button>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedTeam} onOpenChange={open => !open && setSelectedTeam(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-green-500" />
              {selectedTeam?.name} — Team Breakdown
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
            {[
              { label: "Deals", value: teamDeals.length, color: "text-gray-900" },
              { label: "Sales Volume", value: `$${teamTotals.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "text-blue-700" },
              { label: "Agent Gross Comm.", value: `$${teamTotals.gross.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "text-green-700" },
              { label: "Office Comm.", value: `$${teamTotals.office.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "text-purple-700" },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 border rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
          {teamDeals.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No deals found for this team.</p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Property</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Closing</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Sale Price</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent Gross</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent Net</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Office</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {teamDeals.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5"><p className="font-medium text-gray-900 truncate max-w-[140px]">{e.property_address}</p></td>
                      <td className="px-4 py-2.5 text-gray-600 truncate max-w-[100px]">{e.agent_name || e.agent_email || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-600">{e.closing_date || "—"}</td>
                      <td className="px-4 py-2.5 text-right text-gray-800">${(e.sale_price || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-green-700">${(e.agent_gross_commission || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">${(e.agent_net_commission || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2.5 text-right text-purple-700">${(e.company_gross_commission || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t font-semibold">
                    <td className="px-4 py-2.5 text-xs text-gray-500 uppercase" colSpan={3}>Totals</td>
                    <td className="px-4 py-2.5 text-right text-gray-900">${teamTotals.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2.5 text-right text-green-700">${teamTotals.gross.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">${teamTotals.net.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2.5 text-right text-purple-700">${teamTotals.office.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReferralRankings({ transactions, agents, period }) {
  const [showAll, setShowAll] = useLocalState(false);

  const agentNameMap = {};
  agents.forEach(a => {
    if (!a.full_name) return;
    agentNameMap[a.full_name.toLowerCase()] = a.full_name;
    if (a.company) agentNameMap[a.company.toLowerCase()] = a.full_name;
    (a.companies || []).forEach(c => { if (c) agentNameMap[c.toLowerCase()] = a.full_name; });
  });

  const refMap = {};
  transactions.forEach(t => {
    [[t.referral_1_name, t.referral_1_amount], [t.referral_2_name, t.referral_2_amount],
     [t.referral_3_name, t.referral_3_amount], [t.referral_4_name, t.referral_4_amount]].forEach(([name, amount]) => {
      if (!name || !amount) return;
      const key = agentNameMap[name.toLowerCase()] || name;
      if (!refMap[key]) refMap[key] = { name: key, total: 0, count: 0 };
      refMap[key].total += amount || 0;
      refMap[key].count += 1;
    });
  });

  const ranked = Object.values(refMap).sort((a, b) => b.total - a.total);
  if (ranked.length === 0) return null;

  const displayed = showAll ? ranked : ranked.slice(0, 10);
  const maxTotal = ranked[0]?.total || 1;
  const medalColors = ["text-yellow-500", "text-gray-400", "text-amber-600"];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-purple-500" />
          Referral / Split Income Rankings — {period}
        </CardTitle>
        <span className="text-xs text-gray-400">{ranked.length} recipient{ranked.length !== 1 ? "s" : ""}</span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {displayed.map((agent, i) => (
            <div key={agent.name} className="flex items-center gap-4 px-6 py-3">
              <div className={`w-7 text-center font-bold text-sm flex-shrink-0 ${i < 3 ? medalColors[i] : "text-gray-400"}`}>
                {i < 3 ? ["🥇", "🥈", "🥉"][i] : `#${i + 1}`}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate">{agent.name}</p>
                <div className="flex items-center gap-3 mt-1">
                  <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                    <div className="h-1.5 rounded-full bg-purple-500" style={{ width: `${Math.round((agent.total / maxTotal) * 100)}%` }} />
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-purple-700">${agent.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-gray-400">{agent.count} referral{agent.count !== 1 ? "s" : ""}</p>
              </div>
            </div>
          ))}
        </div>
        {ranked.length > 10 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full flex items-center justify-center gap-2 py-3 text-sm text-purple-600 hover:bg-purple-50 transition-colors border-t font-medium"
          >
            {showAll ? <><ChevronUp className="w-4 h-4" /> Show Top 10</> : <><ChevronDown className="w-4 h-4" /> Show All {ranked.length} Recipients</>}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function AgentRankings({ accountingEntries, period, agents = [], transactions = [] }) {
  const [showAll, setShowAll] = useLocalState(false);
  const [selectedAgent, setSelectedAgent] = useLocalState(null);

  const agentNameMap = {};
  agents.forEach(a => {
    const canonical = a.full_name;
    if (!canonical) return;
    agentNameMap[canonical.toLowerCase()] = canonical;
    if (a.company) agentNameMap[a.company.toLowerCase()] = canonical;
    (a.companies || []).forEach(c => { if (c) agentNameMap[c.toLowerCase()] = canonical; });
  });

  const resolveAgentName = (name) => {
    if (!name) return null;
    return agentNameMap[name.toLowerCase()] || null;
  };

  // Build email→canonical name map so agent_email entries merge with agent_name entries
  const agentEmailMap = {};
  agents.forEach(a => {
    if (a.user_email && a.full_name) agentEmailMap[a.user_email.toLowerCase()] = a.full_name;
  });

  const agentMap = {};
  const ensureAgent = (key) => {
    if (!agentMap[key]) agentMap[key] = { name: key, volume: 0, commission: 0, referral: 0, count: 0 };
  };

  const resolveCanonical = (name, email) => {
    if (name) {
      const fromName = agentNameMap[name.toLowerCase()];
      if (fromName) return fromName;
    }
    if (email) {
      const fromEmail = agentEmailMap[email.toLowerCase()];
      if (fromEmail) return fromEmail;
    }
    return name || email || "Unknown";
  };

  accountingEntries.forEach(e => {
    const key = resolveCanonical(e.agent_name, e.agent_email);
    ensureAgent(key);
    agentMap[key].volume += e.sale_price || 0;
    agentMap[key].commission += e.agent_gross_commission || 0;
    agentMap[key].count += 1;
  });

  transactions.forEach(t => {
    [[t.referral_1_name, t.referral_1_amount], [t.referral_2_name, t.referral_2_amount],
     [t.referral_3_name, t.referral_3_amount], [t.referral_4_name, t.referral_4_amount]].forEach(([name, amount]) => {
      if (!name || !amount) return;
      const resolved = resolveAgentName(name);
      if (resolved) {
        ensureAgent(resolved);
        agentMap[resolved].referral += amount || 0;
      }
    });
  });

  const ranked = Object.values(agentMap)
    .map(a => ({ ...a, total: a.commission + a.referral }))
    .sort((a, b) => b.total - a.total);
  const displayed = showAll ? ranked : ranked.slice(0, 10);
  const maxCommission = ranked[0]?.total || 1;
  const medalColors = ["text-yellow-500", "text-gray-400", "text-amber-600"];

  const agentDeals = selectedAgent
    ? accountingEntries
        .filter(e => resolveCanonical(e.agent_name, e.agent_email) === selectedAgent.name)
        .sort((a, b) => (b.closing_date || "").localeCompare(a.closing_date || ""))
    : [];

  const agentTotals = agentDeals.reduce((acc, e) => ({
    volume: acc.volume + (e.sale_price || 0),
    gross: acc.gross + (e.agent_gross_commission || 0),
    net: acc.net + (e.agent_net_commission || 0),
    office: acc.office + (e.company_gross_commission || 0),
  }), { volume: 0, gross: 0, net: 0, office: 0 });

  if (ranked.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            Agent Rankings — {period}
          </CardTitle>
          <span className="text-xs text-gray-400">{ranked.length} agent{ranked.length !== 1 ? "s" : ""}</span>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {displayed.map((agent, i) => (
              <div
                key={agent.name}
                className="flex items-center gap-4 px-6 py-3 hover:bg-blue-50 cursor-pointer transition-colors"
                onClick={() => setSelectedAgent(agent)}
              >
                <div className={`w-7 text-center font-bold text-sm flex-shrink-0 ${i < 3 ? medalColors[i] : "text-gray-400"}`}>
                  {i < 3 ? ["🥇", "🥈", "🥉"][i] : `#${i + 1}`}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{agent.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-blue-500"
                        style={{ width: `${Math.round((agent.total / maxCommission) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">Total: ${agent.total.toLocaleString("en-US", { maximumFractionDigits: 0 })}</p>
                  <p className="text-xs text-blue-600">Comm: ${agent.commission.toLocaleString("en-US", { maximumFractionDigits: 0 })}{agent.referral > 0 && <span className="text-purple-600 ml-1">· Ref/Split: ${agent.referral.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>}</p>
                  <p className="text-xs text-gray-400">{agent.count} sale{agent.count !== 1 ? "s" : ""} · ${agent.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })} vol.</p>
                </div>
              </div>
            ))}
          </div>
          {ranked.length > 10 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full flex items-center justify-center gap-2 py-3 text-sm text-blue-600 hover:bg-blue-50 transition-colors border-t font-medium"
            >
              {showAll ? <><ChevronUp className="w-4 h-4" /> Show Top 10</> : <><ChevronDown className="w-4 h-4" /> Show All {ranked.length} Agents</>}
            </button>
          )}
        </CardContent>
      </Card>

      {/* Agent Deal Breakdown Dialog */}
      <Dialog open={!!selectedAgent} onOpenChange={open => !open && setSelectedAgent(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              {selectedAgent?.name} — Deal Breakdown
            </DialogTitle>
          </DialogHeader>

          {/* Summary Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
            {[
              { label: "Deals", value: agentDeals.length, color: "text-gray-900" },
              { label: "Sales Volume", value: `$${agentTotals.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "text-blue-700" },
              { label: "Agent Gross Comm.", value: `$${agentTotals.gross.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "text-green-700" },
              { label: "Office Comm.", value: `$${agentTotals.office.toLocaleString("en-US", { maximumFractionDigits: 0 })}`, color: "text-purple-700" },
            ].map(s => (
              <div key={s.label} className="bg-gray-50 border rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Deals Table */}
          {agentDeals.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No deals found for this agent.</p>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Property</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Closing Date</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Sale Price</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent Gross</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Agent Net</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Office Comm.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {agentDeals.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-900 truncate max-w-[180px]">{e.property_address}</p>
                        {e.category && <p className="text-xs text-purple-600">{e.category}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{e.closing_date || "—"}</td>
                      <td className="px-4 py-2.5 text-right text-gray-800">${(e.sale_price || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-green-700">${(e.agent_gross_commission || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">${(e.agent_net_commission || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2.5 text-right text-purple-700">${(e.company_gross_commission || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 border-t font-semibold">
                    <td className="px-4 py-2.5 text-xs text-gray-500 uppercase" colSpan={2}>Totals</td>
                    <td className="px-4 py-2.5 text-right text-gray-900">${agentTotals.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2.5 text-right text-green-700">${agentTotals.gross.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">${agentTotals.net.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                    <td className="px-4 py-2.5 text-right text-purple-700">${agentTotals.office.toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Referral Breakdown */}
          {(() => {
            const agentNames = new Set();
            if (selectedAgent?.name) agentNames.add(selectedAgent.name.toLowerCase());
            // Cross-reference LLC / company names from agent profiles
            agents.forEach(a => {
              if (a.full_name && a.full_name === selectedAgent?.name) {
                if (a.company) agentNames.add(a.company.toLowerCase());
                (a.companies || []).forEach(c => { if (c) agentNames.add(c.toLowerCase()); });
              }
            });
            // Also cross-reference LLC names from commission_check_payable_to on matching transactions
            transactions.forEach(t => {
              if (
                (t.agent_name && agentNames.has(t.agent_name.toLowerCase())) ||
                (t.agent_email && selectedAgent?.name && t.agent_name === selectedAgent.name)
              ) {
                if (t.commission_check_payable_to) agentNames.add(t.commission_check_payable_to.toLowerCase());
              }
            });
            const referralRows = [];
            transactions.forEach(t => {
              [[t.referral_1_name, t.referral_1_amount],
               [t.referral_2_name, t.referral_2_amount],
               [t.referral_3_name, t.referral_3_amount],
               [t.referral_4_name, t.referral_4_amount]].forEach(([name, amount]) => {
                if (!name || !amount) return;
                if (agentNames.has(name.toLowerCase())) {
                  referralRows.push({ property: t.property_address, closingDate: t.closing_date, fromAgent: t.agent_name || t.agent_email, amount });
                }
              });
            });
            if (referralRows.length === 0) return null;
            const totalReferral = referralRows.reduce((s, r) => s + (r.amount || 0), 0);
            return (
              <div className="mt-4">
                <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  Referral / Split Income
                  <span className="text-xs font-normal text-purple-600 bg-purple-50 border border-purple-200 rounded px-2 py-0.5">Total: ${totalReferral.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                </p>
                <div className="rounded-lg border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-purple-50 border-b">
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Property</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Closing Date</th>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">From Agent</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Referral Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {referralRows.map((r, i) => (
                        <tr key={i} className="hover:bg-purple-50/40">
                          <td className="px-4 py-2 text-gray-900 font-medium truncate max-w-[180px]">{r.property}</td>
                          <td className="px-4 py-2 text-gray-600">{r.closingDate || "—"}</td>
                          <td className="px-4 py-2 text-gray-700">{r.fromAgent || "—"}</td>
                          <td className="px-4 py-2 text-right font-semibold text-purple-700">${(r.amount || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}