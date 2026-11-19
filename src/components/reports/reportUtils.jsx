import { parseISO, isWithinInterval } from "date-fns";
import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";

export function getYearRange(year) {
  const y = parseInt(year);
  return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59) };
}

export function inDateRange(dateStr, start, end) {
  if (!dateStr) return false;
  try {
    const d = dateStr.includes("T") ? parseISO(dateStr) : parseISO(dateStr + "T00:00:00");
    return isWithinInterval(d, { start, end });
  } catch { return false; }
}

export function filterClosed(transactions, start, end) {
  return transactions.filter(t =>
    (t.status === "approved" || t.status === "paid") &&
    inDateRange(t.closing_date || t.approved_date || t.paid_date, start, end)
  );
}

export function agentStats(transactions) {
  return {
    count: transactions.length,
    volume: transactions.reduce((s, t) => s + (t.sale_price || 0), 0),
    officeComm: transactions.reduce((s, t) => s + (t.company_gross_commission || 0), 0),
    agentGross: transactions.reduce((s, t) => s + (t.agent_gross_commission || 0), 0),
    agentNet: transactions.reduce((s, t) => s + (t.agent_net_commission || 0), 0),
    referrals: transactions.reduce((s, t) => s + (t.total_referral_amount || 0), 0),
  };
}

export function pct(current, prior) {
  if (!prior || prior === 0) return null;
  return ((current - prior) / prior) * 100;
}

export function fmt$(n) {
  return "$" + (n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function fmtPct(n) {
  if (n === null || n === undefined) return "—";
  return (n >= 0 ? "+" : "") + n.toFixed(1) + "%";
}

export function getAvailableYears(transactions) {
  const years = new Set();
  transactions.forEach(t => {
    const d = t.closing_date || t.approved_date || t.paid_date;
    if (d) {
      try { years.add(parseISO(d.includes("T") ? d : d + "T00:00:00").getFullYear()); } catch {}
    }
  });
  const currentYear = new Date().getFullYear();
  years.add(currentYear);
  return Array.from(years).sort((a, b) => b - a);
}

// ─── Excel Export ───────────────────────────────────────────────────────────
export function exportToExcel(sheets, filename) {
  const wb = XLSX.utils.book_new();
  sheets.forEach(({ name, data }) => {
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name.substring(0, 31));
  });
  XLSX.writeFile(wb, filename + ".xlsx");
}

// ─── PDF Export ──────────────────────────────────────────────────────────────
export function exportToPDF(title, headers, rows, filename, subtitle = "") {
  const doc = new jsPDF({ orientation: "landscape" });
  let y = 18;

  doc.setFontSize(16);
  doc.setFont(undefined, "bold");
  doc.text(title, 14, y);
  y += 7;

  if (subtitle) {
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    doc.text(subtitle, 14, y);
    y += 6;
  }

  doc.setFontSize(9);
  doc.setFont(undefined, "bold");
  const colWidth = (doc.internal.pageSize.width - 28) / headers.length;
  headers.forEach((h, i) => doc.text(h, 14 + i * colWidth, y));
  y += 5;

  doc.setDrawColor(200);
  doc.line(14, y, doc.internal.pageSize.width - 14, y);
  y += 4;

  doc.setFont(undefined, "normal");
  rows.forEach(row => {
    if (y > doc.internal.pageSize.height - 20) {
      doc.addPage();
      y = 18;
    }
    row.forEach((cell, i) => doc.text(String(cell ?? ""), 14 + i * colWidth, y));
    y += 6;
  });

  doc.save(filename + ".pdf");
}