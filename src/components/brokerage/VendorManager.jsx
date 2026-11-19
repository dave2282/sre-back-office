import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Loader2, Pencil, Check, X } from "lucide-react";
import ListExportImport from "@/components/brokerage/ListExportImport";
import CategorySelect from "@/components/shared/CategorySelect";

export default function VendorManager() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [importStatus, setImportStatus] = useState(null);

  const load = async () => {
    const data = await base44.entities.Vendor.list("name", 500);
    setVendors(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await base44.entities.Vendor.create({
      name: newName.trim(),
      category: newCategory || undefined,
      notes: newNotes || undefined,
      active: true,
    });
    setNewName("");
    setNewCategory("");
    setNewNotes("");
    await load();
    setSaving(false);
  };

  const handleDelete = async (id) => {
    setSaving(true);
    await base44.entities.Vendor.delete(id);
    await load();
    setSaving(false);
  };

  const startEdit = (vendor) => {
    setEditingId(vendor.id);
    setEditForm({ name: vendor.name, category: vendor.category || "", notes: vendor.notes || "" });
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    await base44.entities.Vendor.update(editingId, {
      name: editForm.name,
      category: editForm.category || undefined,
      notes: editForm.notes || undefined,
    });
    setEditingId(null);
    await load();
    setSaving(false);
  };

  const handleImport = async (imported) => {
    setImportStatus(null);
    if (!Array.isArray(imported) || imported.length === 0) {
      setImportStatus({ type: 'error', msg: 'No valid data found in the file.' });
      return;
    }
    setSaving(true);
    const existingNames = new Set(vendors.map(v => v.name.toLowerCase()));
    const toAdd = imported.filter(v => v.name && !existingNames.has(v.name.toLowerCase()));
    const skipped = imported.length - toAdd.length;
    for (const v of toAdd) {
      const { id, created_date, updated_date, created_by, ...fields } = v;
      await base44.entities.Vendor.create({ ...fields, active: true });
    }
    await load();
    setSaving(false);
    if (toAdd.length === 0) {
      setImportStatus({ type: 'warn', msg: `All ${skipped} item${skipped !== 1 ? 's' : ''} were skipped — names already exist.` });
    } else {
      setImportStatus({ type: 'success', msg: `${toAdd.length} vendor${toAdd.length !== 1 ? 's' : ''} imported successfully${skipped > 0 ? `, ${skipped} skipped (duplicates)` : ''}.` });
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  if (loading) return <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <ListExportImport data={vendors} onImport={handleImport} filename="vendors" />
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
      {/* Add New Vendor */}
      <div className="p-4 bg-gray-50 border rounded-lg space-y-3">
        <p className="text-sm font-semibold text-gray-700">Add New Vendor</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Vendor Name <span className="text-red-500">*</span></Label>
            <Input
              className="mt-1"
              placeholder="e.g. Office Depot"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
          </div>
          <div>
            <Label className="text-xs">Default Category</Label>
            <CategorySelect
              className="mt-1"
              type="expense"
              value={newCategory}
              onChange={setNewCategory}
              placeholder="Select category (optional)"
            />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input
              className="mt-1"
              placeholder="Optional notes"
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
            />
          </div>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || saving} className="gap-1.5">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Vendor
        </Button>
      </div>

      {/* Vendor List */}
      {vendors.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-6">No vendors yet. Add one above.</p>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_1fr_1fr_80px] px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Vendor Name</span>
            <span>Default Category</span>
            <span>Notes</span>
            <span></span>
          </div>
          {vendors.map(v => (
            <div key={v.id} className="border-b last:border-0">
              {editingId === v.id ? (
                <div className="grid grid-cols-[1fr_1fr_1fr_80px] px-4 py-2 items-center gap-2">
                  <Input
                    className="h-8 text-sm"
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                  />
                  <CategorySelect
                    className="h-8"
                    type="expense"
                    value={editForm.category}
                    onChange={v => setEditForm(f => ({ ...f, category: v }))}
                    placeholder="Category"
                  />
                  <Input
                    className="h-8 text-sm"
                    value={editForm.notes}
                    onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Notes"
                  />
                  <div className="flex gap-1">
                    <Button size="icon" className="h-7 w-7" onClick={handleSaveEdit} disabled={saving}>
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setEditingId(null)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_1fr_1fr_80px] px-4 py-2.5 items-center hover:bg-gray-50 transition-colors">
                  <span className="text-sm font-medium text-gray-900">{v.name}</span>
                  <span className="text-sm text-gray-500">{v.category || <span className="text-gray-300">—</span>}</span>
                  <span className="text-sm text-gray-400 truncate">{v.notes || <span className="text-gray-300">—</span>}</span>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(v)}>
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(v.id)} disabled={saving}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}