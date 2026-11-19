import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function RecurringBlock({ enabled, setEnabled, frequency, setFrequency, startDate, setStartDate, endDate, setEndDate }) {
  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
      <div className="flex items-center gap-2">
        <Checkbox id="recurring" checked={enabled} onCheckedChange={setEnabled} />
        <label htmlFor="recurring" className="text-sm font-medium text-gray-700 cursor-pointer">
          Make this entry recurring
        </label>
      </div>
      {enabled && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Frequency</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Start Date</Label>
            <Input type="date" className="mt-1 h-8 text-sm" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">End Date (leave empty for 1 year)</Label>
            <Input type="date" className="mt-1 h-8 text-sm" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
      )}
    </div>
  );
}