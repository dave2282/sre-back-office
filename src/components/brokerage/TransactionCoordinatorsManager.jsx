import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Loader2 } from "lucide-react";

export default function TransactionCoordinatorsManager({ settings, onSaved }) {
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const coordinators = settings?.transaction_coordinators || [];

  useEffect(() => {
    const loadAgents = async () => {
      const ags = await base44.entities.Agent.list("-created_date", 500);
      setAgents(ags || []);
      setLoading(false);
    };
    loadAgents();
  }, []);

  const handleAdd = async () => {
    if (!selectedAgent) return;
    const agent = agents.find(a => a.user_email === selectedAgent);
    if (!agent) return;

    const alreadyAdded = coordinators.some(c => c.email === selectedAgent);
    if (alreadyAdded) return;

    setSaving(true);
    const updated = [...coordinators, { email: agent.user_email, full_name: agent.full_name }];
    await base44.entities.BrokerageSettings.update(settings.id, { transaction_coordinators: updated });
    setSelectedAgent("");
    setSaving(false);
    onSaved?.();
    setTimeout(() => window.location.reload(), 100);
  };

  const handleDelete = async (idx) => {
    setSaving(true);
    const updated = coordinators.filter((_, i) => i !== idx);
    await base44.entities.BrokerageSettings.update(settings.id, { transaction_coordinators: updated });
    onSaved?.();
    setSaving(false);
  };

  if (loading) return <div className="text-center py-4"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>;

  const usedEmails = new Set(coordinators.map(c => c.email));

  return (
    <div className="space-y-3">
      <div className="p-4 bg-gray-50 border rounded-lg space-y-3">
        <p className="text-sm font-semibold text-gray-700">Add Transaction Coordinator</p>
        <div className="flex gap-3">
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select an agent..." />
            </SelectTrigger>
            <SelectContent>
              {agents.filter(a => !usedEmails.has(a.user_email)).map(agent => (
                <SelectItem key={agent.id} value={agent.user_email}>
                  {agent.full_name} ({agent.user_email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={handleAdd} disabled={!selectedAgent || saving} className="gap-1.5 flex-shrink-0">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </Button>
        </div>
      </div>

      {coordinators.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-4">No transaction coordinators designated yet.</p>
      ) : (
        <div className="space-y-2">
          {coordinators.map((coordinator, idx) => (
            <div key={idx} className="p-3 border rounded-lg bg-white flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{coordinator.full_name}</p>
                <p className="text-xs text-gray-500 truncate">{coordinator.email}</p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 flex-shrink-0 ml-3"
                onClick={() => handleDelete(idx)}
                disabled={saving}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}