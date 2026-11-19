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

export default function TeamProductionReport({ transactions, agents, settings }) {
  const [dateRange, setDateRange] = useState({ start: new Date(), end: new Date(), label: "", priorStart: null, priorEnd: null, priorLabel: null });
  const [expandedTeam, setExpandedTeam] = useState(new Set());

  const { start, end, label: rangeLabel, priorStart, priorEnd, priorLabel } = dateRange;
  const hasPrior = !!(priorStart && priorEnd);

  const closed = useMemo(() => filterClosed(transactions, start, end), [transactions, start, end]);
  const priorClosed = useMemo(() => hasPrior ? filterClosed(transactions, priorStart, priorEnd) : [], [transactions, priorStart, priorEnd, hasPrior]);

  // Build team → agents → transactions map
  const teams = useMemo(() => {
    const teamNames = [...new Set(agents.filter(a => a.team).map(a => a.team))];
    if (teamNames.length === 0) teamNames.push("All Agents");

    return teamNames.map(team => {
      const teamAgents = team === "All Agents" ? agents : agents.filter(a => a.team === team);
      const agentEmails = new Set(teamAgents.map(a => a.user_email));
      const agentNames = new Set(teamAgents.map(a => a.full_name));

      const teamTxns = closed.filter(t =>
        agentEmails.has(t.agent_email) || agentNames.has(t.agent_name)
      );
      const priorTeamTxns = priorClosed.filter(t =>
        agentEmails.has(t.agent_email) || agentNames.has(t.agent_name)
      );

      const agentBreakdown = teamAgents.map(a => {
        const atxns = closed.filter(t => t.agent_email === a.user_email || t.agent_name === a.full_name);
        const prtxns = priorClosed.filter(t => t.agent_email === a.user_email || t.agent_name === a.full_name);
        return { agent: a, stats: agentStats(atxns), priorStats: agentStats(prtxns), txns: atxns };
      }).filter(x => x.stats.count > 0 || x.priorStats.count > 0).sort((a, b) => b.stats.officeComm - a.stats.officeComm);

      return { team, stats: agentStats(teamTxns), priorStats: agentStats(priorTeamTxns), agentBreakdown };
    }).sort((a, b) => b.stats.officeComm - a.stats.officeComm);
  }, [agents, closed, priorClosed]);

  const allTeamNames = teams.map(t => t.team);
  const allExpanded = expandedTeam.size === allTeamNames.length && allTeamNames.length > 0;
  const toggleExpandAll = () => setExpandedTeam(allExpanded ? new Set() : new Set(allTeamNames));

  const handleExcel = () => {
    const rows = [];
    teams.forEach(({ team, stats, agentBreakdown }) => {
      rows.push({ "Team": team, "Type": "TEAM TOTAL", "Deals": stats.count, "Volume": stats.volume, "Office Comm": stats.officeComm, "Agent Net": stats.agentNet });
      agentBreakdown.forEach(({ agent, stats: s }) => {
        rows.push({ "Team": team, "Type": agent.full_name, "Deals": s.count, "Volume": s.volume, "Office Comm": s.officeComm, "Agent Net": s.agentNet });
      });
    });
    exportToExcel([{ name: "Team Production", data: rows }], `Team_Production_${rangeLabel}`);
  };

  const handlePDF = () => {
    const headers = ["Team / Agent", "Deals", "Volume", "Office Comm", "Agent Net"];
    const rows = [];
    teams.forEach(({ team, stats, agentBreakdown }) => {
      rows.push([`[TEAM] ${team}`, stats.count, fmt$(stats.volume), fmt$(stats.officeComm), fmt$(stats.agentNet)]);
      agentBreakdown.forEach(({ agent, stats: s }) => {
        rows.push([`  ${agent.full_name}`, s.count, fmt$(s.volume), fmt$(s.officeComm), fmt$(s.agentNet)]);
      });
    });
    exportToPDF(`Team Production Report — ${rangeLabel}`, headers, rows, `Team_Production_${rangeLabel}`);
  };

  return (
    <div className="space-y-4">
      <ReportDateSelector transactions={transactions} onChange={setDateRange} />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Team Production Report <span className="text-gray-400 font-normal text-sm ml-1">{rangeLabel}</span></CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={toggleExpandAll} className="gap-1.5 h-8">{allExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}{allExpanded ? "Collapse All" : "Expand All"}</Button>
              <Button size="sm" variant="outline" onClick={handleExcel} className="gap-1.5 h-8"><Download className="w-3.5 h-3.5" /> Excel</Button>
              <Button size="sm" variant="outline" onClick={handlePDF} className="gap-1.5 h-8"><FileText className="w-3.5 h-3.5" /> PDF</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {teams.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-sm p-6">No team data found.</div>
          ) : (
            teams.map(({ team, stats, priorStats, agentBreakdown }) => (
              <div key={team} className="border-b last:border-0">
                {/* Team header row */}
                <div
                  className="grid px-4 py-3 bg-gray-800 text-white cursor-pointer items-center gap-2 hover:bg-gray-700 transition-colors"
                  style={{ gridTemplateColumns: "1fr 70px 150px 150px 130px 28px" }}
                  onClick={() => setExpandedTeam(prev => { const n = new Set(prev); n.has(team) ? n.delete(team) : n.add(team); return n; })}
                >
                  <span className="font-semibold text-sm">{team}</span>
                  <span className="text-sm text-right">{stats.count}</span>
                  <span className="text-sm text-right">{fmt$(stats.volume)}</span>
                  <span className="text-sm text-right font-bold">{fmt$(stats.officeComm)}
                    {hasPrior && <span className="ml-1.5 text-xs font-normal opacity-70"><DeltaBadge val={pct(stats.officeComm, priorStats.officeComm)} /></span>}
                  </span>
                  <span className="text-sm text-right">{fmt$(stats.agentNet)}</span>
                  <div className="flex justify-end">{expandedTeam.has(team) ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</div>
                </div>

                {/* Agent breakdown */}
                {expandedTeam.has(team) && (
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
                    {agentBreakdown.map(({ agent, stats: s, priorStats: p, txns: atxns }) => {
                      const COL = "1fr 55px 130px 120px 110px 28px";
                      const sides = ["Buyer", "Seller", "Both"].filter(sd => (atxns||[]).some(t => t.working_with === sd));
                      const SROW = { Buyer: "bg-blue-50/60 text-blue-700", Seller: "bg-amber-50/60 text-amber-700", Both: "bg-purple-50/60 text-purple-700" };
                      return (
                        <div key={agent.id}>
                          <div className="grid px-4 py-2.5 border-b hover:bg-gray-50 items-center gap-2 text-sm bg-white"
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
                      <div className="px-4 py-3 text-xs text-gray-400">No production in {rangeLabel}</div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}