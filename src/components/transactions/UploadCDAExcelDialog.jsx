import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import * as XLSX from "xlsx";
import { sendCDASubmittedEmail } from "@/utils/cdaEmails";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, CheckCircle2, AlertCircle, Download } from "lucide-react";

const TEMPLATE = [
  ["agent_email", "property_address", "city", "state", "zip", "closing_date", "contract_date", "sale_price", "transaction_type", "total_commission_percentage", "agent_split_percentage", "company_split_percentage", "referral_fee_amount", "title_company_name", "title_company_email"],
  ["jane@example.com", "123 Main St", "Denver", "CO", "80202", "2026-04-15", "2026-03-01", "450000", "buyer_side", "3", "70", "30", "0", "Colorado Title", "titles@coloradotitle.com"],
];

// --- Client-side CDA Excel parser (replicates bulkImportCDAs backend function) ---

function buildRowMap(rows) {
  const map = { col2: {}, col1: {}, commissions: {} };
  for (const row of rows) {
    const c1 = String(row[1] || "").toLowerCase().trim();
    const c2 = String(row[2] || "").toLowerCase().trim();
    const c3 = String(row[3] || "").toLowerCase().trim();
    const c6 = String(row[6] || "").toLowerCase().trim();
    if (c2) map.col2[c2] = String(row[3] || "").trim();
    if (c1) map.col1[c1] = String(row[5] || "").trim();
    if (c3 && c6.includes("commission paid")) {
      map.commissions[c3] = parseFloat(row[7] || 0) || 0;
    }
  }
  return map;
}

function getVal(map, labelMatch) {
  const lowerLabel = labelMatch.toLowerCase();
  for (const key in map.col2) {
    if (key.includes(lowerLabel)) return map.col2[key];
  }
  return "";
}

function getTotalVal(map, labelMatch) {
  const lowerLabel = labelMatch.toLowerCase();
  for (const key in map.col1) {
    if (key.includes(lowerLabel)) return map.col1[key];
  }
  return "";
}

function getCommissionPaid(map, name) {
  return map.commissions[name.toLowerCase()] || 0;
}

function parseDate(val) {
  if (!val) return "";
  const num = parseFloat(val);
  if (!isNaN(num) && num > 40000) {
    const msUtc = Math.round((num - 25569) * 86400 * 1000);
    const d = new Date(msUtc);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const parts = String(val).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (parts) return `${parts[3]}-${parts[1].padStart(2, "0")}-${parts[2].padStart(2, "0")}`;
  const d = new Date(val);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return String(val);
}

export default function UploadCDAExcelDialog({ open, onClose, onImported }) {
  const [officeTemplateUrl, setOfficeTemplateUrl] = useState(null);
  const [files, setFiles] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      base44.entities.BrokerageSettings.list().then(data => {
        const url = data?.[0]?.cda_template_url;
        setOfficeTemplateUrl(url || null);
      }).catch(() => {});
    }
  }, [open]);

  const addFiles = (incoming) => {
    const valid = Array.from(incoming).filter(f => /\.(csv|xls|xlsx)$/i.test(f.name));
    setFiles(prev => {
      const names = new Set(prev.map(f => f.name));
      return [...prev, ...valid.filter(f => !names.has(f.name))];
    });
    setResult(null);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const downloadTemplate = () => {
    if (officeTemplateUrl) {
      window.open(officeTemplateUrl, "_blank");
      return;
    }
    const csv = TEMPLATE.map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cda_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse one Excel/CSV file client-side and create the transaction
  const importSingleFile = async (file, user, allAgents, isAdmin) => {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });

    const sheetName = workbook.SheetNames.includes("Input Form") ? "Input Form" : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error("No sheets found in file");

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const rowMap = buildRowMap(rows);

    // --- Agent ---
    const agentName = getVal(rowMap, "Your Name");
    if (!agentName) throw new Error("Could not find agent name ('Your Name:') in file.");

    // --- Working With ---
    const workingWith = getVal(rowMap, "Working With");

    // --- Commission Check Payable To ---
    const commissionCheckPayableTo = getVal(rowMap, "Commission Check Payable") || getVal(rowMap, "LLC Name");

    // --- Property Info ---
    const propertyAddress = getVal(rowMap, "Proprety Address") || getVal(rowMap, "Property Address");
    const buyerName = getVal(rowMap, "Buyer(s)");
    const sellerName = getVal(rowMap, "Seller(s)");
    const coopAgent = getVal(rowMap, "Co-Op Agent");

    // --- Dates ---
    const closingDate = parseDate(getVal(rowMap, "Closing Date"));

    // --- Title Company ---
    const titleCompanyName = getVal(rowMap, "Closer's Name");
    const titleCompanyPhone = getVal(rowMap, "Phone");
    const titleCompanyEmail = getVal(rowMap, "Closer's Email");

    // --- Purchase Price ---
    const salePrice = parseFloat(getVal(rowMap, "Purchase Price")) || 0;

    // --- Commission ---
    const commissionFlatFee = parseFloat(getVal(rowMap, "Commission $ (if flat fee)")) || 0;
    const commissionPctRaw = parseFloat(getVal(rowMap, "Commission %:")) || 0;
    const commissionPercentage = commissionPctRaw > 1 ? commissionPctRaw / 100 : commissionPctRaw;
    const totalCommissionAmount = parseFloat(getTotalVal(rowMap, "Total Commission Paid")) ||
      (commissionFlatFee > 0 ? commissionFlatFee : salePrice * commissionPercentage);

    // --- Office Split ---
    const officeSplitPctRaw = parseFloat(getVal(rowMap, "Split %:")) || 0;
    const officeSplitFlat = parseFloat(getVal(rowMap, "Split $ (if flat fee):")) || 0;

    // --- Company commission ---
    let companyGross = 0;
    if (officeSplitFlat > 0) {
      companyGross = officeSplitFlat;
    } else if (officeSplitPctRaw > 0) {
      const pct = officeSplitPctRaw > 1 ? officeSplitPctRaw / 100 : officeSplitPctRaw;
      companyGross = totalCommissionAmount * pct;
    } else {
      companyGross = getCommissionPaid(rowMap, "Signature Real Estate");
    }
    const agentGross = totalCommissionAmount - companyGross;

    // --- Referrals ---
    const referral1Name = getVal(rowMap, "Referral 1:");
    const referral2Name = getVal(rowMap, "Referral 2:");
    const referral3Name = getVal(rowMap, "Referral 3:");
    const referral4Name = getVal(rowMap, "Referral 4:");

    let ref1Amt = 0, ref2Amt = 0, ref3Amt = 0, ref4Amt = 0;
    for (const row of rows) {
      const c2 = String(row[2] || "").toLowerCase().trim();
      if (c2 === "referral 1:") ref1Amt = parseFloat(row[7] || 0) || 0;
      else if (c2 === "referral 2:") ref2Amt = parseFloat(row[7] || 0) || 0;
      else if (c2 === "referral 3:") ref3Amt = parseFloat(row[7] || 0) || 0;
      else if (c2 === "referral 4:") ref4Amt = parseFloat(row[7] || 0) || 0;
    }
    const totalReferral = ref1Amt + ref2Amt + ref3Amt + ref4Amt;

    // --- Admin Fee ---
    let adminFeePayableTo = "";
    let adminFeeAmount = 0;
    for (const row of rows) {
      const c2 = String(row[2] || "").toLowerCase().trim();
      if (c2.includes("admin fee") && c2.includes("payable")) {
        adminFeePayableTo = String(row[3] || "").trim();
        adminFeeAmount = parseFloat(row[7] || 0) || 0;
        break;
      }
    }

    // --- Client Concession ---
    const clientConcession = parseFloat(getVal(rowMap, "Client's Concession")) || 0;

    // --- Agent Net ---
    const agentNet = agentGross - totalReferral - clientConcession;

    // --- Agent email + roster name validation ---
    let agentEmail = user.email;
    if (isAdmin) {
      const agent = allAgents.find(a =>
        a.full_name?.toLowerCase().trim() === agentName.toLowerCase().trim()
      );
      agentEmail = agent?.user_email || user.email;
    } else {
      const myProfile = allAgents.find(a => a.user_email === user.email);
      if (myProfile && myProfile.full_name?.toLowerCase().trim() !== agentName.toLowerCase().trim()) {
        return {
          success: 0, failed: 1, skipped: 0,
          failedAddresses: [`Name mismatch: CDA says "${agentName}" but roster shows "${myProfile.full_name}". Please correct the name in your CDA file and re-upload.`],
          skippedAddresses: [],
        };
      }
    }

    const txnData = {
      agent_email: agentEmail,
      agent_name: agentName,
      working_with: workingWith || "Buyer",
      commission_check_payable_to: commissionCheckPayableTo,
      property_address: propertyAddress || "See CDA file",
      buyer_name: buyerName,
      seller_name: sellerName,
      coop_agent: coopAgent,
      closing_date: closingDate,
      title_company_name: titleCompanyName,
      title_company_phone: titleCompanyPhone,
      title_company_email: titleCompanyEmail,
      sale_price: salePrice,
      commission_flat_fee: commissionFlatFee,
      commission_percentage: commissionPercentage * 100,
      total_commission_amount: Math.round(totalCommissionAmount * 100) / 100,
      office_split_percentage: officeSplitPctRaw,
      office_split_flat: officeSplitFlat,
      company_gross_commission: Math.round(companyGross * 100) / 100,
      agent_gross_commission: Math.round(agentGross * 100) / 100,
      referral_1_name: referral1Name,
      referral_1_amount: ref1Amt,
      referral_2_name: referral2Name,
      referral_2_amount: ref2Amt,
      referral_3_name: referral3Name,
      referral_3_amount: ref3Amt,
      referral_4_name: referral4Name,
      referral_4_amount: ref4Amt,
      total_referral_amount: totalReferral,
      admin_fee_payable_to: adminFeePayableTo,
      admin_fee_amount: adminFeeAmount,
      client_concession: clientConcession,
      agent_net_commission: Math.round(agentNet * 100) / 100,
      status: "submitted",
      notes: "",
    };

    // Upload the file so we have a reference URL
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    txnData.additional_docs = [{ name: `CDA - ${agentName} - ${propertyAddress || 'Unknown Address'} - ${closingDate || new Date().toISOString().split('T')[0]}`, url: file_url }];

    // Duplicate check
    const existing = await base44.entities.Transaction.filter({
      agent_email: agentEmail,
      property_address: txnData.property_address,
    });
    const isDuplicate = (existing || []).some(t =>
      t.closing_date === txnData.closing_date &&
      t.property_address?.toLowerCase().trim() === txnData.property_address?.toLowerCase().trim()
    );
    if (isDuplicate) {
      return {
        success: 0, skipped: 1, failed: 0,
        skippedAddresses: [`${txnData.property_address} (${txnData.closing_date || 'no date'})`],
        failedAddresses: [],
      };
    }

    const created = await base44.entities.Transaction.create(txnData);
    // Send admin notification email (replaces backend onTransactionCreated automation)
    sendCDASubmittedEmail({ ...txnData, id: created.id, status: "submitted" }).catch(() => {});
    return { success: 1, failed: 0, skipped: 0, failedAddresses: [], skippedAddresses: [] };
  };

  const handleImport = async () => {
    if (!files.length) return;
    setLoading(true);
    setResult(null);
    setError(null);

    let totalSuccess = 0, totalFailed = 0, totalSkipped = 0, allFailedAddresses = [], allSkippedAddresses = [];

    try {
      const user = await base44.auth.me();
      const isAdmin = user.role === "admin" || user.role === "staff";
      const allAgents = await base44.entities.Agent.list("-created_date", 500) || [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setStatusMsg(`Importing ${file.name} (${i + 1}/${files.length})...`);
        const res = await importSingleFile(file, user, allAgents, isAdmin);
        totalSuccess += res.success || 0;
        totalFailed += res.failed || 0;
        totalSkipped += res.skipped || 0;
        if (res.failedAddresses) allFailedAddresses.push(...res.failedAddresses);
        if (res.skippedAddresses) allSkippedAddresses.push(...res.skippedAddresses);
      }

      setResult({ success: totalSuccess, failed: totalFailed, skipped: totalSkipped, failedAddresses: allFailedAddresses, skippedAddresses: allSkippedAddresses });
      if (totalSuccess > 0 && onImported) onImported();
    } catch (err) {
      const detail = err?.message || String(err);
      setError("Import failed: " + detail);
    }

    setLoading(false);
    setStatusMsg("");
  };

  const handleClose = () => {
    setFiles([]);
    setDragging(false);
    setResult(null);
    setError(null);
    setStatusMsg("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import CDAs</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file with transaction data. Download the template below to see the expected format.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">

          <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-2 w-full">
            <Download className="w-4 h-4" /> Office CDA Template
          </Button>

          <label
            className={`flex flex-col items-center gap-3 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${dragging ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-400"}`}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <Upload className="w-6 h-6 text-gray-400" />
            <span className="text-sm text-gray-500 text-center">
              {files.length > 0
                ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
                : "Click to select or drag & drop CSV/Excel files"}
            </span>
            {files.length > 0 && (
              <ul className="text-xs text-gray-400 text-left w-full space-y-0.5 mt-1">
                {files.map((f, i) => (
                  <li key={i} className="truncate">• {f.name}</li>
                ))}
              </ul>
            )}
            <input
              type="file"
              accept=".csv,.xls,.xlsx"
              multiple
              className="hidden"
              onChange={e => addFiles(e.target.files)}
            />
          </label>

          {loading && statusMsg && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />
              <p className="text-sm text-blue-700">{statusMsg}</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className={`flex items-start gap-3 p-3 rounded-lg ${result.failed > 0 ? "bg-orange-50 border border-orange-200" : "bg-green-50 border border-green-200"}`}>
                {result.failed > 0
                  ? <AlertCircle className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                  : <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />}
                <div className="text-sm space-y-1">
                  <p className="font-medium">{result.success} transaction{result.success !== 1 ? "s" : ""} imported successfully.</p>
                  {result.failed > 0 && <p className="text-red-700">{result.failed} failed: {result.failedAddresses.join(", ")}</p>}
                </div>
              </div>
              {result.skipped > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm font-semibold text-amber-800 mb-1">⚠️ {result.skipped} duplicate{result.skipped !== 1 ? "s" : ""} skipped — already exist{result.skipped === 1 ? "s" : ""}:</p>
                  <ul className="text-sm text-amber-700 space-y-0.5">
                    {result.skippedAddresses.map((addr, i) => <li key={i}>• {addr}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Close</Button>
          <Button onClick={handleImport} disabled={!files.length || loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}