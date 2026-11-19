import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Send, CheckCircle2 } from "lucide-react";

/**
 * Props:
 *  open, onClose
 *  agentName, agentEmail (pre-filled, editable)
 *  rangeLabel
 *  stats: { count, volume, officeComm, agentNet }
 *  breakdown: [{ side, count, volume, officeComm, agentNet }]
 *  brokerageName
 */
export default function SendReportDialog({ open, onClose, agentName, agentEmail, rangeLabel, stats, breakdown, brokerageName }) {
  const [email, setEmail] = useState(agentEmail || "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleOpen = () => {
    setEmail(agentEmail || "");
    setSent(false);
    setError(null);
  };

  const handleSend = async () => {
    if (!email) return;
    setSending(true);
    setError(null);
    try {
      await base44.functions.invoke('sendAgentReport', {
        agentName,
        agentEmail: email,
        rangeLabel,
        stats,
        breakdown,
        brokerageName,
      });
      setSent(true);
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Failed to send. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else handleOpen(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-600" />
            Send Report to Agent
          </DialogTitle>
        </DialogHeader>

        {sent ? (
          <div className="py-6 flex flex-col items-center gap-3 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-500" />
            <p className="font-semibold text-gray-800">Report sent!</p>
            <p className="text-sm text-gray-500">The production report for <strong>{agentName}</strong> was sent to <strong>{email}</strong>.</p>
            <Button className="mt-2 w-full" onClick={onClose}>Done</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div>
                <Label>Agent</Label>
                <p className="mt-1 text-sm font-medium text-gray-800">{agentName}</p>
                <p className="text-xs text-gray-400">Period: {rangeLabel}</p>
              </div>
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg text-sm">
                <div><span className="text-gray-500 text-xs">Deals</span><p className="font-bold text-gray-800">{stats?.count ?? 0}</p></div>
                <div><span className="text-gray-500 text-xs">Agent Net</span><p className="font-bold text-gray-800">${(stats?.agentNet || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p></div>
              </div>
              <div>
                <Label>Send To *</Label>
                <Input className="mt-1.5" type="email" placeholder="agent@email.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleSend} disabled={sending || !email} className="gap-2">
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send Report
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}