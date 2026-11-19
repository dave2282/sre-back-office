import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, GripVertical } from "lucide-react";

export default function AgentDocumentChecklistManager({ settings, onSaved }) {
  const [docs, setDocs] = useState([]);
  const [newDoc, setNewDoc] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.agent_document_checklist) {
      setDocs(settings.agent_document_checklist);
    }
  }, [settings]);

  const save = async (updated) => {
    setSaving(true);
    if (settings) {
      await base44.entities.BrokerageSettings.update(settings.id, { agent_document_checklist: updated });
      onSaved?.();
    }
    setSaving(false);
  };

  const handleAdd = async () => {
    if (!newDoc.trim()) return;
    const updated = [...docs, newDoc.trim()];
    setDocs(updated);
    setNewDoc("");
    await save(updated);
  };

  const handleDelete = async (idx) => {
    const updated = docs.filter((_, i) => i !== idx);
    setDocs(updated);
    await save(updated);
  };

  const handleRename = async (idx, val) => {
    const updated = docs.map((d, i) => i === idx ? val : d);
    setDocs(updated);
  };

  const handleRenameBlur = async () => {
    await save(docs);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Define the required documents for each agent's file. This list will appear as a checklist in the Document Vault under Agent Records.
      </p>

      {docs.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No documents defined yet. Add your first required document below.</p>
      ) : (
        <div className="space-y-2">
          {docs.map((doc, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 border rounded-lg bg-white">
              <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
              <Input
                value={doc}
                onChange={e => handleRename(i, e.target.value)}
                onBlur={handleRenameBlur}
                className="flex-1 h-8 text-sm border-0 shadow-none focus-visible:ring-0 p-0 bg-transparent"
              />
              <button
                onClick={() => handleDelete(i)}
                className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 flex-shrink-0"
                disabled={saving}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="e.g. Signed Agent Agreement, W-9 Form, ID Copy..."
          value={newDoc}
          onChange={e => setNewDoc(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAdd()}
          className="flex-1"
        />
        <Button size="sm" onClick={handleAdd} disabled={!newDoc.trim() || saving} className="gap-1.5">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add
        </Button>
      </div>
    </div>
  );
}