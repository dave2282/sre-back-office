import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

export default function DocOnlyTransactionButton({ onClose, onCreate, loading }) {
  const [showInput, setShowInput] = useState(false);
  const [address, setAddress] = useState("");

  const handleCreate = async () => {
    if (!address.trim()) return;
    await onCreate(address.trim());
    setAddress("");
    setShowInput(false);
  };

  if (showInput) {
    return (
      <div className="w-full p-4 rounded-xl border-2 border-teal-300 bg-teal-50 space-y-3">
        <p className="font-semibold text-teal-800 text-sm">Document File Only</p>
        <Input
          placeholder="Property address..."
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleCreate()}
          autoFocus
        />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => { setShowInput(false); setAddress(""); }} className="flex-1">Cancel</Button>
          <Button size="sm" onClick={handleCreate} disabled={!address.trim() || loading} className="flex-1 bg-teal-600 hover:bg-teal-700 text-white">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create File"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <button
      className="w-full text-left p-4 rounded-xl border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all group"
      onClick={() => setShowInput(true)}
    >
      <p className="font-semibold text-gray-900 group-hover:text-teal-700">Document File Only</p>
      <p className="text-xs text-gray-500 mt-0.5">Create a transaction folder for documents only — no commission tracking</p>
    </button>
  );
}