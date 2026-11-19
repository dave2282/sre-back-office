import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, Loader2 } from "lucide-react";

const FILE_STATUS_STYLES = {
  under_review: "bg-blue-100 text-blue-700",
  missing_docs: "bg-orange-100 text-orange-700",
  completed: "bg-green-100 text-green-700",
};
const FILE_STATUS_LABELS = {
  under_review: "Under Review",
  missing_docs: "Missing Docs",
  completed: "Completed",
};

export default function TransactionSearchSelect({ transactions, docs = [], value, onChange, onNewTransaction, isCreatingTransaction = false, agents = [] }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTxnForm, setNewTxnForm] = useState({ property_address: "", agent_name: "" });
  const [showAgentSuggest, setShowAgentSuggest] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Get the file status for a transaction based on its docs
  const getFileStatus = (txnId) => {
    const txnDocs = docs.filter(d => d.transaction_id === txnId);
    return txnDocs[0]?.status || null;
  };

  // Default: show last 15 transactions newest first; when searching: show all matches
  const filtered = search.trim()
    ? transactions.filter(t =>
        t.property_address?.toLowerCase().includes(search.toLowerCase()) ||
        t.agent_name?.toLowerCase().includes(search.toLowerCase())
      )
    : [...transactions].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)).slice(0, 15);

  const selectedTxn = transactions.find(t => t.id === value);

  const handleSelect = (txn) => {
    onChange(txn.id);
    setSearch("");
    setOpen(false);
  };

  const handleCreateNew = async () => {
    if (!newTxnForm.property_address.trim()) return;
    setCreating(true);
    const created = await onNewTransaction(newTxnForm);
    if (created) {
      handleSelect(created);
      setNewTxnForm({ property_address: "", agent_name: "" });
    }
    setCreating(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={selectedTxn ? `${selectedTxn.property_address} · ${selectedTxn.agent_name || selectedTxn.agent_email}` : search}
        onChange={(e) => {
          setSearch(e.target.value);
          onChange(null);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search existing transaction or create new"
      />

      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {!search.trim() && filtered.length === 0 ? (
            <p className="text-xs text-gray-400 px-3 py-2 italic">No active files under review. Start typing to search all transactions.</p>
          ) : search.trim() && filtered.length === 0 ? (
            <div className="p-3 space-y-2">
              <p className="text-xs text-gray-500 font-medium">Create New Transaction</p>
              <div className="space-y-2">
                <Input
                  placeholder="Property Address *"
                  value={newTxnForm.property_address}
                  onChange={(e) => setNewTxnForm(p => ({ ...p, property_address: e.target.value }))}
                  className="text-sm"
                />
                <div className="relative">
                  <Input
                    placeholder="Agent Name *"
                    value={newTxnForm.agent_name}
                    onChange={(e) => { setNewTxnForm(p => ({ ...p, agent_name: e.target.value })); setShowAgentSuggest(true); }}
                    onFocus={() => setShowAgentSuggest(true)}
                    onBlur={() => setTimeout(() => setShowAgentSuggest(false), 150)}
                    className="text-sm"
                  />
                  {showAgentSuggest && newTxnForm.agent_name && agents.filter(a => a.full_name?.toLowerCase().includes(newTxnForm.agent_name.toLowerCase())).length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-32 overflow-y-auto">
                      {agents.filter(a => a.full_name?.toLowerCase().includes(newTxnForm.agent_name.toLowerCase())).map(agent => (
                        <button key={agent.id} type="button" className="w-full text-left px-3 py-1.5 hover:bg-blue-50 border-b last:border-0 text-sm"
                          onMouseDown={() => { setNewTxnForm(p => ({ ...p, agent_name: agent.full_name })); setShowAgentSuggest(false); }}>
                          {agent.full_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={handleCreateNew}
                  disabled={creating || !newTxnForm.property_address.trim() || !newTxnForm.agent_name.trim() || isCreatingTransaction}
                >
                  {creating || isCreatingTransaction ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Create Transaction
                </Button>
              </div>
            </div>
          ) : filtered.length > 0 ? (
            <>
              {!search.trim() && (
                <p className="text-xs text-gray-500 font-semibold px-3 pt-2 pb-1 uppercase tracking-wide">Recent Transactions</p>
              )}
              {filtered.map(t => {
                const fileStatus = getFileStatus(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-0 transition-colors"
                    onMouseDown={() => handleSelect(t)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.property_address}</p>
                      {fileStatus && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${FILE_STATUS_STYLES[fileStatus] || "bg-gray-100 text-gray-600"}`}>
                          {FILE_STATUS_LABELS[fileStatus] || fileStatus}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{t.agent_name || t.agent_email} · {t.closing_date || "No date"}</p>
                  </button>
                );
              })}
              {search.trim() && (
                <div className="border-t p-3">
                  <p className="text-xs text-gray-500 font-medium mb-2">Create New Transaction</p>
                  <div className="space-y-2">
                    <Input
                      placeholder="Property Address *"
                      value={newTxnForm.property_address}
                      onChange={(e) => setNewTxnForm(p => ({ ...p, property_address: e.target.value }))}
                      className="text-sm"
                    />
                    <div className="relative">
                      <Input
                        placeholder="Agent Name *"
                        value={newTxnForm.agent_name}
                        onChange={(e) => { setNewTxnForm(p => ({ ...p, agent_name: e.target.value })); setShowAgentSuggest(true); }}
                        onFocus={() => setShowAgentSuggest(true)}
                        onBlur={() => setTimeout(() => setShowAgentSuggest(false), 150)}
                        className="text-sm"
                      />
                      {showAgentSuggest && newTxnForm.agent_name && agents.filter(a => a.full_name?.toLowerCase().includes(newTxnForm.agent_name.toLowerCase())).length > 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg max-h-32 overflow-y-auto">
                          {agents.filter(a => a.full_name?.toLowerCase().includes(newTxnForm.agent_name.toLowerCase())).map(agent => (
                            <button key={agent.id} type="button" className="w-full text-left px-3 py-1.5 hover:bg-blue-50 border-b last:border-0 text-sm"
                              onMouseDown={() => { setNewTxnForm(p => ({ ...p, agent_name: agent.full_name })); setShowAgentSuggest(false); }}>
                              {agent.full_name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="w-full gap-1.5"
                      onClick={handleCreateNew}
                      disabled={creating || !newTxnForm.property_address.trim() || !newTxnForm.agent_name.trim() || isCreatingTransaction}
                    >
                      {creating || isCreatingTransaction ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      Create Transaction
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-gray-500 px-3 py-2">Start typing to search transactions...</p>
          )}
        </div>
      )}
    </div>
  );
}