import { useRef, useState } from "react";
import Papa from "papaparse";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const CSV_TEMPLATE = `full_name,user_email,phone,license_number,license_expiration,join_date,role,lead_agent,team,commission_plan,desk_fee_plan,annual_cap_amount,cap_status,status,notes
John Doe,john@example.com,555-123-4567,LIC123456,2027-06-30,2024-01-15,agent,jane@example.com,Sales Team,70/30 Plan,Monthly Desk Fee,16000,none,active,Top producer`;

const downloadTemplate = () => {
  const blob = new Blob([CSV_TEMPLATE], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "agent_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
};

export default function AgentImportDialog({ open, onClose, onImported }) {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [parsedRows, setParsedRows] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [sendWelcomeEmails, setSendWelcomeEmails] = useState(true);
  const fileInputRef = useRef(null);

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);
    setError(null);

    try {
      const text = await file.text();
      
      // Use Papa Parse for proper CSV handling
      const parsed = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, "_"),
      });

      if (parsed.errors.length > 0) {
        setError(`CSV parsing error: ${parsed.errors[0].message}`);
        return;
      }

      const rows = parsed.data.filter((row) => row.full_name); // Only keep rows with full_name

      if (rows.length === 0) {
        setError("No valid rows found in CSV. Make sure full_name column is present.");
        return;
      }

      // Normalize and process rows
      rows.forEach((row) => {
        // Support 'email' as alias for 'user_email'
        if (row.email && !row.user_email) {
          row.user_email = row.email;
          delete row.email;
        }
        // Parse numeric fields
        if (row.annual_cap_amount) row.annual_cap_amount = Number(row.annual_cap_amount);
        // Default plans to "None Set" if not provided
        if (!row.commission_plan) row.commission_plan = "None Set";
        if (!row.desk_fee_plan) row.desk_fee_plan = "None Set";
      });

      // Get existing agents and lead agents for validation
      const existingAgents = await base44.entities.Agent.list("-created_date", 1000) || [];
      const existingEmails = new Set(existingAgents.map(a => a.user_email?.toLowerCase()).filter(Boolean));
      const settings = await base44.entities.BrokerageSettings.list();
      const leadAgentEmails = new Set((settings?.[0]?.lead_agents || []).map(la => la.email?.toLowerCase()).filter(Boolean));

      // Check for duplicates and validate lead_agent references
      const rowsWithStatus = rows.map(row => {
        const issues = [];
        if (row.user_email && existingEmails.has(row.user_email.toLowerCase())) {
          issues.push("duplicate email");
        }
        if (row.lead_agent && !leadAgentEmails.has(row.lead_agent.toLowerCase())) {
          issues.push(`lead agent "${row.lead_agent}" not found`);
        }
        return {
          ...row,
          issues,
          status: issues.length > 0 ? "warning" : "new"
        };
      });

      // Show preview for confirmation
      setParsedRows(rowsWithStatus);
      setUploading(false);
    } catch (err) {
      setError(err.message || "Failed to import CSV");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmImport = async () => {
    if (!parsedRows) return;
    setConfirming(true);
    
    try {
      const existingAgents = await base44.entities.Agent.list("-created_date", 1000) || [];
      const existingEmails = new Set(existingAgents.map(a => a.user_email?.toLowerCase()).filter(Boolean));

      let success = 0, failed = 0;
      for (const row of parsedRows) {
        try {
          // Skip rows with issues
          if (row.issues && row.issues.length > 0) {
            failed++;
            continue;
          }

          // Skip duplicates (safety check)
          if (row.user_email && existingEmails.has(row.user_email.toLowerCase())) {
            failed++;
            continue;
          }

          // Create agent with cleaned data (remove internal fields)
          const agentData = { ...row };
          delete agentData.issues;
          delete agentData.status;

          await base44.entities.Agent.create(agentData);
          if (row.user_email) existingEmails.add(row.user_email.toLowerCase());

          if (row.user_email && sendWelcomeEmails) {
            await base44.users.inviteUser(row.user_email, "user").catch(() => {});
          }
          success++;
        } catch {
          failed++;
        }
      }

      setResult({ success, failed });
      setParsedRows(null);
      if (success > 0 && onImported) onImported();
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setError(null);
    setParsedRows(null);
    setSendWelcomeEmails(true);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Import Agents from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to add multiple agents at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label className="relative block cursor-pointer rounded-lg border-2 border-dashed border-border p-6 text-center hover:border-gray-400 transition-colors">
            <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">Click to browse or drag a CSV file here</p>
            <p className="mt-1 text-xs text-muted-foreground">Supports .csv files</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="absolute inset-0 cursor-pointer opacity-0"
              onChange={handleFileUpload}
            />
          </label>

          <div className="rounded-lg bg-muted/50 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">Required: full_name</p>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={downloadTemplate}>
                <Download className="h-3 w-3" /> Download Template
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Optional: user_email, phone, license_number, license_expiration, join_date, role, lead_agent, team, commission_plan, desk_fee_plan, annual_cap_amount, cap_status, status, notes
            </p>
          </div>

          {uploading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              Parsing CSV…
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
          )}

          {parsedRows && !result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-3 bg-gray-50 border rounded-lg">
                <input
                  type="checkbox"
                  id="send-welcome"
                  checked={sendWelcomeEmails}
                  onChange={e => setSendWelcomeEmails(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                />
                <label htmlFor="send-welcome" className="text-sm text-gray-700 cursor-pointer">
                  Send welcome email invitations to imported agents
                </label>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-900 mb-2">Preview: {parsedRows.length} agents</p>
                <div className="space-y-2 max-h-48 overflow-y-auto text-xs">
                  {parsedRows.map((row, idx) => (
                    <div key={idx} className={`p-2 rounded border ${row.status === "warning" ? "bg-orange-50 border-orange-200" : "bg-white border-gray-200"}`}>
                      <div className="flex items-start gap-2">
                        {row.status === "warning" ? (
                          <AlertCircle className="w-3 h-3 text-orange-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={row.status === "warning" ? "text-orange-700 font-medium" : "text-gray-700 font-medium"}>{row.full_name}</p>
                          <p className="text-gray-500 text-xs">{row.user_email || "no email"}</p>
                          {row.lead_agent && <p className="text-gray-500 text-xs">Lead Agent: {row.lead_agent}</p>}
                          {row.issues && row.issues.length > 0 && (
                            <div className="mt-1 space-y-0.5">
                              {row.issues.map((issue, i) => (
                                <p key={i} className="text-orange-600 text-xs">• {issue}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              <div className={`text-sm p-3 rounded-lg border ${result.failed > 0 ? "bg-orange-50 border-orange-200" : "bg-green-50 border-green-200"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className={`w-4 h-4 ${result.failed > 0 ? "text-orange-600" : "text-green-600"}`} />
                  <span className={result.failed > 0 ? "text-orange-700 font-medium" : "text-green-700 font-medium"}>Import Complete</span>
                </div>
                <p className={result.failed > 0 ? "text-orange-700" : "text-green-700"}>
                  <strong>{result.success}</strong> agent{result.success !== 1 ? "s" : ""} imported successfully.
                  {result.failed > 0 && <><br /><strong>{result.failed}</strong> skipped (duplicates or errors).</>}
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {parsedRows && !result && (
            <>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handleConfirmImport} disabled={confirming}>
                {confirming ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : "Confirm Import"}
              </Button>
            </>
          )}
          {result && <Button variant="outline" onClick={handleClose}>Close</Button>}
          {!parsedRows && !result && <Button variant="outline" onClick={handleClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}