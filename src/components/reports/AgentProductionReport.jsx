import { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import SendReportDialog from "./SendReportDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, ChevronUp, Download, FileText, Send } from "lucide-react";
import { filterClosed, agentStats, pct, fmt$, fmtPct, exportToExcel, exportToPDF } from "./reportUtils";
import ReportDateSelector from "./ReportDateSelector";


function DeltaBadge({ val }) {
  if (val === null || val === undefined) return <span className="text-gray-400 text-xs">—</span>;
  const pos = val >= 0;
  return <span className={`text-xs font-medium ${pos ? "text-green-600" : "text-red-500"}`}>{fmtPct(val)}</span>;
}

const SIDE_COLORS = { Buyer: "bg-blue-100 text-blue-700", Seller: "bg-amber-100 text-amber-700", Both: "bg-purple-100 text-purple-700" };

function SideSummary({ txns }) {
  const sides = ["Buyer", "Seller", "Both"];
  return (
    <div className="flex gap-4 mb-3">
      {sides.map(side => {
        const group = txns.filter(t => t.working_with === side);
        if (group.length === 0) return null;
        const vol = group.reduce((s, t) => s + (t.sale_price || 0), 0);
        const comm = group.reduce((s, t) => s + (t.company_gross_commission || 0), 0);
        return (
          <div key={side} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${SIDE_COLORS[side] || "bg-gray-100 text-gray-700"}`}>
            <span>{side}</span>
            <span className="font-bold">{group.length} deal{group.length !== 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{fmt$(vol)} vol</span>
            <span>·</span>
            <span>{fmt$(comm)} office</span>
          </div>
        );
      })}
    </div>
  );
}

const SIDE_ROW_STYLES = {
  Buyer: "bg-blue-50/60 text-blue-700",
  Seller: "bg-amber-50/60 text-amber-700",
  Both: "bg-purple-50/60 text-purple-700",
};

function AgentRow({ agent, stats, priorStats, expanded, onToggle, transactions, onSend }) {
  const change = { count: pct(stats.count, priorStats?.count), officeComm: pct(stats.officeComm, priorStats?.officeComm) };
  const COL = "1fr 60px 130px 120px 110px 60px 48px 28px";
  const sides = ["Buyer", "Seller", "Both"].filter(s => transactions.some(t => t.working_with === s));

  return (
    <>
      <div className="grid px-4 py-3 border-b hover:bg-gray-50 cursor-pointer items-center gap-2 bg-white"
        style={{ gridTemplateColumns: COL }} onClick={onToggle}>
        <span className="font-semibold text-sm text-gray-900 truncate">{agent}</span>
        <span className="text-sm text-right text-gray-700 font-medium">{stats.count}</span>
        <span className="text-sm text-right text-gray-700">{fmt$(stats.volume)}</span>
        <span className="text-sm text-right font-bold text-green-700">{fmt$(stats.officeComm)}</span>
        <span className="text-sm text-right text-gray-700">{fmt$(stats.agentNet)}</span>
        <div className="text-right"><DeltaBadge val={change.officeComm} /></div>
        <div className="flex items-center gap-1 justify-end">
          <button onClick={e => { e.stopPropagation(); onSend(); }} className="p-1 rounded hover:bg-blue-100 text-blue-500" title="Send report to agent"><Send className="w-3.5 h-3.5" /></button>
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </div>
      {sides.map(side => {
        const grp = transactions.filter(t => t.working_with === side);
        const vol = grp.reduce((s, t) => s + (t.sale_price || 0), 0);
        const comm = grp.reduce((s, t) => s + (t.company_gross_commission || 0), 0);
        const net = grp.reduce((s, t) => s + (t.agent_net_commission || 0), 0);
        return (
          <div key={side} className={`grid px-4 py-1.5 border-b items-center gap-2 ${SIDE_ROW_STYLES[side]}`}
            style={{ gridTemplateColumns: COL }}>
            <span className="text-xs font-medium pl-3">{side}</span>
            <span className="text-xs text-right font-medium">{grp.length}</span>
            <span className="text-xs text-right">{fmt$(vol)}</span>
            <span className="text-xs text-right font-semibold">{fmt$(comm)}</span>
            <span className="text-xs text-right">{fmt$(net)}</span>
            <span /><span />
          </div>
        );
      })}
      {expanded && (
        <div className="bg-blue-50/40 border-b px-6 py-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Transaction Detail</p>
          <div className="space-y-1">
            {transactions.map(t => (
              <div key={t.id} className="flex items-center gap-2 text-xs text-gray-700 py-1 border-b last:border-0">
                <span className={`px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${SIDE_COLORS[t.working_with] || "bg-gray-100 text-gray-600"}`}>{t.working_with || "—"}</span>
                <span className="font-medium truncate flex-1">{t.property_address}</span>
                <span className="text-gray-400">{t.closing_date || "—"}</span>
                <span>{fmt$(t.sale_price)}</span>
                <span className="text-green-700 font-medium">{fmt$(t.company_gross_commission)}</span>
                <span>{fmt$(t.agent_net_commission)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

export default function AgentProductionReport({ transactions, agents, settings }) {
  const [dateRange, setDateRange] = useState({ start: new Date(), end: new Date(), label: "", priorStart: null, priorEnd: null, priorLabel: null });
  const [selectedAgents, setSelectedAgents] = useState([]);
  const [expanded, setExpanded] = useState(new Set());
  const [sendDialog, setSendDialog] = useState(null); // { agentName, agentEmail, stats, breakdown }

  const { start, end, label: rangeLabel, priorStart, priorEnd, priorLabel } = dateRange;
  const hasPrior = !!(priorStart && priorEnd);

  const closed = useMemo(() => filterClosed(transactions, start, end) || [], [transactions, start, end]);
  const priorClosed = useMemo(() => hasPrior ? (filterClosed(transactions, priorStart, priorEnd) || []) : [], [transactions, priorStart, priorEnd, hasPrior]);

  const agentMap = useMemo(() => {
    const map = {};
    closed.forEach(t => {
      const k = t.agent_name || t.agent_email || "Unknown";
      if (!map[k]) map[k] = [];
      map[k].push(t);
    });
    return map;
  }, [closed]);

  const priorAgentMap = useMemo(() => {
    const map = {};
    priorClosed.forEach(t => {
      const k = t.agent_name || t.agent_email || "Unknown";
      if (!map[k]) map[k] = [];
      map[k].push(t);
    });
    return map;
  }, [priorClosed]);

  const allAgentKeys = Object.keys(agentMap).sort();
  const displayAgents = selectedAgents.length > 0 ? selectedAgents : allAgentKeys;
  const allExpanded = expanded.size === displayAgents.length && displayAgents.length > 0;
  const toggleExpand = (a) => setExpanded(prev => { const n = new Set(prev); n.has(a) ? n.delete(a) : n.add(a); return n; });
  const toggleExpandAll = () => setExpanded(allExpanded ? new Set() : new Set(displayAgents));

  const buildSendPayload = (a) => {
    const txns = agentMap[a] || [];
    const s = agentStats(txns);
    const agentRec = agents.find(ag => ag.full_name === a || ag.user_email === a);
    const breakdown = ["Buyer", "Seller", "Both"].map(side => {
      const grp = txns.filter(t => t.working_with === side);
      return { side, count: grp.length, volume: grp.reduce((acc, t) => acc + (t.sale_price||0),0), officeComm: grp.reduce((acc, t) => acc + (t.company_gross_commission||0),0), agentNet: grp.reduce((acc, t) => acc + (t.agent_net_commission||0),0) };
    }).filter(b => b.count > 0);
    return { agentName: a, agentEmail: agentRec?.user_email || "", stats: s, breakdown };
  };

  const handleSendAll = async () => {
    const agentsWithEmail = displayAgents.filter(a => {
      const rec = agents.find(ag => ag.full_name === a || ag.user_email === a);
      return !!rec?.user_email;
    });
    if (agentsWithEmail.length === 0) {
      alert('No agents with email addresses found to send reports to.');
      return;
    }
    const confirmed = window.confirm(`This will send production reports to ${agentsWithEmail.length} agent${agentsWithEmail.length !== 1 ? 's' : ''} for ${rangeLabel}. Proceed?`);
    if (!confirmed) return;
    for (const a of agentsWithEmail) {
      const payload = buildSendPayload(a);
      await base44.functions.invoke('sendAgentReport', { ...payload, rangeLabel, brokerageName: settings?.brokerage_name || '' }).catch(() => {});
    }
    alert(`Reports sent to ${agentsWithEmail.length} agent${agentsWithEmail.length !== 1 ? 's' : ''}.`);
  };

  const toggleAgent = (a) => setSelectedAgents(prev =>
    prev.includes(a) ? prev.filter(x => x !== a) : [...prev, a]
  );

  const handleExcelExport = () => {
    const rows = displayAgents.map(a => {
      const s = agentStats(agentMap[a] || []);
      const p = agentStats(priorAgentMap[a] || []);
      return {
        "Agent": a,
        "Transactions": s.count,
        [`${rangeLabel} Volume`]: s.volume,
        [`${rangeLabel} Office Comm`]: s.officeComm,
        [`${rangeLabel} Agent Net`]: s.agentNet,
        ...(hasPrior ? {
          [`${priorLabel} Volume`]: p.volume,
          [`${priorLabel} Office Comm`]: p.officeComm,
          [`${priorLabel} Agent Net`]: p.agentNet,
          "Volume Change %": pct(s.volume, p.volume)?.toFixed(1) ?? "",
          "Office Comm Change %": pct(s.officeComm, p.officeComm)?.toFixed(1) ?? "",
        } : {})
      };
    });
    exportToExcel([{ name: "Agent Production", data: rows }], `Agent_Production_${rangeLabel}`);
  };

  const handlePDFExport = () => {
    const headers = ["Agent", "Deals", "Volume", "Office Comm", "Agent Net"];
    const rows = displayAgents.map(a => {
      const s = agentStats(agentMap[a] || []);
      return [a, s.count, fmt$(s.volume), fmt$(s.officeComm), fmt$(s.agentNet)];
    });
    exportToPDF(`Agent Production Report — ${rangeLabel}`, headers, rows, `Agent_Production_${rangeLabel}`,
      hasPrior ? `Compared to ${priorLabel}` : "");
  };

  return (
    <div className="space-y-4">
      <ReportDateSelector transactions={transactions} onChange={setDateRange} />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Agent Production Report <span className="text-gray-400 font-normal text-sm ml-1">{rangeLabel}</span></CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={toggleExpandAll} className="gap-1.5 h-8">{allExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}{allExpanded ? "Collapse All" : "Expand All"}</Button>
              <Button size="sm" variant="outline" onClick={handleExcelExport} className="gap-1.5 h-8"><Download className="w-3.5 h-3.5" /> Excel</Button>
              <Button size="sm" variant="outline" onClick={handlePDFExport} className="gap-1.5 h-8"><FileText className="w-3.5 h-3.5" /> PDF</Button>
              <Button size="sm" variant="outline" onClick={handleSendAll} className="gap-1.5 h-8 text-blue-600 border-blue-300 hover:bg-blue-50"><Send className="w-3.5 h-3.5" /> Send All</Button>
            </div>
          </div>
        </CardHeader>

        {/* Agent Filter */}
        <div className="px-6 pb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filter Agents (leave blank for all)</p>
          <div className="flex flex-wrap gap-2">
            {allAgentKeys.map(a => (
              <label key={a} className="flex items-center gap-1.5 text-xs cursor-pointer">
                <Checkbox checked={selectedAgents.includes(a)} onCheckedChange={() => toggleAgent(a)} />
                <span className="text-gray-700">{a}</span>
              </label>
            ))}
          </div>
        </div>

        <CardContent className="p-0">
          <div className="grid px-4 py-2.5 bg-gray-50 border-t border-b text-xs font-semibold text-gray-500 uppercase tracking-wide gap-2"
            style={{ gridTemplateColumns: "1fr 60px 130px 120px 110px 60px 48px 28px" }}>
            <div>Agent</div>
            <div className="text-right">Deals</div>
            <div className="text-right">Sales Volume</div>
            <div className="text-right">Office Comm.</div>
            <div className="text-right">Agent Net</div>
            <div className="text-right">{hasPrior ? `vs ${priorLabel}` : "YoY"}</div>
            <div className="text-right">Send</div>
            <div />
          </div>
          {displayAgents.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm">No transactions in {rangeLabel}.</div>
          ) : (
            displayAgents.map(a => (
              <AgentRow
                key={a}
                agent={a}
                stats={agentStats(agentMap[a] || [])}
                priorStats={hasPrior ? agentStats(priorAgentMap[a] || []) : null}
                transactions={agentMap[a] || []}
                priorTransactions={priorAgentMap[a] || []}
                expanded={expanded.has(a)}
                onToggle={() => toggleExpand(a)}
                onSend={() => setSendDialog(buildSendPayload(a))}
              />
            ))
          )}
          {/* Totals */}
          {displayAgents.length > 0 && (() => {
            const total = agentStats(displayAgents.flatMap(a => agentMap[a] || []));
            return (
              <div className="grid px-4 py-3 bg-gray-800 text-white font-semibold text-sm gap-2 border-t"
                style={{ gridTemplateColumns: "1fr 60px 130px 120px 110px 60px 48px 28px" }}>
                <span>TOTAL</span>
                <span className="text-right">{total.count}</span>
                <span className="text-right">{fmt$(total.volume)}</span>
                <span className="text-right text-green-400">{fmt$(total.officeComm)}</span>
                <span className="text-right">{fmt$(total.agentNet)}</span>
                <span /><span /><span />
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {sendDialog && (
        <SendReportDialog
          open={!!sendDialog}
          onClose={() => setSendDialog(null)}
          agentName={sendDialog.agentName}
          agentEmail={sendDialog.agentEmail}
          rangeLabel={rangeLabel}
          stats={sendDialog.stats}
          breakdown={sendDialog.breakdown}
          brokerageName={settings?.brokerage_name || ''}
        />
      )}
    </div>
  );
}