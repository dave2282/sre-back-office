import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Filter, X } from "lucide-react";

export default function FilterButton({ filters, onFiltersChange, filterOptions }) {
  const [open, setOpen] = useState(false);

  const toggleFilter = (key, value) => {
    const current = filters[key] || [];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onFiltersChange({ ...filters, [key]: updated.length > 0 ? updated : undefined });
  };

  // Support both plain strings and {value, label} objects
  const getVal = (v) => (typeof v === "object" && v !== null ? v.value : v);
  const getLabel = (v) => (typeof v === "object" && v !== null ? v.label : v);

  const hasActiveFilters = Object.values(filters).some(v => v && v.length > 0);
  const activeCount = Object.values(filters).reduce((sum, v) => sum + (v?.length || 0), 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          className={`gap-2 ${hasActiveFilters ? "border-blue-300 bg-blue-50" : ""}`}
        >
          <Filter className="w-4 h-4" />
          Filter
          {hasActiveFilters && <span className="text-xs font-semibold text-blue-600">({activeCount})</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align="start">
        <div className="p-3 space-y-3 max-h-96 overflow-y-auto">
          {Object.entries(filterOptions).map(([key, values]) => (
            <div key={key}>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">{key}</p>
              <div className="space-y-1.5">
                {values.map(value => (
                  <div key={getVal(value)} className="flex items-center gap-2">
                    <Checkbox
                      id={`filter-${key}-${getVal(value)}`}
                      checked={(filters[key] || []).includes(getVal(value))}
                      onCheckedChange={() => toggleFilter(key, getVal(value))}
                    />
                    <label htmlFor={`filter-${key}-${getVal(value)}`} className="text-sm cursor-pointer flex-1">
                      {getLabel(value)}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {hasActiveFilters && (
            <button
              className="w-full text-xs text-blue-600 hover:text-blue-700 font-medium mt-3 pt-3 border-t"
              onClick={() => { onFiltersChange({}); setOpen(false); }}
            >
              <X className="w-3 h-3 inline mr-1" /> Clear All
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}