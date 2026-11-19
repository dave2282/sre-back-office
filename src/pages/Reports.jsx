import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users, UserCheck, DollarSign, TrendingUp } from "lucide-react";
import AgentProductionReport from "@/components/reports/AgentProductionReport";
import TeamProductionReport from "@/components/reports/TeamProductionReport";
import LeadAgentReport from "@/components/reports/LeadAgentReport";
import ProfitLossReport from "@/components/reports/ProfitLossReport";

const TABS = [
  { id: "agent", label: "Agent Production", icon: Users },
  { id: "team", label: "Team Production", icon: UserCheck },
  { id: "lead", label: "Lead Agent", icon: TrendingUp },
  { id: "pl", label: "Profit & Loss", icon: DollarSign },
];

export default function Reports() {
  const [tab, setTab] = useState("agent");
  const [transactions, setTransactions] = useState([]);
  const [agents, setAgents] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Transaction.list("-created_date", 2000),
      base44.entities.Agent.list("-created_date", 500),
      base44.entities.Expense.list("-created_date", 2000),
      base44.entities.BrokerageSettings.list(),
    ]).then(([txns, ags, exps, settingsList]) => {
      setTransactions(txns || []);
      setAgents(ags || []);
      setExpenses(exps || []);
      if (settingsList?.length > 0) setSettings(settingsList[0]);
      setLoading(false);
    });
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full p-12">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-500 text-sm mt-1">Production reports, P&L statements, and year-over-year comparisons</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === id ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "agent" && <AgentProductionReport transactions={transactions} agents={agents} settings={settings} />}
      {tab === "team" && <TeamProductionReport transactions={transactions} agents={agents} settings={settings} />}
      {tab === "lead" && <LeadAgentReport transactions={transactions} agents={agents} />}
      {tab === "pl" && <ProfitLossReport transactions={transactions} expenses={expenses} />}
    </div>
  );
}