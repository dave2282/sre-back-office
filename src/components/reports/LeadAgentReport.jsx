import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Download, FileText } from "lucide-react";
import { filterClosed, agentStats, pct, fmt$, fmtPct, exportToExcel, exportToPDF } from "./reportUtils";
import ReportDateSelector from "./ReportDateSelector";

const SIDE_COLORS = { Buyer: "bg-blue-100 text-blue-700", Seller: "bg-amber-100 text-amber-700", Both: "bg-purple-100 text-purple-700" };

function SidePills({ txns }) {
  return (
    <div className="flex gap-1.5 flex-wrap mt-1">
      {["Buyer", "Seller", "Both"].map(side => {
        const count = txns.filter(t => t.working_with === side).length;
        if (!count) return null;
        return <span key={side} className={`text-xs px-1.5 py-0.5 rounded font-medium ${SIDE_COLORS[side]}`}>{side}: {count}</span>;
      })}
    </div>
  );
}

function DeltaBadge({ val }) {
  if (val === null || val === undefined) return <span className="text-gray-400 text-xs">—</span>;
  return <span className={`text-xs font-medium ${val >= 0 ? "text-green-600" : "text-red-500"}`}>{fmtPct(val)}</span>;
}

export default function LeadAgentReport({ transactions, agents }) {
  const [dateRange, setDateRange] = useState({ start: new Date(), end: new Date(), label: "", priorStart: null, priorEnd: null, priorLabel: null });
  const [expanded, setExpanded] = useState(new Set());

  const { start, end, label: rangeLabel, priorStart, priorEnd, priorLabel } = dateRange;
  const hasPrior = !!(priorStart && priorEnd);

  const closed = useMemo(() => filterClosed(transactions, start, end), [transactions, start, end]);
  const priorClosed = useMemo(() => hasPrior ? filterClosed(transactions, priorStart, priorEnd) : [], [transactions, priorStart, priorEnd, hasPrior]);

  // Build lead agent → subordinate agents map
  const leadGroups = useMemo(() => {
    // Find all agents who have a lead_agent set
    const leadEmails = new Set(agents.filter(a => a.lead_agent).map(a => a.lead_agent));
    // Lead agents are either in settings.lead_agents or have subordinates
    const leads = agents.filter(a => leadEmails.has(a.user_email) || a.role === "manager");

    if (leads.length === 0) {
      // Fallback: group by commission_plan or just show all agents under "Office"
      return [];
    }

    return leads.map(lead => {
      const subordinates = agents.filter(a => a.lead_agent === lead.user_email);
      const allInGroup = [lead, ...subordinates];
      const emails = new Set(allInGroup.map(a => a.user_email));
      const names = new Set(allInGroup.map(a => a.full_name));

      const groupTxns = closed.filter(t => emails.has(t.agent_email) || names.has(t.agent_name));
      const priorGroupTxns = priorClosed.filter(t => emails.has(t.agent_email) || names.has(t.agent_name));

      const agentBreakdown = subordinates.map(a => {
        const atxns = closed.filter(t => t.agent_email === a.user_email || t.agent_name === a.full_name);
        const ptxns = priorClosed.filter(t => t.agent_email === a.user_email || t.agent_name === a.full_name);
        return { agent: a, stats: agentStats(atxns), priorStats: agentStats(ptxns), txns: atxns };
      }).filter(x => x.stats.count > 0 || x.priorStats.count > 0).sort((a, b) => b.stats.officeComm - a.stats.officeComm);

      // Lead's own transactions
      const leadTxns = closed.filter(t => t.agent_email === lead.user_email || t.agent_name === lead.full_name);

      return {
        lead,
        stats: agentStats(groupTxns),
        priorStats: agentStats(priorGroupTxns),
        leadStats: agentStats(leadTxns),
        agentBreakdown,
      };
    }).sort((a, b) => b.stats.officeComm - a.stats.officeComm);
  }, [agents, closed, priorClosed]);

  const allLeadIds = leadGroups.map(g => g.lead.id);
  const allExpanded = expanded.size === allLeadIds.length && allLeadIds.length > 0;
  const toggleExpandAll = () => setExpanded(allExpanded ? new Set() : new Set(allLeadIds));

  const handleExcel = () => {
    const rows = [];
    leadGroups.forEach(({ lead, stats, leadStats, agentBreakdown }) => {
      rows.push({ "Lead Agent": lead.full_name, "Type": "GROUP TOTAL", "Deals": stats.count, "Volume": stats.volume, "Office Comm": stats.officeComm, "Agent Net": stats.agentNet });
      rows.push({ "Lead Agent": lead.full_name, "Type": `${lead.full_name} (Own Production)`, "Deals": leadStats.count, "Volume": leadStats.volume, "Office Comm": leadStats.officeComm, "Agent Net": leadStats.agentNet });
      agentBreakdown.forEach(({ agent, stats: s }) => {
        rows.push({ "Lead Agent": lead.full_name, "Type": agent.full_name, "Deals": s.count, "Volume": s.volume, "Office Comm": s.officeComm, "Agent Net": s.agentNet });
      });
    });
    exportToExcel([{ name: "Lead Agent Report", data: rows }], `Lead_Agent_Report_${rangeLabel}`);
  };

  const handlePDF = () => {
    const headers = ["Lead / Agent", "Deals", "Volume", "Office Comm", "Agent Net"];
    const rows = [];
    leadGroups.forEach(({ lead, stats, leadStats, agentBreakdown }) => {
      rows.push([`[GROUP] ${lead.full_name}`, stats.count, fmt$(stats.volume), fmt$(stats.officeComm), fmt$(stats.agentNet)]);
      rows.push([`  ${lead.full_name} (Own)`, leadStats.count, fmt$(leadStats.volume), fmt$(leadStats.officeComm), fmt$(leadStats.agentNet)]);
      agentBreakdown.forEach(({ agent, stats: s }) => {
        rows.push([`  ${agent.full_name}`, s.count, fmt$(s.volume), fmt$(s.officeComm), fmt$(s.agentNet)]);
      });
    });
    exportToPDF(`Lead Agent Report — ${rangeLabel}`, headers, rows, `Lead_Agent_Report_${rangeLabel}`);
  };

  if (leadGroups.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-gray-400">
          <p>No lead agent groups found.</p>
          <p className="text-xs mt-1">Assign a "Lead Agent" to agents in the Agent Roster to see this report.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <ReportDateSelector transactions={transactions} onChange={setDateRange} />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Lead Agent Production Report <span className="text-gray-400 font-normal text-sm ml-1">{rangeLabel}</span></CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={toggleExpandAll} className="gap-1.5 h-8">{allExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}{allExpanded ? "Collapse All" : "Expand All"}</Button>
              <Button size="sm" variant="outline" onClick={handleExcel} className="gap-1.5 h-8"><Download className="w-3.5 h-3.5" /> Excel</Button>
              <Button size="sm" variant="outline" onClick={handlePDF} className="gap-1.5 h-8"><FileText className="w-3.5 h-3.5" /> PDF</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {leadGroups.map(({ lead, stats, priorStats, leadStats, agentBreakdown }) => (
            <div key={lead.id} className="border-b last:border-0">
              {/* Lead header */}
              <div
                className="grid px-4 py-3 bg-slate-800 text-white cursor-pointer hover:bg-slate-700 items-center gap-2"
                style={{ gridTemplateColumns: "1fr 70px 150px 150px 130px 28px" }}
                onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(lead.id) ? n.delete(lead.id) : n.add(lead.id); return n; })}
              >
                <div>
                  <p className="font-semibold text-sm">{lead.full_name}</p>
                  <p className="text-xs opacity-60">Lead Agent · Group Total</p>
                </div>
                <span className="text-sm text-right">{stats.count}</span>
                <span className="text-sm text-right">{fmt$(stats.volume)}</span>
                <div className="text-right">
                  <span className="font-bold text-sm">{fmt$(stats.officeComm)}</span>
                  {hasPrior && <span className="ml-1.5 opacity-80"><DeltaBadge val={pct(stats.officeComm, priorStats.officeComm)} /></span>}
                </div>
                <span className="text-sm text-right">{fmt$(stats.agentNet)}</span>
                <div className="flex justify-end">{expanded.has(lead.id) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</div>
              </div>

              {expanded.has(lead.id) && (
                <div>
                  <div className="grid px-4 py-2 bg-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide gap-2 border-b"
                    style={{ gridTemplateColumns: "1fr 55px 130px 120px 110px 28px" }}>
                    <div>Agent</div>
                    <div className="text-right">Deals</div>
                    <div className="text-right">Volume</div>
                    <div className="text-right">Office Comm</div>
                    <div className="text-right">Agent Net</div>
                    <div />
                  </div>

                  {/* Lead's own production */}
                  {(() => {
                    const leadOwnTxns = closed.filter(t => t.agent_email === lead.user_email || t.agent_name === lead.full_name);
                    const COL = "1fr 55px 130px 120px 110px 28px";
                    const SROW = { Buyer: "bg-blue-50/60 text-blue-700", Seller: "bg-amber-50/60 text-amber-700", Both: "bg-purple-50/60 text-purple-700" };
                    const sides = ["Buyer", "Seller", "Both"].filter(s => leadOwnTxns.some(t => t.working_with === s));
                    return (
                      <>
                        <div className="grid px-4 py-2.5 border-b bg-blue-50 hover:bg-blue-100 items-center gap-2 text-sm"
                          style={{ gridTemplateColumns: COL }}>
                          <span className="font-semibold text-blue-800">{lead.full_name} <span className="font-normal text-blue-500 text-xs">(Own)</span></span>
                          <span className="text-right">{leadStats.count}</span>
                          <span className="text-right">{fmt$(leadStats.volume)}</span>
                          <span className="text-right font-bold text-green-700">{fmt$(leadStats.officeComm)}</span>
                          <span className="text-right">{fmt$(leadStats.agentNet)}</span>
                          <span />
                        </div>
                        {sides.map(side => {
                          const grp = leadOwnTxns.filter(t => t.working_with === side);
                          const vol = grp.reduce((acc, t) => acc + (t.sale_price || 0), 0);
                          const comm = grp.reduce((acc, t) => acc + (t.company_gross_commission || 0), 0);
                          const net = grp.reduce((acc, t) => acc + (t.agent_net_commission || 0), 0);
                          return (
                            <div key={side} className={`grid px-4 py-1.5 border-b items-center gap-2 ${SROW[side]}`}
                              style={{ gridTemplateColumns: COL }}>
                              <span className="text-xs font-medium pl-4">{side}</span>
                              <span className="text-xs text-right font-medium">{grp.length}</span>
                              <span className="text-xs text-right">{fmt$(vol)}</span>
                              <span className="text-xs text-right font-semibold">{fmt$(comm)}</span>
                              <span className="text-xs text-right">{fmt$(net)}</span>
                              <span />
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}

                  {agentBreakdown.map(({ agent, stats: s, priorStats: p, txns: atxns }) => {
                    const COL = "1fr 55px 130px 120px 110px 28px";
                    const SROW = { Buyer: "bg-blue-50/60 text-blue-700", Seller: "bg-amber-50/60 text-amber-700", Both: "bg-purple-50/60 text-purple-700" };
                    const sides = ["Buyer", "Seller", "Both"].filter(sd => (atxns||[]).some(t => t.working_with === sd));
                    return (
                      <div key={agent.id}>
                        <div className="grid px-4 py-2.5 border-b last:border-0 hover:bg-gray-50 items-center gap-2 text-sm bg-white"
                          style={{ gridTemplateColumns: COL }}>
                          <span className="font-semibold text-gray-800">{agent.full_name}</span>
                          <span className="text-right text-gray-700">{s.count}</span>
                          <span className="text-right text-gray-700">{fmt$(s.volume)}</span>
                          <div className="text-right">
                            <span className="font-bold text-green-700">{fmt$(s.officeComm)}</span>
                            {hasPrior && <span className="ml-1.5"><DeltaBadge val={pct(s.officeComm, p.officeComm)} /></span>}
                          </div>
                          <span className="text-right text-gray-700">{fmt$(s.agentNet)}</span>
                          <span />
                        </div>
                        {sides.map(side => {
                          const grp = (atxns||[]).filter(t => t.working_with === side);
                          const vol = grp.reduce((acc, t) => acc + (t.sale_price || 0), 0);
                          const comm = grp.reduce((acc, t) => acc + (t.company_gross_commission || 0), 0);
                          const net = grp.reduce((acc, t) => acc + (t.agent_net_commission || 0), 0);
                          return (
                            <div key={side} className={`grid px-4 py-1.5 border-b items-center gap-2 ${SROW[side]}`}
                              style={{ gridTemplateColumns: COL }}>
                              <span className="text-xs font-medium pl-4">{side}</span>
                              <span className="text-xs text-right font-medium">{grp.length}</span>
                              <span className="text-xs text-right">{fmt$(vol)}</span>
                              <span className="text-xs text-right font-semibold">{fmt$(comm)}</span>
                              <span className="text-xs text-right">{fmt$(net)}</span>
                              <span />
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {agentBreakdown.length === 0 && (
                    <div className="px-4 py-3 text-xs text-gray-400">No subordinate agents with production in {rangeLabel}.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}