import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2 } from "lucide-react";
import { generateCDAPdfClient } from "@/utils/generateCDAClient";
import { resolveApproverName } from "@/utils/resolveApproverName";

export default function DownloadCDAButton({ transaction, settings, size = "sm", variant = "outline", label = "CDA PDF", forceRegenerate = false }) {
  const [loading, setLoading] = useState(false);
  const [approverName, setApproverName] = useState("");
  const [agentProfile, setAgentProfile] = useState(null);

  useEffect(() => {
    if (transaction?.agent_email) {
      base44.entities.Agent.filter({ user_email: transaction.agent_email }).then(agents => {
        setAgentProfile(agents?.[0] || null);
      }).catch(() => {});
    }
  }, [transaction?.agent_email]);

  useEffect(() => {
    if (transaction?.approved_by_name) {
      setApproverName(transaction.approved_by_name);
      return;
    }
    if (transaction?.approved_by) {
      resolveApproverName(transaction.approved_by)
        .then(setApproverName)
        .catch(() => setApproverName(transaction.approved_by || ""));
    }
  }, [transaction?.approved_by, transaction?.approved_by_name]);

  const handleDownload = async () => {
    setLoading(true);

    // If not forcing regeneration and we have a stored PDF URL, open it directly with cache-buster
    if (!forceRegenerate && transaction?.latest_cda_pdf_url) {
      const cacheBust = `?v=${Date.now()}`;
      const a = document.createElement('a');
      a.href = transaction.latest_cda_pdf_url + cacheBust;
      a.download = `CDA_${(transaction.property_address || 'document').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
      a.target = '_blank';
      a.click();
      setLoading(false);
      return;
    }

    // Generate client-side (no backend function needed)
    try {
      const name = approverName || await resolveApproverName(transaction?.approved_by);
      const enrichedTxn = { ...transaction, approved_by_name: name };
      const { blob, filename } = await generateCDAPdfClient(enrichedTxn, settings, agentProfile);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('CDA generation failed:', e);
    }
    setLoading(false);
  };

  return (
    <Button size={size} variant={variant} onClick={e => { e.stopPropagation(); handleDownload(); }} disabled={loading} className="gap-1.5">
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      {label}
    </Button>
  );
}