import { User } from "lucide-react";

export default function ApplyEntryTo({ agents, selectedAgents, toggleAgent, singleSelect = false, required = false }) {
  if (singleSelect) {
    const selected = selectedAgents[0] || "";
    return (
      <div>
        <label className="text-sm font-medium leading-none">
          Agent {required && <span className="text-red-500">*</span>}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 max-h-40 overflow-y-auto border rounded-xl p-3 bg-gray-50">
          {agents.map(a => (
            <button
              key={a.user_email}
              type="button"
              onClick={() => {
                // single select: deselect if already selected, else select only this one
                if (selected === a.user_email) {
                  toggleAgent(a.user_email); // deselect
                } else {
                  // clear all then select this one
                  selectedAgents.forEach(e => { if (e !== a.user_email) toggleAgent(e); });
                  if (!selectedAgents.includes(a.user_email)) toggleAgent(a.user_email);
                }
              }}
              className={`flex items-center gap-2 p-2 border rounded-lg text-sm text-left transition-colors ${selected === a.user_email ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"}`}
            >
              <User className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{a.full_name}</span>
            </button>
          ))}
        </div>
        {required && !selected && (
          <p className="text-xs text-red-500 mt-1">Agent is required</p>
        )}
      </div>
    );
  }

  const allSelected = agents.length > 0 && selectedAgents.length === agents.length;
  const someSelected = selectedAgents.length > 0 && !allSelected;

  return (
    <div className="p-4 bg-gray-50 border rounded-xl space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select Agent</p>
      <div className="flex items-center gap-2 pb-1 border-b border-gray-200">
        <input
          type="checkbox"
          id="select-all-agents"
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected; }}
          onChange={() => {
            if (allSelected) {
              agents.forEach(a => { if (selectedAgents.includes(a.user_email)) toggleAgent(a.user_email); });
            } else {
              agents.forEach(a => { if (!selectedAgents.includes(a.user_email)) toggleAgent(a.user_email); });
            }
          }}
          className="rounded"
        />
        <label htmlFor="select-all-agents" className="text-sm font-medium text-gray-700 cursor-pointer">
          Select All ({agents.length})
        </label>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto">
        {agents.map(a => (
          <label key={a.user_email} className="flex items-center gap-2 p-2 bg-white border rounded-lg cursor-pointer hover:bg-gray-50 text-sm">
            <input type="checkbox" checked={selectedAgents.includes(a.user_email)} onChange={() => toggleAgent(a.user_email)} className="rounded" />
            <span className="truncate">{a.full_name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}