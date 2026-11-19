import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, X } from "lucide-react";

export default function CommissionForm({ plan, index, onSave, onCancel, onDelete }) {
  const [form, setForm] = useState(plan);

  const handleSave = () => {
    if (!form.name) return;
    onSave(index, form);
  };

  return (
    <div className="p-4 border rounded-xl bg-gray-50 space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <Label className="text-xs">Plan Name</Label>
          <Input className="mt-1" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. 70/30 Split" />
        </div>
        <div className="w-40">
          <Label className="text-xs">Plan Type</Label>
          <Select value={form.type || "commission"} onValueChange={v => setForm({ ...form, type: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="commission">Commission Split</SelectItem>
              <SelectItem value="flat_fee">Flat Fee</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {form.type === "flat_fee" ? (
        <div className="max-w-xs">
          <Label className="text-xs">Flat Fee Amount ($)</Label>
          <Input type="number" className="mt-1" value={form.flat_fee_amount ?? ""} onChange={e => setForm({ ...form, flat_fee_amount: parseFloat(e.target.value) || 0 })} placeholder="500" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 max-w-sm">
          <div>
            <Label className="text-xs">Agent Split %</Label>
            <Input type="number" className="mt-1" value={form.agent_split ?? ""} onChange={e => setForm({ ...form, agent_split: parseFloat(e.target.value) || 0 })} placeholder="70" />
          </div>
          <div>
            <Label className="text-xs">Office Split %</Label>
            <Input type="number" className="mt-1" value={form.office_split ?? ""} onChange={e => setForm({ ...form, office_split: parseFloat(e.target.value) || 0 })} placeholder="30" />
          </div>
        </div>
      )}
      <div className="flex gap-2 pt-2">
        <Button size="sm" className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleSave} disabled={!form.name}>
          <Save className="w-4 h-4" /> Save Plan
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>Cancel</Button>
        {index !== -1 && (
          <Button size="sm" variant="outline" className="text-red-600 border-red-300 hover:bg-red-50 ml-auto" onClick={() => onDelete(index)}>
            <X className="w-4 h-4" /> Delete
          </Button>
        )}
      </div>
    </div>
  );
}