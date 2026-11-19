import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, ChevronDown, ChevronUp, GripVertical, Check, X } from "lucide-react";
import ListExportImport from "@/components/brokerage/ListExportImport";

function CategorySection({ title, type, categories, saving, setSaving, onReload, expandedId, setExpandedId, editingId, setEditingId, setCategories }) {
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(type === "expense" ? "#ef4444" : "#6b7280");
  const [addingSubFor, setAddingSubFor] = useState(null); // parent id
  const [newSubName, setNewSubName] = useState("");
  const [newSubColor, setNewSubColor] = useState(type === "expense" ? "#ef4444" : "#6b7280");

  const parentCategories = categories
    .filter(c => !c.parent_id && c.active !== false && (c.type === type || (!c.type && type === "income")))
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const getSubcategories = (parentId) =>
    categories.filter(c => c.parent_id === parentId && c.active !== false)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const handleAdd = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    await base44.entities.TransactionCategory.create({
      name: newName,
      color: newColor,
      sort_order: parentCategories.length,
      type,
    });
    setNewName("");
    setNewColor(type === "expense" ? "#ef4444" : "#6b7280");
    await onReload();
    setSaving(false);
  };

  const handleUpdate = async (id, updates) => {
    setSaving(true);
    await base44.entities.TransactionCategory.update(id, updates);
    await onReload();
    setEditingId(null);
    setSaving(false);
  };

  const handleDelete = async (id) => {
    const catName = categories.find(c => c.id === id)?.name;
    const used = await base44.entities.AccountingEntry.filter({ category: catName });
    if (used && used.length > 0) {
      alert(`Cannot delete "${catName}" - it is used by ${used.length} accounting record(s). Make it inactive instead.`);
      return;
    }
    setSaving(true);
    await base44.entities.TransactionCategory.delete(id);
    await onReload();
    setSaving(false);
  };

  const handleAddSub = async (parentId) => {
    if (!newSubName.trim()) return;
    setSaving(true);
    await base44.entities.TransactionCategory.create({
      name: newSubName.trim(),
      color: newSubColor,
      parent_id: parentId,
      type,
      sort_order: getSubcategories(parentId).length,
    });
    setNewSubName("");
    setNewSubColor(type === "expense" ? "#ef4444" : "#6b7280");
    setAddingSubFor(null);
    setExpandedId(parentId);
    await onReload();
    setSaving(false);
  };

  const handleToggleActive = async (id, active) => {
    setSaving(true);
    await base44.entities.TransactionCategory.update(id, { active: !active });
    await onReload();
    setSaving(false);
  };

  const handleDragStart = (e, fromIdx, isParent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("fromIdx", fromIdx);
    e.dataTransfer.setData("isParent", isParent);
  };

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };

  const handleDrop = async (e, toIdx, isParentTarget) => {
    e.preventDefault();
    const fromIdx = parseInt(e.dataTransfer.getData("fromIdx"));
    const fromIsParent = e.dataTransfer.getData("isParent") === "true";
    if (fromIsParent !== isParentTarget || fromIdx === toIdx) return;
    const list = isParentTarget ? parentCategories : getSubcategories(expandedId);
    if (fromIdx < 0 || fromIdx >= list.length || toIdx < 0 || toIdx >= list.length) return;
    setSaving(true);
    const reordered = [...list];
    const [item] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, item);
    await Promise.all(reordered.map((cat, idx) =>
      base44.entities.TransactionCategory.update(cat.id, { sort_order: idx })
    ));
    await onReload();
    setSaving(false);
  };

  const accentColor = type === "expense" ? "bg-red-50 border-red-200 text-red-900" : "bg-green-50 border-green-200 text-green-900";
  const headerColor = type === "expense" ? "text-red-700" : "text-green-700";

  return (
    <div className="space-y-3">
      <div className={`p-3 rounded-lg border ${accentColor}`}>
        <p className={`text-sm font-semibold ${headerColor}`}>{title}</p>
      </div>

      {/* Add New */}
      <div className="p-4 bg-gray-50 border rounded-lg space-y-3">
        <p className="text-sm font-semibold text-gray-700">Add New {type === "expense" ? "Expense" : "Income"} Category</p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="sm:col-span-2">
            <Input
              placeholder="Category name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              className="w-10 h-9 rounded border-0 cursor-pointer"
            />
            <span className="text-xs text-gray-500 font-mono">{newColor}</span>
          </div>
          <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </Button>
        </div>
      </div>

      {/* List */}
      {parentCategories.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-4">No {type} categories yet.</p>
      ) : (
        <div className="space-y-2">
          {parentCategories.map((parent, idx) => {
            const subs = getSubcategories(parent.id);
            const isExpanded = expandedId === parent.id;

            return (
              <div
                key={parent.id}
                className="border rounded-lg overflow-hidden bg-white"
                draggable
                onDragStart={e => handleDragStart(e, idx, true)}
                onDragOver={handleDragOver}
                onDrop={e => handleDrop(e, idx, true)}
              >
                <div
                  className="p-4 flex items-center justify-between hover:bg-gray-50 cursor-pointer transition-colors group"
                  onClick={() => setExpandedId(isExpanded ? null : parent.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
                    {editingId === parent.id ? (
                      <div className="flex gap-2 flex-1" onClick={e => e.stopPropagation()}>
                        <Input
                          className="flex-1"
                          value={parent.name}
                          onChange={e => {
                            const updated = [...categories];
                            const i = updated.findIndex(c => c.id === parent.id);
                            updated[i] = { ...updated[i], name: e.target.value };
                            setCategories(updated);
                          }}
                        />
                        <input
                          type="color"
                          value={parent.color || "#6b7280"}
                          onChange={e => {
                            const updated = [...categories];
                            const i = updated.findIndex(c => c.id === parent.id);
                            updated[i] = { ...updated[i], color: e.target.value };
                            setCategories(updated);
                          }}
                          className="w-10 h-9 rounded border-0 cursor-pointer"
                        />
                        <Button size="sm" onClick={e => { e.stopPropagation(); handleUpdate(parent.id, { name: parent.name, color: parent.color }); }} disabled={saving}>Save</Button>
                        <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); setEditingId(null); }}>Cancel</Button>
                      </div>
                    ) : (
                      <>
                        <div className="w-6 h-6 rounded-lg flex-shrink-0 border" style={{ backgroundColor: parent.color || "#6b7280" }} />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">{parent.name}</p>
                          {subs.length > 0 && <p className="text-xs text-gray-400">{subs.length} sub-categories</p>}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-3" onClick={e => e.stopPropagation()}>
                    {editingId !== parent.id && (
                      <>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-400 hover:text-blue-600 hover:bg-blue-50" title="Add sub-category" onClick={e => { e.stopPropagation(); setAddingSubFor(parent.id); setNewSubName(""); setExpandedId(parent.id); }}>
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title={parent.active === false ? "Activate" : "Deactivate"} onClick={e => { e.stopPropagation(); handleToggleActive(parent.id, parent.active); }}>
                          {parent.active === false ? "✓" : "✕"}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); setEditingId(parent.id); }}>✏️</Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={e => { e.stopPropagation(); handleDelete(parent.id); }} disabled={saving}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {(subs.length > 0 || addingSubFor === parent.id) && (isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />)}
                  </div>
                </div>

                {isExpanded && (subs.length > 0 || addingSubFor === parent.id) && (
                  <div className="border-t bg-gray-50 divide-y">
                    {subs.map((sub, subIdx) => (
                      <div
                        key={sub.id}
                        className="p-3 pl-8 flex items-center justify-between hover:bg-white transition-colors group"
                        draggable
                        onDragStart={e => handleDragStart(e, subIdx, false)}
                        onDragOver={handleDragOver}
                        onDrop={e => handleDrop(e, subIdx, false)}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <GripVertical className="w-3 h-3 text-gray-300 group-hover:text-gray-400 flex-shrink-0" />
                          <div className="w-4 h-4 rounded-lg flex-shrink-0" style={{ backgroundColor: sub.color || "#6b7280" }} />
                          <p className="text-sm text-gray-700 truncate">↳ {sub.name}</p>
                        </div>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(sub.id)} disabled={saving}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {addingSubFor === parent.id && (
                      <div className="p-3 pl-8 flex items-center gap-2 bg-blue-50">
                        <div className="w-4 h-4 rounded-lg flex-shrink-0 text-gray-400 flex items-center justify-center text-xs">↳</div>
                        <Input
                          autoFocus
                          className="flex-1 h-8 text-sm"
                          placeholder="Sub-category name..."
                          value={newSubName}
                          onChange={e => setNewSubName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") handleAddSub(parent.id); if (e.key === "Escape") { setAddingSubFor(null); setNewSubName(""); } }}
                        />
                        <input
                          type="color"
                          value={newSubColor}
                          onChange={e => setNewSubColor(e.target.value)}
                          className="w-8 h-8 rounded border-0 cursor-pointer flex-shrink-0"
                        />
                        <Button size="icon" className="h-8 w-8 bg-blue-600 hover:bg-blue-700" onClick={() => handleAddSub(parent.id)} disabled={saving || !newSubName.trim()}>
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setAddingSubFor(null); setNewSubName(""); }}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const DEFAULT_INCOME_CATEGORIES = [
  { name: "Commission Income", color: "#16a34a" },
  { name: "Referral Fee Income", color: "#0ea5e9" },
  { name: "Desk Fee Income", color: "#f59e0b" },
  { name: "Transaction Fee Income", color: "#8b5cf6" },
  { name: "Bonus Income", color: "#ec4899" },
  { name: "Rental Income", color: "#14b8a6" },
  { name: "Property Management Income", color: "#6366f1" },
  { name: "Miscellaneous Income", color: "#6b7280" },
];

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Marketing & Advertising", color: "#ef4444" },
  { name: "Office Supplies", color: "#f97316" },
  { name: "Technology & Software", color: "#eab308" },
  { name: "Professional Development", color: "#84cc16" },
  { name: "Licensing & Dues", color: "#06b6d4" },
  { name: "Vehicle & Travel", color: "#3b82f6" },
  { name: "Meals & Entertainment", color: "#a855f7" },
  { name: "Insurance", color: "#f43f5e" },
  { name: "Phone & Internet", color: "#10b981" },
  { name: "Referral Fees Paid", color: "#0891b2" },
  { name: "Desk Fees Paid", color: "#d97706" },
  { name: "Miscellaneous Expense", color: "#6b7280" },
];

export default function CategoryManager() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [importStatus, setImportStatus] = useState(null);

  const load = async () => {
    const cats = await base44.entities.TransactionCategory.list("sort_order", 500);
    setCategories((cats || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    setLoading(false);
  };

  const seedDefaults = async (cats) => {
    setSeeding(true);
    const existing = cats || categories;
    const existingNames = new Set(existing.map(c => c.name.toLowerCase()));
    const toCreate = [
      ...DEFAULT_INCOME_CATEGORIES.filter(c => !existingNames.has(c.name.toLowerCase())).map((c, i) => ({ ...c, type: "income", sort_order: i })),
      ...DEFAULT_EXPENSE_CATEGORIES.filter(c => !existingNames.has(c.name.toLowerCase())).map((c, i) => ({ ...c, type: "expense", sort_order: i })),
    ];
    for (const cat of toCreate) {
      await base44.entities.TransactionCategory.create(cat);
    }
    await load();
    setSeeding(false);
  };

  useEffect(() => {
    base44.entities.TransactionCategory.list("sort_order", 500).then(cats => {
      const sorted = (cats || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      setCategories(sorted);
      setLoading(false);
      // Auto-seed if no categories exist yet
      if (sorted.length === 0) {
        seedDefaults(sorted);
      }
    });
  }, []);

  if (loading || seeding) return <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /><p className="text-xs text-gray-400 mt-2">{seeding ? "Loading default categories..." : ""}</p></div>;

  const sharedProps = { categories, saving, setSaving, onReload: load, expandedId, setExpandedId, editingId, setEditingId, setCategories };

  const handleImportCategories = async (imported) => {
    setImportStatus(null);
    if (!Array.isArray(imported) || imported.length === 0) {
      setImportStatus({ type: 'error', msg: 'No valid data found in the file.' });
      return;
    }
    setSeeding(true);
    const existingNames = new Set(categories.map(c => c.name.toLowerCase()));
    const toAdd = imported.filter(cat => cat.name && !existingNames.has(cat.name.toLowerCase()));
    const skipped = imported.length - toAdd.length;
    for (const cat of toAdd) {
      const { id, created_date, updated_date, created_by, ...fields } = cat;
      await base44.entities.TransactionCategory.create(fields);
    }
    await load();
    setSeeding(false);
    if (toAdd.length === 0) {
      setImportStatus({ type: 'warn', msg: `All ${skipped} item${skipped !== 1 ? 's' : ''} were skipped — names already exist.` });
    } else {
      setImportStatus({ type: 'success', msg: `${toAdd.length} categor${toAdd.length !== 1 ? 'ies' : 'y'} imported successfully${skipped > 0 ? `, ${skipped} skipped (duplicates)` : ''}.` });
      setTimeout(() => setImportStatus(null), 5000);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Manage income and expense categories used in Accounting. You can add, edit, delete, or reorder them.</p>
        <div className="flex items-center gap-2">
          <ListExportImport data={categories} onImport={handleImportCategories} filename="transaction_categories" />
          <Button variant="outline" size="sm" className="gap-1.5 flex-shrink-0" onClick={() => seedDefaults()} disabled={seeding}>
            {seeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Restore Defaults
          </Button>
        </div>
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
      <CategorySection title="Income Categories" type="income" {...sharedProps} />
      <div className="border-t pt-6">
        <CategorySection title="Expense Categories" type="expense" {...sharedProps} />
      </div>
    </div>
  );
}