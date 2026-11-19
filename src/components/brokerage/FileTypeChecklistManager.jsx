import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, ChevronDown, ChevronUp, Loader2, Copy, Pencil, Check, X, ArrowUp, ArrowDown } from "lucide-react";
import ListExportImport from "@/components/brokerage/ListExportImport";

const DEFAULT_FILE_TYPES = [
  {
    name: "Listing Closing Checklist",
    required_docs: ["Listing Agreement", "Seller's Disclosure", "Purchase Agreement", "Addendum (if applicable)", "Commission Agreement", "Final Settlement Statement", "Title Commitment"]
  },
  {
    name: "Buyers Closing Checklist",
    required_docs: ["Buyer Representation Agreement", "Purchase Agreement", "Addendum (if applicable)", "Loan Approval Letter", "Home Inspection Report", "Final Settlement Statement", "Title Commitment", "Commission Agreement"]
  },
  {
    name: "Terminated Listing Check List",
    required_docs: ["Listing Agreement", "Termination of Listing Agreement", "Seller's Disclosure (if provided)", "Any Addenda Signed"]
  },
  {
    name: "Terminated Buyer Checklist",
    required_docs: ["Buyer Representation Agreement", "Termination of Buyer Representation Agreement", "Any Addenda Signed", "Earnest Money Release (if applicable)"]
  },
];

export default function FileTypeChecklistManager({ settings, onSaved }) {
  const [fileTypes, setFileTypes] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [newDocInputs, setNewDocInputs] = useState({});
  const [editingDoc, setEditingDoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [renamingIdx, setRenamingIdx] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [importStatus, setImportStatus] = useState(null); // { type: 'success'|'warn'|'error', msg }

  useEffect(() => {
    const types = settings?.document_file_types;
    if (types?.length > 0) {
      setFileTypes(types);
    } else {
      // Auto-seed defaults and save them
      setFileTypes(DEFAULT_FILE_TYPES);
      if (settings?.id) {
        base44.entities.BrokerageSettings.update(settings.id, { document_file_types: DEFAULT_FILE_TYPES })
          .then(() => onSaved?.());
      }
    }
  }, [settings]);

  const persist = async (updated) => {
    setSaving(true);
    if (settings?.id) {
      await base44.entities.BrokerageSettings.update(settings.id, { document_file_types: updated });
    }
    onSaved?.();
    setSaving(false);
  };

  const addFileType = async () => {
    const updated = [...fileTypes, { name: "New File Type", required_docs: [] }];
    setFileTypes(updated);
    await persist(updated);
    setExpanded(updated.length - 1);
    setRenamingIdx(updated.length - 1);
    setRenameValue("New File Type");
  };

  const deleteFileType = async (idx) => {
    const updated = fileTypes.filter((_, i) => i !== idx);
    setFileTypes(updated);
    await persist(updated);
    if (expanded === idx) setExpanded(null);
  };

  const duplicateFileType = async (idx) => {
    const original = fileTypes[idx];
    const copy = { ...original, name: `${original.name} (Copy)`, required_docs: [...(original.required_docs || [])] };
    const updated = [...fileTypes.slice(0, idx + 1), copy, ...fileTypes.slice(idx + 1)];
    setFileTypes(updated);
    await persist(updated);
    setExpanded(idx + 1);
    setRenamingIdx(idx + 1);
    setRenameValue(copy.name);
  };

  const startRename = (idx, e) => {
    e.stopPropagation();
    setRenamingIdx(idx);
    setRenameValue(fileTypes[idx].name);
  };

  const confirmRename = async (idx) => {
    if (!renameValue.trim()) return;
    const updated = fileTypes.map((ft, i) => i === idx ? { ...ft, name: renameValue.trim() } : ft);
    setFileTypes(updated);
    setRenamingIdx(null);
    await persist(updated);
  };

  const cancelRename = () => setRenamingIdx(null);

  const moveFileType = async (ftIdx, direction) => {
    const newIdx = direction === "up" ? ftIdx - 1 : ftIdx + 1;
    if (newIdx < 0 || newIdx >= fileTypes.length) return;
    const updated = [...fileTypes];
    [updated[ftIdx], updated[newIdx]] = [updated[newIdx], updated[ftIdx]];
    setFileTypes(updated);
    await persist(updated);
    if (expanded === ftIdx) setExpanded(newIdx);
  };

  const addRequiredDoc = async (ftIdx) => {
    const doc = (newDocInputs[ftIdx] || "").trim();
    if (!doc) return;
    const updated = fileTypes.map((ft, i) =>
      i === ftIdx ? { ...ft, required_docs: [...(ft.required_docs || []), doc] } : ft
    );
    setFileTypes(updated);
    setNewDocInputs(p => ({ ...p, [ftIdx]: "" }));
    await persist(updated);
  };

  const removeRequiredDoc = async (ftIdx, docIdx) => {
    const updated = fileTypes.map((ft, i) =>
      i === ftIdx ? { ...ft, required_docs: ft.required_docs.filter((_, di) => di !== docIdx) } : ft
    );
    setFileTypes(updated);
    await persist(updated);
  };

  const moveRequiredDoc = async (ftIdx, docIdx, direction) => {
    const newDocIdx = direction === "up" ? docIdx - 1 : docIdx + 1;
    const docs = fileTypes[ftIdx].required_docs;
    if (newDocIdx < 0 || newDocIdx >= docs.length) return;
    const newDocs = [...docs];
    [newDocs[docIdx], newDocs[newDocIdx]] = [newDocs[newDocIdx], newDocs[docIdx]];
    const updated = fileTypes.map((ft, i) =>
      i === ftIdx ? { ...ft, required_docs: newDocs } : ft
    );
    setFileTypes(updated);
    await persist(updated);
  };

  const updateRequiredDoc = async (ftIdx, docIdx, newName) => {
    if (!newName.trim()) return;
    const docs = fileTypes[ftIdx].required_docs;
    const newDocs = [...docs];
    newDocs[docIdx] = newName.trim();
    const updated = fileTypes.map((ft, i) =>
      i === ftIdx ? { ...ft, required_docs: newDocs } : ft
    );
    setFileTypes(updated);
    await persist(updated);
    setEditingDoc(null);
  };

  const handleImport = async (imported) => {
    setImportStatus(null);
    if (!Array.isArray(imported) || imported.length === 0) {
      setImportStatus({ type: 'error', msg: 'No valid data found in the file. Make sure it is a JSON array of file types.' });
      return;
    }
    const existingNames = new Set(fileTypes.map(ft => ft.name.toLowerCase()));
    const toAdd = imported.filter(ft => ft.name && !existingNames.has(ft.name.toLowerCase()));
    const skipped = imported.length - toAdd.length;
    if (toAdd.length === 0) {
      setImportStatus({ type: 'warn', msg: `All ${skipped} item${skipped !== 1 ? 's' : ''} were skipped — names already exist.` });
      return;
    }
    const updated = [...fileTypes, ...toAdd.map(ft => ({ name: ft.name, required_docs: ft.required_docs || [] }))];
    setFileTypes(updated);
    await persist(updated);
    setImportStatus({ type: 'success', msg: `${toAdd.length} file type${toAdd.length !== 1 ? 's' : ''} imported successfully${skipped > 0 ? `, ${skipped} skipped (duplicate names)` : ''}.` });
    setTimeout(() => setImportStatus(null), 5000);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Define checklist types used in the Document Vault. Each type can have required document names.</p>
        <ListExportImport data={fileTypes.map(ft => ({ name: ft.name, required_docs: ft.required_docs || [] }))} onImport={handleImport} filename="document_file_types" />
      </div>
      {importStatus && (
        <div className={`text-sm px-3 py-2 rounded-lg border ${
          importStatus.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
          importStatus.type === 'warn' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
          'bg-red-50 border-red-200 text-red-700'
        }`}>
          {importStatus.msg}
        </div>
      )}

      {fileTypes.map((ft, ftIdx) => (
        <div key={ftIdx} className="border rounded-lg overflow-hidden bg-white">
          <div
            className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
            onClick={() => setExpanded(expanded === ftIdx ? null : ftIdx)}
          >
            {renamingIdx === ftIdx ? (
              <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                <Input
                  autoFocus
                  className="h-7 text-sm flex-1"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") confirmRename(ftIdx); if (e.key === "Escape") cancelRename(); }}
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600" onClick={() => confirmRename(ftIdx)}>
                  <Check className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400" onClick={cancelRename}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <>
                <span className="font-medium text-sm text-gray-900 flex-1">{ft.name}</span>
                <span className="text-xs text-gray-400">{(ft.required_docs || []).length} required doc{(ft.required_docs || []).length !== 1 ? "s" : ""}</span>
                <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-blue-600" title="Rename" onClick={e => startRename(ftIdx, e)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-indigo-600" title="Duplicate & Rename" onClick={e => { e.stopPropagation(); duplicateFileType(ftIdx); }}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-red-600" title="Delete" onClick={e => { e.stopPropagation(); deleteFileType(ftIdx); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                  {ftIdx > 0 && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-blue-600" title="Move Up" onClick={e => { e.stopPropagation(); moveFileType(ftIdx, "up"); }}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  {ftIdx < fileTypes.length - 1 && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-gray-400 hover:text-blue-600" title="Move Down" onClick={e => { e.stopPropagation(); moveFileType(ftIdx, "down"); }}>
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  </div>
                {expanded === ftIdx ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </>
            )}
          </div>

          {expanded === ftIdx && (
            <div className="border-t px-4 py-3 bg-gray-50 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Required Documents</p>
              {(ft.required_docs || []).length === 0 && (
                <p className="text-xs text-gray-400 italic">No required documents. Add some below.</p>
              )}
              {(ft.required_docs || []).map((doc, docIdx) => {
                const isEditing = editingDoc?.ftIdx === ftIdx && editingDoc?.docIdx === docIdx;
                return (
                  <div key={docIdx} className="flex items-center gap-2 bg-white border rounded px-3 py-1.5">
                    {isEditing ? (
                      <Input
                        autoFocus
                        className="h-7 text-sm flex-1"
                        value={editingDoc.value}
                        onChange={e => setEditingDoc(p => ({ ...p, value: e.target.value }))}
                        onBlur={() => updateRequiredDoc(ftIdx, docIdx, editingDoc.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") updateRequiredDoc(ftIdx, docIdx, editingDoc.value);
                          if (e.key === "Escape") setEditingDoc(null);
                        }}
                      />
                    ) : (
                      <span className="text-sm text-gray-700 flex-1 cursor-pointer" onClick={() => setEditingDoc({ ftIdx, docIdx, value: doc })}>{doc}</span>
                    )}
                    {!isEditing && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-indigo-600"
                        onClick={() => setEditingDoc({ ftIdx, docIdx, value: doc })}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                    )}
                    {docIdx > 0 && !isEditing && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-blue-600"
                        onClick={() => moveRequiredDoc(ftIdx, docIdx, "up")}>
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                    )}
                    {docIdx < (ft.required_docs || []).length - 1 && !isEditing && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-gray-400 hover:text-blue-600"
                        onClick={() => moveRequiredDoc(ftIdx, docIdx, "down")}>
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    )}
                    {!isEditing && (
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600"
                        onClick={() => removeRequiredDoc(ftIdx, docIdx)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
                  <div className="flex gap-2 pt-1">
                  <Input
                  className="h-8 text-sm"
                  placeholder="Add required document name..."
                  value={newDocInputs[ftIdx] || ""}
                  onChange={e => setNewDocInputs(p => ({ ...p, [ftIdx]: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") addRequiredDoc(ftIdx); }}
                  />
                  <Button size="sm" variant="outline" className="gap-1" onClick={() => addRequiredDoc(ftIdx)}>
                  <Plus className="w-3 h-3" /> Add
                  </Button>
                  </div>
                  </div>
                  )}
        </div>
      ))}

      <Button variant="outline" className="gap-2 w-full" onClick={addFileType} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Add File Type
      </Button>
    </div>
  );
}