import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";

/**
 * Reusable export/import buttons for any JSON-serializable list.
 * - Export: downloads data as a .json file
 * - Import: reads a .json file and calls onImport(parsedArray)
 */
export default function ListExportImport({ data, onImport, filename = "export" }) {
  const fileRef = useRef(null);

  const handleExport = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const parsed = JSON.parse(ev.target.result);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      onImport(arr);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={handleExport}>
        <Download className="w-3.5 h-3.5" /> Export
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5 h-8 text-xs" onClick={() => fileRef.current?.click()}>
        <Upload className="w-3.5 h-3.5" /> Import
      </Button>
      <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
    </div>
  );
}