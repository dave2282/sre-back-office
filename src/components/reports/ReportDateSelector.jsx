import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getYearRange, getAvailableYears } from "./reportUtils";

// Emits: onChange({ start, end, label, priorStart, priorEnd, priorLabel })
export default function ReportDateSelector({ transactions, onChange }) {
  const years = getAvailableYears(transactions);
  const currentYear = new Date().getFullYear();

  const [mode, setMode] = useState("year"); // year | prior_year | custom | all_time
  const [year, setYear] = useState(String(years[0] || currentYear));
  const [compareMode, setCompareMode] = useState("none"); // none | prior_year | custom_compare
  const [compareYear, setCompareYear] = useState("none");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customPriorStart, setCustomPriorStart] = useState("");
  const [customPriorEnd, setCustomPriorEnd] = useState("");

  const emit = (overrides = {}) => {
    const state = { mode, year, compareMode, compareYear, customStart, customEnd, customPriorStart, customPriorEnd, ...overrides };

    let start, end, label;
    if (state.mode === "all_time") {
      const dates = transactions.map(t => t.closing_date || t.created_date).filter(Boolean).sort();
      start = dates.length > 0 ? new Date(dates[0] + "T00:00:00") : new Date("2000-01-01");
      end = new Date();
      label = "All Time";
    } else if (state.mode === "year") {
      const r = getYearRange(state.year);
      start = r.start; end = r.end; label = state.year;
    } else if (state.mode === "prior_year") {
      const py = String(currentYear - 1);
      const r = getYearRange(py);
      start = r.start; end = r.end; label = `Prior Year (${py})`;
    } else {
      if (!state.customStart || !state.customEnd) return;
      start = new Date(state.customStart + "T00:00:00");
      end = new Date(state.customEnd + "T23:59:59");
      label = `${state.customStart} – ${state.customEnd}`;
    }

    let priorStart = null, priorEnd = null, priorLabel = null;
    if (state.compareMode === "prior_year") {
      if (state.mode === "year") {
        const py = String(parseInt(state.year) - 1);
        const r = getYearRange(py);
        priorStart = r.start; priorEnd = r.end; priorLabel = py;
      }
    } else if (state.compareMode === "year" && state.compareYear !== "none") {
      const r = getYearRange(state.compareYear);
      priorStart = r.start; priorEnd = r.end; priorLabel = state.compareYear;
    } else if (state.compareMode === "custom_compare" && state.customPriorStart && state.customPriorEnd) {
      priorStart = new Date(state.customPriorStart + "T00:00:00");
      priorEnd = new Date(state.customPriorEnd + "T23:59:59");
      priorLabel = `${state.customPriorStart} – ${state.customPriorEnd}`;
    }

    onChange({ start, end, label, priorStart, priorEnd, priorLabel });
  };

  // Emit on mount
  useEffect(() => { emit(); }, []);

  const handle = (updates) => {
    if (updates.mode !== undefined) setMode(updates.mode);
    if (updates.year !== undefined) setYear(updates.year);
    if (updates.compareMode !== undefined) setCompareMode(updates.compareMode);
    if (updates.compareYear !== undefined) setCompareYear(updates.compareYear);
    if (updates.customStart !== undefined) setCustomStart(updates.customStart);
    if (updates.customEnd !== undefined) setCustomEnd(updates.customEnd);
    if (updates.customPriorStart !== undefined) setCustomPriorStart(updates.customPriorStart);
    if (updates.customPriorEnd !== undefined) setCustomPriorEnd(updates.customPriorEnd);
    emit({ mode, year, compareMode, compareYear, customStart, customEnd, customPriorStart, customPriorEnd, ...updates });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 p-4 bg-gray-50 border rounded-xl mb-4">
      {/* Primary range */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-gray-500">Date Range</Label>
        <Select value={mode} onValueChange={v => handle({ mode: v, compareMode: v === "custom" ? "none" : compareMode })}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all_time">All Time</SelectItem>
            <SelectItem value="year">By Year</SelectItem>
            <SelectItem value="prior_year">Prior Year</SelectItem>
            <SelectItem value="custom">Custom Range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "year" && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-gray-500">Year</Label>
          <Select value={year} onValueChange={v => handle({ year: v })}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}

      {mode === "custom" && (
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">From</Label>
            <Input type="date" className="h-8 text-sm w-36" value={customStart} onChange={e => handle({ customStart: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">To</Label>
            <Input type="date" className="h-8 text-sm w-36" value={customEnd} onChange={e => handle({ customEnd: e.target.value })} />
          </div>
        </>
      )}

      {/* Divider */}
      <div className="h-8 w-px bg-gray-200 self-end hidden sm:block" />

      {/* Compare range */}
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-gray-500">Compare To</Label>
        <Select value={compareMode} onValueChange={v => handle({ compareMode: v })}>
          <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No Comparison</SelectItem>
            {mode === "year" && <SelectItem value="prior_year">Prior Year</SelectItem>}
            {mode === "year" && <SelectItem value="year">Specific Year</SelectItem>}
            <SelectItem value="custom_compare">Custom Range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {compareMode === "year" && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-gray-500">Year</Label>
          <Select value={compareYear} onValueChange={v => handle({ compareYear: v })}>
            <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {years.filter(y => String(y) !== year).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {compareMode === "custom_compare" && (
        <>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">From</Label>
            <Input type="date" className="h-8 text-sm w-36" value={customPriorStart} onChange={e => handle({ customPriorStart: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-gray-500">To</Label>
            <Input type="date" className="h-8 text-sm w-36" value={customPriorEnd} onChange={e => handle({ customPriorEnd: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
}