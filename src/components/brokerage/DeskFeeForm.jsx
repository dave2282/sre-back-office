import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, X } from "lucide-react";

export default function DeskFeeForm({ plan, index, onSave, onCancel, onDelete }) {
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
          <Input className="mt-1" value={form.name || ""} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Standard Desk Fee" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Amount ($)</Label>
          <Input type="number" className="mt-1" value={form.amount ?? ""} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} placeholder="500" />
        </div>
        <div>
          <Label className="text-xs">Frequency</Label>
          <Select value={form.frequency || "monthly"} onValueChange={v => setForm({ ...form, frequency: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="annually">Annually</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label className="text-xs">Notes (optional)</Label>
        <Input className="mt-1" value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Any additional details..." />
      </div>
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