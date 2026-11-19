import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

// Module-level cache — shared across all CategorySelect instances on the page
let _categoriesCache = null;
let _fetchPromise = null;

const fetchCategories = () => {
  if (_categoriesCache) return Promise.resolve(_categoriesCache);
  if (_fetchPromise) return _fetchPromise;
  _fetchPromise = base44.entities.TransactionCategory.list("sort_order", 500)
    .then(cats => {
      _categoriesCache = (cats || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      _fetchPromise = null;
      return _categoriesCache;
    });
  return _fetchPromise;
};
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Loader2, Check, X } from "lucide-react";

export default function CategorySelect({ value, onChange, placeholder = "Select category", className = "", type = null }) {
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState(null); // "parent" or parent_id for subcategory
  const [newCatName, setNewCatName] = useState("");

  const load = async () => {
    // Bust cache after create so the new category is visible
    _categoriesCache = null;
    const cats = await fetchCategories();
    setCategories(cats);
  };

  useEffect(() => {
    fetchCategories().then(cats => setCategories(cats));
  }, []);

  const visibleCategories = type
    ? categories.filter(c => c.type === type || (!c.type && type === "income"))
    : categories;
  const parentCategories = visibleCategories.filter(c => !c.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const getSubcategories = (parentId) => visibleCategories.filter(c => c.parent_id === parentId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const filtered = search.trim() 
    ? visibleCategories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  const exactMatch = categories.find(c => c.name.toLowerCase() === search.trim().toLowerCase());
  const showCreateOption = search.trim() && !exactMatch;

  const handleSelect = (categoryName) => {
    onChange(categoryName);
    setSearch("");
    setOpen(false);
  };

  const handleCreate = async () => {
    const name = (newCatName || search).trim();
    if (!name) return;
    setCreating(true);
    const payload = { name, sort_order: parentCategories.length };
    if (type) payload.type = type;
    if (createMode && createMode !== "parent") {
      payload.parent_id = createMode;
    }
    const created = await base44.entities.TransactionCategory.create(payload);
    await load();
    handleSelect(created.name);
    setCreateMode(null);
    setNewCatName("");
    setCreating(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          className={className}
          placeholder={placeholder}
          value={search || value || ""}
          onChange={(e) => setSearch(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && search.trim()) {
              handleSelect(search.trim());
            }
          }}
          onBlur={() => {
            if (search.trim() && search !== value) {
              handleSelect(search.trim());
            }
          }}
        />
      </PopoverTrigger>
      <PopoverContent className="p-0 w-56" align="start">
        <div className="p-3 space-y-1 max-h-80 overflow-y-auto">
          {/* Show filtered results or grouped categories */}
          {search.trim() ? (
            <>
              {filtered.length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1">Matching</p>
                  {filtered.map(cat => (
                    <button
                      key={cat.id}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 text-sm flex items-center justify-between group"
                      onClick={() => handleSelect(cat.name)}
                    >
                      <span>{cat.name}</span>
                      {value === cat.name && <Check className="w-4 h-4 text-blue-600" />}
                    </button>
                  ))}
                </>
              ) : null}
              
              {showCreateOption && (
                <div className="pt-2 border-t space-y-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-2 py-1">Create</p>
                  <div className="px-2 space-y-2">
                    <button
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 text-sm font-medium text-blue-600 flex items-center gap-1.5"
                      onClick={() => setCreateMode("parent")}
                    >
                      <Plus className="w-3 h-3" /> New Category
                    </button>
                  </div>
                  {parentCategories.length > 0 && (
                    <div className="space-y-1 border-t pt-1">
                      <p className="text-xs text-gray-500 px-2">As sub-category under:</p>
                      {parentCategories.map(parent => (
                        <button
                          key={parent.id}
                          className="w-full text-left px-3 py-1 rounded hover:bg-blue-50 text-xs text-gray-700 flex items-center gap-1"
                          onClick={() => setCreateMode(parent.id)}
                        >
                          ↳ {parent.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              {parentCategories.map(parent => {
                const subs = getSubcategories(parent.id);
                return (
                  <div key={parent.id}>
                    <div className="flex items-center group">
                      <button
                        className="flex-1 text-left px-2 py-1.5 rounded hover:bg-blue-50 text-sm font-medium flex items-center justify-between"
                        onClick={() => handleSelect(parent.name)}
                      >
                        <span>{parent.name}</span>
                        {value === parent.name && <Check className="w-4 h-4 text-blue-600" />}
                      </button>
                      <button
                        title={`Add sub-category under ${parent.name}`}
                        className="ml-1 p-1 rounded hover:bg-blue-100 text-blue-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        onClick={(e) => { e.stopPropagation(); setCreateMode(parent.id); }}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    {subs.map(sub => (
                      <button
                        key={sub.id}
                        className="w-full text-left px-3 py-1 rounded hover:bg-blue-50 text-xs text-gray-700 flex items-center justify-between group"
                        onClick={() => handleSelect(sub.name)}
                      >
                        <span>↳ {sub.name}</span>
                        {value === sub.name && <Check className="w-4 h-4 text-blue-600" />}
                      </button>
                    ))}
                  </div>
                );
              })}
              <div className="border-t mt-2 pt-2">
                <button
                  className="w-full text-left px-2 py-1.5 rounded hover:bg-blue-50 text-sm text-blue-600 font-medium flex items-center gap-1.5"
                  onClick={() => { setCreateMode("parent"); setNewCatName(""); }}
                >
                  <Plus className="w-3 h-3" /> New Category
                </button>
              </div>
            </>
          )}

          {/* Create dialog mode */}
          {createMode && (
            <div className="border-t pt-3 mt-2 space-y-2">
              <p className="text-xs text-gray-600 font-medium">
                {createMode === "parent" ? "New Category" : `Sub-category under "${parentCategories.find(p => p.id === createMode)?.name}"`}
              </p>
              <input
                autoFocus
                className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                placeholder="Category name..."
                value={newCatName || (createMode && search.trim() ? search : "")}
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") { setCreateMode(null); setNewCatName(""); } }}
              />
              <div className="flex gap-2">
                <button
                  className="flex-1 px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium flex items-center justify-center gap-1"
                  onClick={handleCreate}
                  disabled={creating || !(newCatName || search).trim()}
                >
                  {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Create
                </button>
                <button
                  className="px-2 py-1 rounded border hover:bg-gray-50 text-xs"
                  onClick={() => { setCreateMode(null); setNewCatName(""); }}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}