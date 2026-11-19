import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Plus, Store, Loader2 } from "lucide-react";

export default function VendorSelect({ value, onChange, onCategoryHint, placeholder = "Description / Vendor", className = "" }) {
  const [vendors, setVendors] = useState([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    base44.entities.Vendor.filter({ active: true }).then(data => setVendors(data || []));
  }, []);

  // Sync external value changes
  useEffect(() => {
    setSearch(value || "");
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = search.trim()
    ? vendors.filter(v => v.name.toLowerCase().includes(search.toLowerCase()))
    : vendors;

  const exactMatch = vendors.find(v => v.name.toLowerCase() === search.trim().toLowerCase());

  const handleSelect = (vendor) => {
    setSearch(vendor.name);
    onChange(vendor.name);
    if (onCategoryHint && vendor.category) {
      onCategoryHint(vendor.category);
    }
    setOpen(false);
  };

  const handleInputChange = (e) => {
    setSearch(e.target.value);
    onChange(e.target.value);
    setOpen(true);
  };

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 150);
  };

  const handleAddVendor = async () => {
    if (!search.trim()) return;
    setSaving(true);
    const created = await base44.entities.Vendor.create({ name: search.trim(), active: true });
    setVendors(prev => [...prev, created]);
    onChange(created.name);
    setOpen(false);
    setSaving(false);
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <Input
        value={search}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
      />
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {filtered.length === 0 && !search.trim() && (
            <p className="text-xs text-gray-400 px-3 py-2">No vendors saved yet.</p>
          )}
          {filtered.map(v => (
            <button
              key={v.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors"
              onMouseDown={() => handleSelect(v)}
            >
              <p className="text-sm font-medium text-gray-900">{v.name}</p>
              {v.category && <p className="text-xs text-gray-400">{v.category}</p>}
            </button>
          ))}
          {search.trim() && !exactMatch && (
            <div className="border-t">
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-green-50 text-green-700 text-sm flex items-center gap-1.5"
                onMouseDown={() => { onChange(search.trim()); setOpen(false); }}
              >
                <Plus className="w-3 h-3" /> Use "{search.trim()}"
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-blue-700 text-sm flex items-center gap-1.5 border-t"
                onMouseDown={handleAddVendor}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Store className="w-3 h-3" />}
                Save "{search.trim()}" as new vendor
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}