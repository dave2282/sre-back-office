import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, X } from "lucide-react";

export default function MultiSelectFilter({ label, options, selected = [], onChange }) {
  const [open, setOpen] = useState(false);

  const toggle = (value) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  const selectAll = () => onChange([...options]);
  const clearAll = () => onChange([]);

  const allSelected = options.length > 0 && selected.length === options.length;
  const hasActive = selected.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`gap-1.5 min-w-[130px] justify-between ${hasActive ? "border-blue-300 bg-blue-50 text-blue-700" : ""}`}
        >
          <span className="truncate text-sm">
            {hasActive ? `${label} (${selected.length})` : label}
          </span>
          <ChevronDown className="w-3.5 h-3.5 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <div className="p-2 border-b flex items-center justify-between">
          <button
            className="text-xs font-medium text-blue-600 hover:text-blue-800"
            onClick={allSelected ? clearAll : selectAll}
          >
            {allSelected ? "Deselect All" : "Select All"}
          </button>
          {hasActive && (
            <button
              className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-0.5"
              onClick={clearAll}
            >
              <X className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
        <div className="p-2 space-y-1 max-h-64 overflow-y-auto">
          {options.map(opt => (
            <div key={opt} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer" onClick={() => toggle(opt)}>
              <Checkbox
                id={`filter-${label}-${opt}`}
                checked={selected.includes(opt)}
                onCheckedChange={() => toggle(opt)}
              />
              <label htmlFor={`filter-${label}-${opt}`} className="text-sm cursor-pointer flex-1 capitalize">
                {opt.replace(/_/g, " ")}
              </label>
            </div>
          ))}
          {options.length === 0 && (
            <p className="text-xs text-gray-400 px-1 py-2 italic">No options available</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}