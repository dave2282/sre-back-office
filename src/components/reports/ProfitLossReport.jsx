import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Download, FileText } from "lucide-react";
import { filterClosed, pct, fmt$, fmtPct, inDateRange, exportToExcel, exportToPDF } from "./reportUtils";
import ReportDateSelector from "./ReportDateSelector";

function DeltaBadge({ val }) {
  if (val === null || val === undefined) return <span className="text-gray-400 text-xs">—</span>;
  return <span className={`text-xs font-medium ${val >= 0 ? "text-green-600" : "text-red-500"}`}>{fmtPct(val)}</span>;
}

function Row({ label, current, prior, indent = false, bold = false, positive = true }) {
  const change = pct(current, prior);
  return (
    <div className={`grid items-center gap-2 px-4 py-2 border-b last:border-0 ${bold ? "bg-gray-50 font-semibold" : "hover:bg-gray-50"}`}
      style={{ gridTemplateColumns: "1fr 160px 160px 120px" }}>
      <span className={`text-sm ${indent ? "pl-4 text-gray-600" : "text-gray-900"} ${bold ? "font-semibold" : ""}`}>{label}</span>
      <span className={`text-sm text-right ${bold ? "font-semibold" : ""} ${current < 0 ? "text-red-600" : positive ? "text-green-700" : "text-gray-800"}`}>{fmt$(current)}</span>
      <span className={`text-sm text-right text-gray-500`}>{prior !== undefined ? fmt$(prior) : "—"}</span>
      <div className="text-right"><DeltaBadge val={change} /></div>
    </div>
  );
}

export default function ProfitLossReport({ transactions, expenses }) {
  const [dateRange, setDateRange] = useState({ start: new Date(), end: new Date(), label: "", priorStart: null, priorEnd: null, priorLabel: null });
  const [view, setView] = useState("summary"); // summary | detailed
  const [expandedMonths, setExpandedMonths] = useState(new Set());

  const { start, end, label: rangeLabel, priorStart, priorEnd, priorLabel } = dateRange;
  const hasPrior = !!(priorStart && priorEnd);

  const closed = useMemo(() => filterClosed(transactions, start, end), [transactions, start, end]);
  const priorClosed = useMemo(() => hasPrior ? filterClosed(transactions, priorStart, priorEnd) : [], [transactions, priorStart, priorEnd, hasPrior]);

  const yearExpenses = useMemo(() =>
    (expenses || []).filter(e => inDateRange(e.expense_date || e.created_date, start, end)),
    [expenses, start, end]
  );
  const priorExpenses = useMemo(() =>
    hasPrior ? (expenses || []).filter(e => inDateRange(e.expense_date || e.created_date, priorStart, priorEnd)) : [],
    [expenses, priorStart, priorEnd, hasPrior]
  );

  const sumTxn = (txns, field) => txns.reduce((s, t) => s + (t[field] || 0), 0);
  const sumExp = (exps) => exps.reduce((s, e) => s + (e.amount || 0), 0);

  const income = {
    officeComm: sumTxn(closed, "company_gross_commission"),
    adminFees: sumTxn(closed, "admin_fee_amount"),
    flatFees: closed.reduce((s, t) => s + (t.commission_flat_fee || 0), 0),
  };
  const priorIncome = {
    officeComm: sumTxn(priorClosed, "company_gross_commission"),
    adminFees: sumTxn(priorClosed, "admin_fee_amount"),
    flatFees: priorClosed.reduce((s, t) => s + (t.commission_flat_fee || 0), 0),
  };

  const expByCategory = useMemo(() => {
    const map = {};
    yearExpenses.forEach(e => { const k = e.category || "Uncategorized"; map[k] = (map[k] || 0) + (e.amount || 0); });
    return map;
  }, [yearExpenses]);

  const priorExpByCategory = useMemo(() => {
    const map = {};
    priorExpenses.forEach(e => { const k = e.category || "Uncategorized"; map[k] = (map[k] || 0) + (e.amount || 0); });
    return map;
  }, [priorExpenses]);

  const totalIncome = income.officeComm + income.adminFees + income.flatFees;
  const priorTotalIncome = priorIncome.officeComm + priorIncome.adminFees + priorIncome.flatFees;
  const totalExpenses = sumExp(yearExpenses);
  const priorTotalExpenses = sumExp(priorExpenses);
  const netIncome = totalIncome - totalExpenses;
  const priorNetIncome = priorTotalIncome - priorTotalExpenses;

  // Monthly breakdown for detailed view
  const year = start.getFullYear();
  const months = useMemo(() => {
    const result = [];
    for (let m = 0; m < 12; m++) {
      const mStart = new Date(year, m, 1);
      const mEnd = new Date(parseInt(year), m + 1, 0, 23, 59, 59);
      const mTxns = filterClosed(transactions, mStart, mEnd);
      const mExps = (expenses || []).filter(e => inDateRange(e.expense_date || e.created_date, mStart, mEnd));
      const mIncome = sumTxn(mTxns, "company_gross_commission") + sumTxn(mTxns, "admin_fee_amount");
      const mExpenses = sumExp(mExps);
      result.push({
        label: new Date(parseInt(year), m, 1).toLocaleString("default", { month: "long" }),
        income: mIncome,
        expenses: mExpenses,
        net: mIncome - mExpenses,
        txns: mTxns,
        exps: mExps,
      });
    }
    return result;
  }, [transactions, expenses, year]);

  const handleExcel = () => {
    const summary = [
      { "Category": "INCOME", "Amount": "", "Prior Year": "" },
      { "Category": "Office Commission", "Amount": income.officeComm, "Prior Year": priorIncome.officeComm },
      { "Category": "Admin Fees", "Amount": income.adminFees, "Prior Year": priorIncome.adminFees },
      { "Category": "Flat Fees", "Amount": income.flatFees, "Prior Year": priorIncome.flatFees },
      { "Category": "TOTAL INCOME", "Amount": totalIncome, "Prior Year": priorTotalIncome },
      { "Category": "", "Amount": "", "Prior Year": "" },
      { "Category": "EXPENSES", "Amount": "", "Prior Year": "" },
      ...Object.entries(expByCategory).map(([k, v]) => ({ "Category": k, "Amount": v, "Prior Year": priorExpByCategory[k] || 0 })),
      { "Category": "TOTAL EXPENSES", "Amount": totalExpenses, "Prior Year": priorTotalExpenses },
      { "Category": "", "Amount": "", "Prior Year": "" },
      { "Category": "NET INCOME", "Amount": netIncome, "Prior Year": priorNetIncome },
    ];
    const monthly = months.map(m => ({ "Month": m.label, "Income": m.income, "Expenses": m.expenses, "Net": m.net }));
    exportToExcel([{ name: "P&L Summary", data: summary }, { name: "Monthly Breakdown", data: monthly }], `PL_Report_${rangeLabel}`);
  };

  const handlePDF = () => {
    const headers = ["Category", rangeLabel, hasPrior ? priorLabel : "Prior", "Change"];
    const rows = [
      ["INCOME", "", "", ""],
      ["  Office Commission", fmt$(income.officeComm), fmt$(priorIncome.officeComm), fmtPct(pct(income.officeComm, priorIncome.officeComm))],
      ["  Admin Fees", fmt$(income.adminFees), fmt$(priorIncome.adminFees), ""],
      ["  Flat Fees", fmt$(income.flatFees), fmt$(priorIncome.flatFees), ""],
      ["TOTAL INCOME", fmt$(totalIncome), fmt$(priorTotalIncome), fmtPct(pct(totalIncome, priorTotalIncome))],
      ["", "", "", ""],
      ["EXPENSES", "", "", ""],
      ...Object.entries(expByCategory).map(([k, v]) => [`  ${k}`, fmt$(v), fmt$(priorExpByCategory[k] || 0), ""]),
      ["TOTAL EXPENSES", fmt$(totalExpenses), fmt$(priorTotalExpenses), fmtPct(pct(totalExpenses, priorTotalExpenses))],
      ["", "", "", ""],
      ["NET INCOME", fmt$(netIncome), fmt$(priorNetIncome), fmtPct(pct(netIncome, priorNetIncome))],
    ];
    exportToPDF(`Profit & Loss Statement — ${rangeLabel}`, headers, rows, `PL_Report_${rangeLabel}`);
  };

  const toggleMonth = (label) => {
    setExpandedMonths(prev => {
      const n = new Set(prev);
      n.has(label) ? n.delete(label) : n.add(label);
      return n;
    });
  };

  return (
    <div className="space-y-4">
      <ReportDateSelector transactions={transactions} onChange={setDateRange} />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Profit & Loss Statement <span className="text-gray-400 font-normal text-sm ml-1">{rangeLabel}</span></CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex rounded-lg border overflow-hidden">
                <button onClick={() => setView("summary")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "summary" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Summary</button>
                <button onClick={() => setView("detailed")} className={`px-3 py-1.5 text-xs font-medium transition-colors ${view === "detailed" ? "bg-gray-900 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>Detailed</button>
              </div>
              <Button size="sm" variant="outline" onClick={handleExcel} className="gap-1.5 h-8"><Download className="w-3.5 h-3.5" /> Excel</Button>
              <Button size="sm" variant="outline" onClick={handlePDF} className="gap-1.5 h-8"><FileText className="w-3.5 h-3.5" /> PDF</Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {/* Column Header */}
          <div className="grid px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide gap-2"
            style={{ gridTemplateColumns: "1fr 160px 160px 120px" }}>
            <div>Category</div>
            <div className="text-right">{rangeLabel}</div>
            <div className="text-right">{hasPrior ? priorLabel : "Prior"}</div>
            <div className="text-right">Change</div>
          </div>

          {view === "summary" ? (
            <>
              {/* Income Section */}
              <div className="px-4 py-2 bg-green-50 border-b">
                <p className="text-xs font-bold text-green-800 uppercase tracking-wide">Income</p>
              </div>
              <Row label="Office Commission" current={income.officeComm} prior={hasPrior ? priorIncome.officeComm : undefined} indent />
              <Row label="Admin Fees" current={income.adminFees} prior={hasPrior ? priorIncome.adminFees : undefined} indent />
              <Row label="Flat Fees / Transaction Fees" current={income.flatFees} prior={hasPrior ? priorIncome.flatFees : undefined} indent />
              <Row label="TOTAL INCOME" current={totalIncome} prior={hasPrior ? priorTotalIncome : undefined} bold />

              {/* Expenses Section */}
              <div className="px-4 py-2 bg-red-50 border-b mt-2">
                <p className="text-xs font-bold text-red-800 uppercase tracking-wide">Expenses</p>
              </div>
              {Object.entries(expByCategory).length === 0 ? (
                <div className="px-4 py-3 text-sm text-gray-400 italic border-b">No expenses recorded for {rangeLabel}.</div>
              ) : (
                Object.entries(expByCategory).map(([cat, amt]) => (
                  <Row key={cat} label={cat} current={amt} prior={hasPrior ? (priorExpByCategory[cat] || 0) : undefined} indent positive={false} />
                ))
              )}
              <Row label="TOTAL EXPENSES" current={totalExpenses} prior={hasPrior ? priorTotalExpenses : undefined} bold positive={false} />

              {/* Net */}
              <div className="grid px-4 py-4 bg-gray-800 text-white items-center gap-2 mt-1"
                style={{ gridTemplateColumns: "1fr 160px 160px 120px" }}>
                <span className="font-bold text-base">NET INCOME</span>
                <span className={`text-right font-bold text-base ${netIncome >= 0 ? "text-green-400" : "text-red-400"}`}>{fmt$(netIncome)}</span>
                <span className={`text-right font-semibold ${priorNetIncome >= 0 ? "text-green-400" : "text-red-400"} opacity-80`}>{hasPrior ? fmt$(priorNetIncome) : "—"}</span>
                <div className="text-right"><DeltaBadge val={hasPrior ? pct(netIncome, priorNetIncome) : null} /></div>
              </div>
            </>
          ) : (
            // Detailed monthly view
            months.map(m => (
              <div key={m.label} className="border-b last:border-0">
                <div
                  className="grid px-4 py-3 hover:bg-gray-50 cursor-pointer items-center gap-2"
                  style={{ gridTemplateColumns: "1fr 160px 160px 120px 28px" }}
                  onClick={() => toggleMonth(m.label)}
                >
                  <span className="font-semibold text-sm text-gray-900">{m.label}</span>
                  <span className={`text-sm text-right font-semibold ${m.income >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt$(m.income)}</span>
                  <span className="text-sm text-right text-red-600">{fmt$(m.expenses)} exp</span>
                  <span className={`text-sm text-right font-bold ${m.net >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt$(m.net)}</span>
                  <div className="flex justify-end">{expandedMonths.has(m.label) ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}</div>
                </div>
                {expandedMonths.has(m.label) && (
                  <div className="bg-gray-50 px-6 py-3 space-y-2">
                    {m.txns.length > 0 && (
                      <>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Transactions ({m.txns.length})</p>
                        {m.txns.map(t => (
                          <div key={t.id} className="flex justify-between text-xs text-gray-700 py-1 border-b last:border-0">
                            <span className="truncate max-w-[200px]">{t.property_address}</span>
                            <span className="text-green-700 font-medium">{fmt$(t.company_gross_commission)}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {m.exps.length > 0 && (
                      <>
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-2">Expenses ({m.exps.length})</p>
                        {m.exps.map(e => (
                          <div key={e.id} className="flex justify-between text-xs text-gray-700 py-1 border-b last:border-0">
                            <span className="truncate max-w-[200px]">{e.description}</span>
                            <span className="text-red-600 font-medium">{fmt$(e.amount)}</span>
                          </div>
                        ))}
                      </>
                    )}
                    {m.txns.length === 0 && m.exps.length === 0 && <p className="text-xs text-gray-400">No activity.</p>}
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