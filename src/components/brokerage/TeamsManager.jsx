import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2 } from "lucide-react";

export default function TeamsManager({ settings, onSaved }) {
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamNotes, setNewTeamNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const teams = settings?.teams || [];

  const handleAdd = async () => {
    if (!newTeamName.trim()) return;
    setSaving(true);
    const updated = [...teams, { name: newTeamName.trim(), notes: newTeamNotes.trim() }];
    await base44.entities.BrokerageSettings.update(settings.id, { teams: updated });
    setNewTeamName("");
    setNewTeamNotes("");
    onSaved?.();
    setSaving(false);
  };

  const handleDelete = async (idx) => {
    setSaving(true);
    const updated = teams.filter((_, i) => i !== idx);
    await base44.entities.BrokerageSettings.update(settings.id, { teams: updated });
    onSaved?.();
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      <div className="p-4 bg-gray-50 border rounded-lg space-y-3">
        <p className="text-sm font-semibold text-gray-700">Add New Team</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input
            placeholder="Team name"
            value={newTeamName}
            onChange={e => setNewTeamName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <Input
            placeholder="Notes (optional)"
            value={newTeamNotes}
            onChange={e => setNewTeamNotes(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
          />
          <Button size="sm" onClick={handleAdd} disabled={!newTeamName.trim() || saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add
          </Button>
        </div>
      </div>

      {teams.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-4">No teams yet.</p>
      ) : (
        <div className="space-y-2">
          {teams.map((team, idx) => (
            <div key={idx} className="p-3 border rounded-lg bg-white flex items-center justify-between">
              <div className="min-w-0">
                <p className="font-medium text-gray-900">{team.name}</p>
                {team.notes && <p className="text-xs text-gray-500 mt-0.5">{team.notes}</p>}
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