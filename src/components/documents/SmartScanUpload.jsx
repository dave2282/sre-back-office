import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, CheckCircle2, XCircle } from "lucide-react";
import TransactionSearchSelect from "./TransactionSearchSelect";

function DocOnlyQuickCreate({ onCreated, user }) {
  const [showInput, setShowInput] = useState(false);
  const [address, setAddress] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!address.trim()) return;
    setCreating(true);
    const created = await base44.entities.Transaction.create({
      agent_email: user?.email || "",
      agent_name: user?.full_name || user?.email || "",
      property_address: address.trim(),
      sale_price: 0,
      status: "draft",
    });
    setCreating(false);
    setAddress("");
    setShowInput(false);
    onCreated(created);
  };

  if (showInput) {
    return (
      <div className="p-3 rounded-lg border border-teal-300 bg-teal-50 space-y-2">
        <p className="text-xs font-semibold text-teal-800">Document File Only</p>
        <Input placeholder="Property address..." value={address} onChange={e => setAddress(e.target.value)} onKeyDown={e => e.key === "Enter" && handleCreate()} autoFocus />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => { setShowInput(false); setAddress(""); }}>Cancel</Button>
          <Button size="sm" className="flex-1 bg-teal-600 hover:bg-teal-700 text-white" disabled={!address.trim() || creating} onClick={handleCreate}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create & Select"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all"
      onClick={() => setShowInput(true)}
    >
      <p className="text-sm font-semibold text-gray-800">Document File Only</p>
      <p className="text-xs text-gray-500">Create a folder for documents only — no commission tracking</p>
    </button>
  );
}

export default function SmartScanUpload({ open, onClose, transactions: propTransactions, docs, settings, user, onUploaded, agents = [], initialTransactionId = null }) {
  const [localTransactions, setLocalTransactions] = useState([]);
  const transactions = [...localTransactions, ...propTransactions.filter(t => !localTransactions.find(l => l.id === t.id))];
  const [files, setFiles] = useState([]);
  const [transactionId, setTransactionId] = useState(initialTransactionId);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const justDropped = useRef(false);
  const [step, setStep] = useState("select");
  const [progressMsg, setProgressMsg] = useState("");
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  // Sync transactionId when initialTransactionId prop changes (for folder-level trigger)
  useEffect(() => {
    if (initialTransactionId && transactionId !== initialTransactionId) {
      setTransactionId(initialTransactionId);
    }
  }, [initialTransactionId]);

  const selectedTxn = transactions.find(t => t.id === transactionId);

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer.files;
    if (dropped?.length) {
      justDropped.current = true;
      setFiles(Array.from(dropped));
      setTimeout(() => { justDropped.current = false; }, 300);
    }
  };

  const handleScan = async () => {
    if (!files.length || !transactionId) return;
    setError(null);
    setStep("processing");
    setUploading(true);

    try {
      const CONCURRENCY = 3;
      let completed = 0;
      const errors = [];

      // Process files in batches of CONCURRENCY
      for (let i = 0; i < files.length; i += CONCURRENCY) {
        const batch = files.slice(i, i + CONCURRENCY);
        setProgressMsg(`Processing files ${i + 1}–${Math.min(i + CONCURRENCY, files.length)} of ${files.length}...`);

        await Promise.all(batch.map(async (file) => {
          try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            await base44.functions.invoke('smartScanPDF', {
              file_url,
              transaction_id: transactionId,
              agent_email: selectedTxn?.agent_email || user?.email,
            });
            completed++;
            setProgressMsg(`Completed ${completed} of ${files.length} files...`);
          } catch (err) {
            errors.push(`${file.name}: ${err?.message || 'failed'}`);
            console.warn('File failed:', file.name, err?.message);
          }
        }));
      }

      // Wait for backend to finalize
      await new Promise(resolve => setTimeout(resolve, 2000));

      setStep("done");
      if (onUploaded) await onUploaded();

      if (errors.length > 0) {
        console.warn('Some files had errors:', errors);
      }
    } catch (err) {
      setError(err?.message || "Processing failed. Please try again.");
      setStep("select");
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setFiles([]);
    setTransactionId(initialTransactionId || null);
    setStep("select");
    setProgressMsg("");
    setError(null);
    if (step === "done" && onUploaded) onUploaded();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Smart Scan — Upload Documents</DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <>
            <div className="space-y-4 py-2 overflow-y-auto flex-1 pr-1">
              <p className="text-sm text-gray-600">
                Select a transaction and upload one or more PDF files.
              </p>

              <div>
                <Label>Transaction *</Label>
                {initialTransactionId ? (
                  <div className="mt-1.5 px-3 py-2 bg-gray-50 border rounded-md text-sm text-gray-700 font-medium">
                    {transactions.find(t => t.id === initialTransactionId)?.property_address || initialTransactionId}
                  </div>
                ) : (
                  <TransactionSearchSelect
                    transactions={transactions}
                    docs={docs}
                    value={transactionId || ""}
                    onChange={(val) => { setTransactionId(val); }}
                    onNewTransaction={async () => {}}
                  />
                )}
              </div>

              <div>
                <Label>PDF Document(s) *</Label>
                <div
                  className={`mt-1.5 flex flex-col items-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    isDragging ? "border-purple-400 bg-purple-50" : files.length > 0 ? "border-green-400 bg-green-50" : "border-gray-200 hover:border-purple-300 hover:bg-purple-50"
                  }`}
                  onClick={() => { if (!justDropped.current) fileInputRef.current?.click(); }}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
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
                  <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" multiple className="hidden" onChange={e => setFiles([...e.target.files])} />
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {!initialTransactionId && (
                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs text-gray-500 font-medium">Don't have a transaction yet?</p>
                  <button
                    className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all"
                    onClick={() => { handleClose(); window.location.href = "/SubmitCDA"; }}
                  >
                    <p className="text-sm font-semibold text-gray-800">New Property Entry (with CDA)</p>
                    <p className="text-xs text-gray-500">Submit a new CDA for a new transaction</p>
                  </button>
                  <DocOnlyQuickCreate
                    onCreated={(txn) => {
                      setLocalTransactions(prev => [txn, ...prev]);
                      setTransactionId(txn.id);
                    }}
                    user={user}
                    transactions={transactions}
                  />
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button
                onClick={handleScan}
                disabled={files.length === 0 || !transactionId || uploading}
              >
                Scan & Upload
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "processing" && (
          <div className="py-8 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-purple-100 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-purple-600 animate-spin" />
            </div>
            <p className="font-semibold text-gray-800">Processing...</p>
            <p className="text-sm text-gray-500">{progressMsg || "Analyzing your documents..."}</p>

            <div className="w-full mt-2 flex items-start gap-3 p-4 bg-red-50 border-2 border-red-400 rounded-xl">
              <span className="text-2xl leading-none">⚠️</span>
              <div className="text-left">
                <p className="font-bold text-red-700 text-sm">DO NOT CLOSE THIS WINDOW</p>
                <p className="text-xs text-red-600 mt-0.5">Closing or navigating away will cancel the upload. Please keep this window open until processing is complete.</p>
              </div>
            </div>

            <p className="text-xs text-gray-400">
              Need to work? <a href="/DocumentVault" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline">Open Document Vault in a new tab</a>
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
              <div>
                <p className="font-semibold text-green-800">Documents uploaded successfully!</p>
                <p className="text-sm text-green-600">Documents have been saved to the Document Vault.</p>
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