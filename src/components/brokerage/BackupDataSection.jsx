import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { unzipSync } from 'fflate';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Download, UploadCloud, Loader2, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";

const LAST_BACKUP_KEY = "brokerage_last_backup";
const ENTITIES_TO_DELETE = ["Transaction", "AccountingEntry", "Expense", "Agent", "Document", "TransactionCategory", "Vendor"];

export default function BackupDataSection() {
  const [backingUp, setBackingUp] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState(null);
  const [backupSummary, setBackupSummary] = useState(null);
  const [error, setError] = useState(null);
  const [lastBackup, setLastBackup] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LAST_BACKUP_KEY)); } catch { return null; }
  });

  // Factory reset state
  const [factoryDialog, setFactoryDialog] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);

  const handleDownloadBackup = async () => {
    setBackingUp(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('backupData', { action: 'backup' });
      const { zip_base64, summary, document_manifest } = res.data;

      const now = new Date();
      const dateStamp = now.toISOString().split('T')[0];
      const timeStamp = now.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
      setBackupSummary({ ...summary, _date: timeStamp });

      const binary = atob(zip_base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'application/zip' });

      const savedBackup = { date: timeStamp, dateStamp, summary };
      localStorage.setItem(LAST_BACKUP_KEY, JSON.stringify(savedBackup));
      setLastBackup(savedBackup);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `brokerage_backup_${dateStamp}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  };

  const handleRestoreUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreFile(file);
    setRestoreResult(null);
  };

  const handleRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setRestoreResult(null);
    try {
      let fileToUpload = restoreFile;

      // If it's a ZIP, extract backup_data.json from it
      if (restoreFile.name.endsWith('.zip')) {
        const arrayBuf = await restoreFile.arrayBuffer();
        const unzipped = unzipSync(new Uint8Array(arrayBuf));
        const jsonEntry = unzipped['backup_data.json'];
        if (!jsonEntry) throw new Error('backup_data.json not found inside ZIP');
        fileToUpload = new File([jsonEntry], 'backup_data.json', { type: 'application/json' });
      }

      // Upload file to storage first to avoid large request body limits
      const uploaded = await base44.integrations.Core.UploadFile({ file: fileToUpload });
      const res = await base44.functions.invoke('backupData', { action: 'restore', file_url: uploaded.file_url });
      setRestoreResult({ success: true, results: res.data.results });
    } catch (err) {
      setRestoreResult({ success: false, error: err.message });
    } finally {
      setRestoring(false);
    }
  };

  const handleFactoryReset = async () => {
    setDeleting(true);
    setDeleteResult(null);
    try {
      const counts = {};
      for (const entity of ENTITIES_TO_DELETE) {
        const records = await base44.entities[entity].list();
        await Promise.all((records || []).map(r => base44.entities[entity].delete(r.id)));
        counts[entity] = records?.length || 0;
      }
      setDeleteResult({ success: true, counts });
      setFactoryDialog(false);
    } catch (err) {
      setDeleteResult({ success: false, error: err.message });
    } finally {
      setDeleting(false);
      setConfirmText("");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Download a complete backup of all your brokerage data (transactions, accounting, expenses, agents, documents, and categories) as a ZIP file.
        The ZIP includes a <code className="text-xs bg-gray-100 px-1 rounded">backup_data.json</code> with all records and a <code className="text-xs bg-gray-100 px-1 rounded">document_manifest.json</code> mapping document files to their folder structure.
      </p>

      {/* Download Backup */}
      <div className="p-4 border rounded-xl bg-gray-50 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">Download Full Backup</h3>
        </div>
        <p className="text-xs text-gray-500">
          Exports all database records + a document manifest with folder structure (documents/{'{section}'}/{'{agent}'}/{'{category}'}/{'{filename}'}).
        </p>
        {backupSummary && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 space-y-1">
            <p className="font-semibold flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" /> Backup downloaded successfully</p>
            <p className="text-green-600">📅 {backupSummary._date}</p>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {Object.entries(backupSummary).filter(([k]) => k !== '_date').map(([k, v]) => (
                <span key={k} className="text-green-700">{k}: <strong>{v}</strong></span>
              ))}
            </div>
          </div>
        )}
        {lastBackup && !backupSummary && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
            <p className="font-semibold">Last backup: {lastBackup.date}</p>
            {lastBackup.summary && (
              <div className="grid grid-cols-3 gap-1 mt-1">
                {Object.entries(lastBackup.summary).map(([k, v]) => (
                  <span key={k} className="text-blue-700">{k}: <strong>{v}</strong></span>
                ))}
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {error}
          </div>
        )}
        <Button onClick={handleDownloadBackup} disabled={backingUp} className="w-full gap-2">
          {backingUp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {backingUp ? 'Preparing Backup...' : 'Download Backup ZIP'}
        </Button>
      </div>

      {/* Restore */}
      <div className="p-4 border rounded-xl bg-gray-50 space-y-3">
        <div className="flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-orange-600" />
          <h3 className="font-semibold text-gray-900">Restore from Backup</h3>
        </div>
        <p className="text-xs text-gray-500">
          Upload the <code className="text-xs bg-gray-100 px-1 rounded">backup_data.json</code> or the full <code className="text-xs bg-gray-100 px-1 rounded">.zip</code> backup file to restore records. <strong>This will add records on top of existing data</strong> — clear existing data first if doing a full restore.
        </p>
        <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-800 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span><strong>Warning:</strong> Restoring will create new records from the backup file. It will not delete or overwrite existing records.</span>
        </div>
        <Label className="block">
          <div className={`flex flex-col items-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${restoreFile ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-400'}`}>
            <UploadCloud className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-500">{restoreFile ? restoreFile.name : 'Click to select backup_data.json'}</span>
            <input type="file" accept=".json,.zip" className="hidden" onChange={handleRestoreUpload} />
          </div>
        </Label>
        {restoreResult && (
          <div className={`p-3 rounded-lg text-xs border ${restoreResult.success ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {restoreResult.success ? (
              <div>
                <p className="font-semibold flex items-center gap-1.5 mb-1"><CheckCircle2 className="w-3.5 h-3.5" /> Restore complete</p>
                <div className="grid grid-cols-2 gap-1">
                  {Object.entries(restoreResult.results || {}).map(([k, v]) => (
                    <span key={k}>{k}: <strong>{v} records</strong></span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5" /> {restoreResult.error}</p>
            )}
          </div>
        )}
        <Button
          variant="outline"
          className="w-full gap-2 border-orange-300 text-orange-700 hover:bg-orange-50"
          disabled={!restoreFile || restoring}
          onClick={handleRestore}
        >
          {restoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
          {restoring ? 'Restoring...' : 'Restore from JSON'}
        </Button>

        {/* Factory Reset */}
        <div className="border-t pt-3 mt-2">
          {deleteResult?.success && (
            <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800">
              <p className="font-semibold flex items-center gap-1.5 mb-1"><CheckCircle2 className="w-3.5 h-3.5" /> All records deleted successfully</p>
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(deleteResult.counts || {}).map(([k, v]) => (
                  <span key={k}>{k}: <strong>{v} deleted</strong></span>
                ))}
              </div>
            </div>
          )}
          <Button
            variant="outline"
            className="w-full gap-2 border-red-300 text-red-700 hover:bg-red-50"
            onClick={() => { setFactoryDialog(true); setConfirmText(""); setDeleteResult(null); }}
          >
            <Trash2 className="w-4 h-4" />
            Factory Reset — Delete All Records
          </Button>
        </div>
      </div>

      {/* Factory Reset Confirmation Dialog */}
      <Dialog open={factoryDialog} onOpenChange={(o) => { if (!o) { setFactoryDialog(false); setConfirmText(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="w-5 h-5" /> Factory Reset
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              <p className="font-semibold mb-1">⚠️ This will permanently delete ALL records:</p>
              <ul className="list-disc list-inside text-xs space-y-0.5 text-red-700">
                <li>All Transactions & Accounting Entries</li>
                <li>All Expenses</li>
                <li>All Agents</li>
                <li>All Documents</li>
                <li>All Categories & Vendors</li>
              </ul>
              <p className="mt-2 font-semibold">This cannot be undone. Download a backup first.</p>
            </div>
            <div>
              <Label className="text-sm font-medium">Type <strong>delete all records</strong> to confirm:</Label>
              <Input
                className="mt-1.5"
                placeholder="delete all records"
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setFactoryDialog(false); setConfirmText(""); }}>Cancel</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              disabled={confirmText !== "delete all records" || deleting}
              onClick={handleFactoryReset}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {deleting ? "Deleting..." : "Delete All Records"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}