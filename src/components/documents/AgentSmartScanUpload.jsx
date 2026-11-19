import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, CheckCircle2, XCircle } from "lucide-react";

export default function AgentSmartScanUpload({ open, onClose, agents, docs, user, onUploaded }) {
  const [files, setFiles] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [step, setStep] = useState("select");
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState(null);

  const handleScan = async () => {
    if (!files.length || !selectedAgent) return;
    setError(null);
    setStep("processing");

    try {
      for (let fi = 0; fi < files.length; fi++) {
        const file = files[fi];
        setProgressMsg(`Processing file ${fi + 1} of ${files.length}...`);
        const { file_url } = await base44.integrations.Core.UploadFile({ file });

        await base44.entities.Document.create({
          name: file.name,
          file_url,
          file_type: file.type,
          doc_section: "office",
          agent_email: selectedAgent,
          file_status: "pending",
        });
      }

      setStep("done");
      if (onUploaded) onUploaded();
    } catch (err) {
      setError(err?.message || "Processing failed. Please try again.");
      setStep("select");
    }
  };

  const handleClose = () => {
    setFiles([]);
    setSelectedAgent("");
    setStep("select");
    setProgressMsg("");
    setError(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Smart Scan — Upload Agent Documents</DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
            <p className="text-sm text-gray-600">
              Select an agent and upload documents to their file.
            </p>

            <div>
              <Label>Agent *</Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select agent..." /></SelectTrigger>
                <SelectContent>
                  {agents.map(a => (
                    <SelectItem key={a.id} value={a.user_email}>{a.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>PDF Document(s) *</Label>
              <label className={`mt-1.5 flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${files.length > 0 ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-purple-300 hover:bg-purple-50"}`}>
                {files.length > 0 ? (
                  <>
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                    <p className="text-sm font-medium text-green-700">{files.length === 1 ? files[0].name : `${files.length} files selected`}</p>
                    <p className="text-xs text-green-600">Click to replace</p>
                  </>
                ) : (
                  <>
                    <Upload className="w-6 h-6 text-gray-400" />
                    <p className="text-sm text-gray-500">Click or drag & drop PDFs</p>
                    <p className="text-xs text-gray-400">Select one or multiple PDF files</p>
                  </>
                )}
                <input type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={e => setFiles([...e.target.files])} />
              </label>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleScan}
                disabled={files.length === 0 || !selectedAgent}
              >
                Scan & Upload
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === "processing" && (
          <div className="py-10 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-purple-600 animate-spin" />
            </div>
            <p className="font-semibold text-gray-800">Processing...</p>
            <p className="text-sm text-gray-500">{progressMsg}</p>
            <p className="text-xs text-gray-400 mt-2">
              or <a href="/DocumentVault" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">continue working in a new tab</a>
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Documents uploaded successfully!</p>
                <p className="text-sm text-green-600">All files have been saved.</p>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setFiles([]); setStep("select"); setProgressMsg(""); setError(null); }}>
                Upload More
              </Button>
              <Button onClick={handleClose} className="flex-1">Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}