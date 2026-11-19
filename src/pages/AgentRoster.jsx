import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Plus, Loader2, Upload, Download, Trash2, Mail, CheckCircle2, AlertCircle, Phone, CreditCard, Calendar, Building2, DollarSign, Award, StickyNote } from "lucide-react";
import { format } from "date-fns";
import AgentImportDialog from "@/components/agents/AgentImportDialog.jsx";
import AddressInput from "@/components/shared/AddressInput";
import * as XLSX from "xlsx";

export default function AgentRoster() {
  const [agents, setAgents] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showWelcomePrompt, setShowWelcomePrompt] = useState(false);
  const [newlyAddedAgent, setNewlyAddedAgent] = useState(null);
  const [editAgent, setEditAgent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(null);
  const [bulkWelcomeLoading, setBulkWelcomeLoading] = useState(false);
  const [welcomeStatus, setWelcomeStatus] = useState(null); // { type: 'success'|'error', message }
  const [settings, setSettings] = useState(null);
  const [form, setForm] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkDeskFee, setBulkDeskFee] = useState("");
  const [bulkCommission, setBulkCommission] = useState("");
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPlanDialog, setBulkPlanDialog] = useState(null); // { type: "desk_fee"|"commission", planName }
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTeam, setFilterTeam] = useState("all");
  const [sortBy, setSortBy] = useState("full_name");
  const [sortDir, setSortDir] = useState("asc");

  const load = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('getRosterData', {});
      // Normalize: invoke may return {data: {...}} or the object directly
      const data = (res?.agents !== undefined) ? res : (res?.data ?? res);
      setAgents(Array.isArray(data?.agents) ? data.agents : []);
      if (data?.settings) setSettings(data.settings);
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (e) {
      console.error("getRosterData failed, falling back:", e);
      // Fallback: direct entity calls
      try {
        const [ags, settingsList, userList] = await Promise.all([
          base44.entities.Agent.list("-created_date", 500),
          base44.entities.BrokerageSettings.list(),
          base44.entities.User.list("-created_date", 500),
        ]);
        setAgents(ags || []);
        if (settingsList?.length > 0) setSettings(settingsList[0]);
        setUsers(userList || []);
      } catch (e2) {
        console.error("Fallback also failed:", e2);
      }
    } finally {
      setLoading(false);
    }
  };

  // A user has "logged in" if they have a User record (they exist in the system)
  const hasLoggedIn = (agent) => {
    return users.some(u => u.email?.toLowerCase() === agent.user_email?.toLowerCase());
  };

  const getUserRecord = (agent) => {
    return users.find(u => u.email?.toLowerCase() === agent.user_email?.toLowerCase());
  };

  const showStatus = (type, message) => {
    setWelcomeStatus({ type, message });
    setTimeout(() => setWelcomeStatus(null), 5000);
  };

  const sendWelcomeEmail = async (agent) => {
    if (!agent?.user_email) return;
    setSendingEmail(agent.id);
    await base44.users.inviteUser(agent.user_email, agent.role === 'admin' ? 'admin' : 'user').catch(() => {});
    await base44.functions.invoke('sendWelcomeEmail', { agent, settings }).catch(() => {});
    setSendingEmail(null);
    showStatus('success', `Welcome email sent to ${agent.full_name || agent.user_email}`);
  };

  const bulkSendWelcomeEmails = async () => {
    const targets = selected.size > 0
      ? agents.filter(a => selected.has(a.id) && !hasLoggedIn(a))
      : agents.filter(a => !hasLoggedIn(a));
    if (targets.length === 0) { showStatus('error', 'No agents without logins found.'); return; }
    if (!window.confirm(`Send welcome emails to ${targets.length} agent(s) who have never logged in?`)) return;
    setBulkWelcomeLoading(true);
    let sent = 0, failed = 0;
    for (const agent of targets) {
      try {
        await base44.users.inviteUser(agent.user_email, agent.role === 'admin' ? 'admin' : 'user').catch(() => {});
        await base44.functions.invoke('sendWelcomeEmail', { agent, settings });
        sent++;
      } catch { failed++; }
    }
    setBulkWelcomeLoading(false);
    setSelected(new Set());
    showStatus('success', `Welcome emails sent: ${sent} succeeded${failed > 0 ? `, ${failed} failed` : ''}.`);
  };

  const sendPasswordReset = async (agent) => {
    if (!agent.user_email) return;
    setSendingEmail(agent.id + '_reset');
    const emailBody = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1e3a5f;">Password Reset &#8212; ${settings?.brokerage_name || 'Back Office'}</h2>
  <p style="color: #444;">Hi ${agent.full_name || agent.user_email},</p>
  <p style="color: #444;">Your administrator has sent you instructions to set your Back Office account password.</p>
  <div style="background: #f0f7ff; border-left: 4px solid #3b82f6; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0 0 8px; font-weight: bold; color: #1e3a5f;">Steps to set your password:</p>
    <ol style="margin: 0; padding-left: 20px; color: #444;">
      <li style="margin-bottom: 8px;">Click the button below to go to the login page</li>
      <li style="margin-bottom: 8px;">Click <strong>Forgot Password</strong></li>
      <li style="margin-bottom: 8px;">Enter your email: <strong>${agent.user_email}</strong></li>
      <li>Check your inbox for the reset link and create your password</li>
    </ol>
    <p style="margin: 12px 0 0; color: #555;"><em>Or sign in instantly with <strong>Google</strong> if this is a Gmail address.</em></p>
  </div>
  <div style="text-align: center; margin: 28px 0;">
    <a href="${window.location.origin}" style="background: #1e3a5f; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">Go to Login Page &rarr;</a>
  </div>
</div>`;
    await base44.integrations.Core.SendEmail({
      to: agent.user_email,
      subject: `Set Your Password &#8212; ${settings?.brokerage_name || 'Back Office'}`,
      body: emailBody,
    }).catch(() => {});
    setSendingEmail(null);
  };

  useEffect(() => { load(); }, []);

  const filtered = agents.filter(a => {
    const matchesSearch = !search ||
      a.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.user_email?.toLowerCase().includes(search.toLowerCase()) ||
      a.phone?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = filterRole === "all" || a.role === filterRole;
    const matchesStatus = filterStatus === "all" || a.status === filterStatus;
    const matchesTeam = filterTeam === "all" || a.team === filterTeam;
    return matchesSearch && matchesRole && matchesStatus && matchesTeam;
  }).sort((a, b) => {
    let aVal = a[sortBy] || "";
    let bVal = b[sortBy] || "";
    if (typeof aVal === "string") aVal = aVal.toLowerCase();
    if (typeof bVal === "string") bVal = bVal.toLowerCase();
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  const toggleSort = (column) => {
    if (sortBy === column) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDir("asc");
    }
  };

  const allChecked = filtered.length > 0 && filtered.every(a => selected.has(a.id));

  const toggleAll = () => {
    if (allChecked) {
      setSelected(s => { const n = new Set(s); filtered.forEach(a => n.delete(a.id)); return n; });
    } else {
      setSelected(s => { const n = new Set(s); filtered.forEach(a => n.add(a.id)); return n; });
    }
  };

  const toggleOne = (id) => {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${selected.size} agent(s)? This cannot be undone.`)) return;
    setBulkLoading(true);
    await Promise.all([...selected].map(id => base44.entities.Agent.delete(id)));
    setSelected(new Set());
    await load();
    setBulkLoading(false);
  };

  const applyBulkPlan = async () => {
    if (!bulkPlanDialog) return;
    setBulkLoading(true);
    const { type, planName } = bulkPlanDialog;
    const field = type === "desk_fee" ? "desk_fee_plan" : "commission_plan";
    const targets = selected.size > 0 ? [...selected] : agents.map(a => a.id);
    await Promise.all(targets.map(id => base44.entities.Agent.update(id, { [field]: planName })));
    setSelected(new Set());
    setBulkPlanDialog(null);
    setBulkDeskFee("");
    setBulkCommission("");
    await load();
    setBulkLoading(false);
  };

  const bulkInactivate = async () => {
    setBulkLoading(true);
    await Promise.all([...selected].map(id => base44.entities.Agent.update(id, { status: "inactive" })));
    setSelected(new Set());
    await load();
    setBulkLoading(false);
  };

  const applyBulkStatus = async (status) => {
    if (!status) return;
    setBulkLoading(true);
    const targets = selected.size > 0 ? [...selected] : agents.map(a => a.id);
    await Promise.all(targets.map(id => base44.entities.Agent.update(id, { status })));
    setSelected(new Set());
    setBulkStatus("");
    await load();
    setBulkLoading(false);
  };

  const openEdit = (agent) => {
    setEditAgent(agent);
    setForm({ ...agent });
    setShowDialog(true);
  };

  const openNew = () => {
    setEditAgent(null);
    setForm({ status: "active", cap_status: "none", annual_cap_amount: 0, commission_plan: "None Set", desk_fee_plan: "None Set" });
    setShowDialog(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const data = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" ? undefined : v]));
    if (editAgent) {
      await base44.entities.Agent.update(editAgent.id, data);
    } else {
      const created = await base44.entities.Agent.create(data);
      setNewlyAddedAgent({ ...data, id: created.id });
      setShowDialog(false);
      setSaving(false);
      setShowWelcomePrompt(true);
      await load();
      return;
    }
    await load();
    setShowDialog(false);
    setSaving(false);
  };

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const exportToExcel = () => {
    const toExport = selected.size > 0 ? agents.filter(a => selected.has(a.id)) : agents;
    const data = toExport.map(a => ({
      "Full Name": a.full_name || "",
      "Email": a.user_email || "",
      "Phone": a.phone || "",
      "License #": a.license_number || "",
      "License Expiration": a.license_expiration || "",
      "Join Date": a.join_date || "",
      "Role": a.role || "agent",
      "Commission Plan": a.commission_plan || "None Set",
      "Desk Fee Plan": a.desk_fee_plan || "",
      "Lead Agent": a.lead_agent ? settings?.lead_agents?.find(la => la.email === a.lead_agent)?.full_name || a.lead_agent : "",
      "Team": a.team || "",
      "Annual Cap": a.annual_cap_amount || 0,
      "Cap Status": a.cap_status || "none",
      "Status": a.status || "active",
      "Notes": a.notes || ""
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Agents");
    XLSX.writeFile(wb, `agents_export_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full p-12">
      <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Agent Roster <span className="text-gray-400 font-normal text-lg">({agents.length})</span></h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} className="gap-2">
            <Download className="w-4 h-4" /> Export
          </Button>
          <Button variant="outline" onClick={() => setShowImport(true)} className="gap-2">
            <Upload className="w-4 h-4" /> Import
          </Button>
          <Button onClick={openNew} className="gap-2">
            <Plus className="w-4 h-4" /> Add Agent
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      {welcomeStatus && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl mb-3 text-sm font-medium ${
          welcomeStatus.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
        }`}>
          {welcomeStatus.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {welcomeStatus.message}
          <button className="ml-auto text-xs opacity-60 hover:opacity-100" onClick={() => setWelcomeStatus(null)}>✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Button
          variant="outline"
          size="sm"
          className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50"
          onClick={bulkSendWelcomeEmails}
          disabled={bulkWelcomeLoading}
        >
          {bulkWelcomeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
          {selected.size > 0 ? `Send Welcome (${[...selected].filter(id => !hasLoggedIn(agents.find(a=>a.id===id))).length} unlogged selected)` : `Send Welcome to All (Never Logged In)`}
        </Button>

        {/* Apply Desk Fee Plan */}
        <div className="flex items-center gap-1">
          <Select value={bulkDeskFee} onValueChange={setBulkDeskFee}>
            <SelectTrigger className="w-48 h-9 text-sm">
              <SelectValue placeholder="Apply Desk Fee Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None Set">None Set</SelectItem>
              {(settings?.desk_fee_plans || []).map(plan => (
                <SelectItem key={plan.name} value={plan.name}>{plan.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bulkDeskFee && (
            <Button size="sm" className="h-9" onClick={() => setBulkPlanDialog({ type: "desk_fee", planName: bulkDeskFee })}>
              Apply
            </Button>
          )}
        </div>
        {/* Apply Commission Plan */}
        <div className="flex items-center gap-1">
          <Select value={bulkCommission} onValueChange={setBulkCommission}>
            <SelectTrigger className="w-52 h-9 text-sm">
              <SelectValue placeholder="Apply Commission Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="None Set">None Set</SelectItem>
              {(settings?.commission_plans || []).map(plan => (
                <SelectItem key={plan.name} value={plan.name}>{plan.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {bulkCommission && (
            <Button size="sm" className="h-9" onClick={() => setBulkPlanDialog({ type: "commission", planName: bulkCommission })}>
              Apply
            </Button>
          )}
        </div>
        {/* Bulk Status */}
        <div className="flex items-center gap-1">
          <Select value={bulkStatus} onValueChange={setBulkStatus}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <SelectValue placeholder="Change Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
          {bulkStatus && (
            <Button size="sm" className="h-9" onClick={() => applyBulkStatus(bulkStatus)} disabled={bulkLoading}>
              {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Apply"}
            </Button>
          )}
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 font-medium">{selected.size} selected</span>
            <Button size="sm" variant="outline" className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50" onClick={bulkDelete} disabled={bulkLoading}>
              {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No agents found</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="w-10 px-4 py-3 text-left">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} />
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort("full_name")}>
                  <div className="flex items-center gap-1">Name {sortBy === "full_name" && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}</div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort("user_email")}>
                  <div className="flex items-center gap-1">Email {sortBy === "user_email" && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}</div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort("phone")}>
                  <div className="flex items-center gap-1">Phone {sortBy === "phone" && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}</div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort("role")}>
                  <div className="flex items-center gap-1">Role {sortBy === "role" && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}</div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none" onClick={() => toggleSort("status")}>
                  <div className="flex items-center gap-1">Status {sortBy === "status" && <span className="text-xs">{sortDir === "asc" ? "↑" : "↓"}</span>}</div>
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Login Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((agent, i) => (
                <tr
                  key={agent.id}
                  className={`border-b last:border-0 hover:bg-gray-50 cursor-pointer ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}
                  onClick={() => openEdit(agent)}
                >
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <Checkbox checked={selected.has(agent.id)} onCheckedChange={() => toggleOne(agent.id)} />
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 hover:text-blue-600 hover:underline transition-colors">{agent.full_name || agent.name || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{agent.user_email || agent.email || "—"}</td>
                  <td className="px-4 py-3 text-gray-500">{agent.phone || "—"}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <Select value={agent.role || "agent"} onValueChange={v => {
                      base44.entities.Agent.update(agent.id, { role: v });
                      load();
                    }}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(settings?.role_permission_matrix?.length > 0
                          ? settings.role_permission_matrix.map(r => r.name)
                          : ["agent", "manager", "admin"]
                        ).map(roleName => (
                          <SelectItem key={roleName} value={roleName} className="capitalize">{roleName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3">
                    <Badge className={
                      agent.status === "active" ? "bg-green-100 text-green-700" :
                      agent.status === "inactive" ? "bg-gray-100 text-gray-600" :
                      "bg-yellow-100 text-yellow-700"
                    }>
                      {agent.status || "active"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {hasLoggedIn(agent) ? (
                      <div className="flex items-center gap-2">
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500">
                            {getUserRecord(agent)?.updated_date
                              ? format(new Date(getUserRecord(agent).updated_date), "MMM d, yyyy h:mm a")
                              : "—"}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-gray-300 text-gray-600 hover:bg-gray-50"
                          disabled={sendingEmail === agent.id + '_reset'}
                          onClick={(e) => { e.stopPropagation(); sendPasswordReset(agent); }}
                        >
                          {sendingEmail === agent.id + '_reset' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                          Send Password Reset
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-1 text-orange-500 text-xs font-medium">
                          <AlertCircle className="w-3.5 h-3.5" /> Never
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1 border-blue-300 text-blue-600 hover:bg-blue-50"
                          disabled={sendingEmail === agent.id}
                          onClick={() => sendWelcomeEmail(agent)}
                        >
                          {sendingEmail === agent.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                          Welcome
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AgentImportDialog open={showImport} onClose={() => setShowImport(false)} onImported={load} />

      {/* Bulk Plan Apply Confirmation */}
      <Dialog open={!!bulkPlanDialog} onOpenChange={open => { if (!open) setBulkPlanDialog(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Apply {bulkPlanDialog?.type === "desk_fee" ? "Desk Fee" : "Commission"} Plan</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-700 py-2">
            Apply <strong>"{bulkPlanDialog?.planName}"</strong> as the {bulkPlanDialog?.type === "desk_fee" ? "Desk Fee" : "Commission"} Plan to{" "}
            {selected.size > 0 ? <><strong>{selected.size} selected agent{selected.size !== 1 ? "s" : ""}</strong></> : <><strong>all {agents.length} agents</strong></>}?
            This will overwrite any existing plan assignments.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkPlanDialog(null)}>Cancel</Button>
            <Button onClick={applyBulkPlan} disabled={bulkLoading}>
              {bulkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Welcome Email Prompt */}
      <Dialog open={showWelcomePrompt} onOpenChange={setShowWelcomePrompt}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-blue-600" />
              Send Welcome Email?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 py-2">
            Would you like to send a welcome email to <strong>{newlyAddedAgent?.full_name || newlyAddedAgent?.user_email}</strong> with instructions to access the agent portal?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWelcomePrompt(false)}>No Thanks</Button>
            <Button
              className="gap-2 bg-blue-600 hover:bg-blue-700"
              disabled={sendingEmail === newlyAddedAgent?.id}
              onClick={async () => {
                await sendWelcomeEmail(newlyAddedAgent);
                setShowWelcomePrompt(false);
              }}
            >
              {sendingEmail === newlyAddedAgent?.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send Welcome Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit / Add Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editAgent ? `${editAgent.full_name || "Agent"} — Details & Edit` : "Add Agent"}</DialogTitle>
          </DialogHeader>

          {/* Read-only details summary for existing agents */}
          {editAgent && (
            <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-xl border mb-2 text-sm">
              <div className="flex items-start gap-2">
                <Mail className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Email</p><p className="text-gray-800">{editAgent.user_email || "—"}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Phone className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Phone</p><p className="text-gray-800">{editAgent.phone || "—"}</p></div>
              </div>
              {editAgent.mailing_address && (
                <div className="col-span-2 flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Mailing Address</p><p className="text-gray-800">{editAgent.mailing_address}</p></div>
                </div>
              )}
              {(editAgent.company || (editAgent.companies || []).length > 0) && (
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Company / LLCs</p>
                    <p className="text-gray-800">{editAgent.company || "—"}</p>
                    {(editAgent.companies || []).filter(c => c && c !== editAgent.company).map((c, i) => (
                      <p key={i} className="text-xs text-gray-500">↳ {c}</p>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Lead Agent</p><p className="text-gray-800">{editAgent.lead_agent ? settings?.lead_agents?.find(la => la.email === editAgent.lead_agent)?.full_name || editAgent.lead_agent : "—"}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Team</p><p className="text-gray-800">{editAgent.team || "—"}</p></div>
              </div>
              <div className="col-span-2 flex items-start gap-2">
                <Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Transaction Coordinators</p>
                  {(editAgent.transaction_coordinators || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {(editAgent.transaction_coordinators || []).map((email, i) => {
                        const coord = settings?.transaction_coordinators?.find(c => c.email === email);
                        return <span key={i} className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">{coord?.full_name || email}</span>;
                      })}
                    </div>
                  ) : <p className="text-gray-800">—</p>}
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CreditCard className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">License #</p><p className="text-gray-800">{editAgent.license_number || "—"}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">License Exp.</p><p className="text-gray-800">{editAgent.license_expiration && !isNaN(new Date(editAgent.license_expiration + "T00:00:00")) ? format(new Date(editAgent.license_expiration + "T00:00:00"), "MMM d, yyyy") : "—"}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Join Date</p><p className="text-gray-800">{editAgent.join_date && !isNaN(new Date(editAgent.join_date + "T00:00:00")) ? format(new Date(editAgent.join_date + "T00:00:00"), "MMM d, yyyy") : "—"}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Desk Fee Plan</p><p className="text-gray-800">{editAgent.desk_fee_plan || "—"}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Award className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Commission Plan</p><p className="text-gray-800">{editAgent.commission_plan || "None Set"}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Annual Cap</p><p className="text-gray-800">{editAgent.annual_cap_amount ? `$${editAgent.annual_cap_amount.toLocaleString()}` : "—"}</p></div>
              </div>
              <div className="flex items-start gap-2">
                <Award className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Cap Status</p>
                  <Badge className={editAgent.cap_status === "post_cap" ? "bg-green-100 text-green-700 text-xs" : editAgent.cap_status === "pre_cap" ? "bg-blue-100 text-blue-700 text-xs" : "bg-gray-100 text-gray-500 text-xs"}>
                    {editAgent.cap_status === "post_cap" ? "Post-Cap" : editAgent.cap_status === "pre_cap" ? "Pre-Cap" : "None"}
                  </Badge>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Role / Status</p>
                  <p className="text-gray-800 capitalize">{editAgent.role || "agent"} · <Badge className={editAgent.status === "active" ? "bg-green-100 text-green-700 text-xs" : editAgent.status === "inactive" ? "bg-gray-100 text-gray-600 text-xs" : "bg-yellow-100 text-yellow-700 text-xs"}>{editAgent.status || "active"}</Badge></p>
                </div>
              </div>
              {editAgent.notes && (
                <div className="col-span-2 flex items-start gap-2">
                  <StickyNote className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <div><p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Notes</p><p className="text-gray-800">{editAgent.notes}</p></div>
                </div>
              )}
            </div>
          )}

          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{editAgent ? "Edit Fields" : "Agent Information"}</p>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Full Name</Label>
                <Input className="mt-1.5" value={form.full_name || ""} onChange={e => setField("full_name", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>User Email (must match login email)</Label>
                <Input className="mt-1.5" value={form.user_email || ""} onChange={e => setField("user_email", e.target.value)} />
              </div>
              <div className="col-span-2">
                <AddressInput
                  label="Mailing Address (for commission checks)"
                  value={form.mailing_address || ""}
                  onChange={v => setField("mailing_address", v)}
                />
              </div>
              <div className="col-span-2">
                <Label>Primary Company / LLC</Label>
                <Input className="mt-1.5" value={form.company || ""} onChange={e => setField("company", e.target.value)} placeholder="e.g. ABC Realty, LLC" />
              </div>
              <div className="col-span-2">
                <Label>Additional LLC / Company Name Variations</Label>
                <p className="text-xs text-gray-400 mb-1.5">Used to match referral & split payments by alternate LLC names.</p>
                <div className="space-y-2">
                  {(form.companies || []).map((c, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={c}
                        onChange={e => {
                          const arr = [...(form.companies || [])];
                          arr[i] = e.target.value;
                          setField("companies", arr);
                        }}
                        placeholder={`LLC variation ${i + 1}`}
                      />
                      <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 flex-shrink-0" onClick={() => {
                        const arr = [...(form.companies || [])];
                        arr.splice(i, 1);
                        setField("companies", arr);
                      }}>✕</Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setField("companies", [...(form.companies || []), ""])}>
                    + Add LLC Variation
                  </Button>
                </div>
              </div>
              <div>
                <Label>Lead Agent</Label>
                <Select value={form.lead_agent || ""} onValueChange={v => setField("lead_agent", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select lead agent..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(settings?.lead_agents || []).map(lead => (
                      <SelectItem key={lead.email} value={lead.email}>{lead.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Team</Label>
                <Select value={form.team || ""} onValueChange={v => setField("team", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select team..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(settings?.teams || []).map(team => (
                      <SelectItem key={team.name} value={team.name}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Transaction Coordinators</Label>
                <div className="mt-1.5 p-3 border rounded-lg bg-white space-y-2">
                  {(settings?.transaction_coordinators || []).length === 0 ? (
                    <p className="text-xs text-gray-400 italic">No transaction coordinators set up in Brokerage Settings.</p>
                  ) : (
                    <div className="space-y-2">
                      {(settings?.transaction_coordinators || []).map(coord => {
                        const isSelected = (form.transaction_coordinators || []).includes(coord.email);
                        return (
                          <div key={coord.email} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`coord-${coord.email}`}
                              checked={isSelected}
                              onChange={e => {
                                const coords = form.transaction_coordinators || [];
                                if (e.target.checked) {
                                  if (!coords.includes(coord.email)) setField("transaction_coordinators", [...coords, coord.email]);
                                } else {
                                  setField("transaction_coordinators", coords.filter(c => c !== coord.email));
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 cursor-pointer"
                            />
                            <label htmlFor={`coord-${coord.email}`} className="text-sm text-gray-700 cursor-pointer flex-1">
                              {coord.full_name}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label>Phone</Label>
                <Input className="mt-1.5" value={form.phone || ""} onChange={e => setField("phone", e.target.value)} />
              </div>
              <div>
                <Label>License #</Label>
                <Input className="mt-1.5" value={form.license_number || ""} onChange={e => setField("license_number", e.target.value)} />
              </div>
              <div>
                <Label>License Expiration</Label>
                <Input type="date" className="mt-1.5" value={form.license_expiration || ""} onChange={e => setField("license_expiration", e.target.value)} />
              </div>
              <div>
                <Label>Join Date</Label>
                <Input type="date" className="mt-1.5" value={form.join_date || ""} onChange={e => setField("join_date", e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Office Desk Fee Plan</Label>
                <Select value={form.desk_fee_plan || "__none__"} onValueChange={v => setField("desk_fee_plan", v === "__none__" ? "" : v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select a desk fee plan..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {(settings?.desk_fee_plans || []).map(plan => (
                     <SelectItem key={plan.name} value={plan.name}>
                       {plan.name} — ${plan.amount?.toLocaleString()} / {plan.frequency}
                     </SelectItem>
                    ))}
                    {(!settings?.desk_fee_plans || settings.desk_fee_plans.length === 0) && (
                      <div className="px-3 py-2 text-xs text-gray-400">No desk fee plans defined. Add them in Brokerage Settings.</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                 <Label>Commission Plan</Label>
                 <Select value={form.commission_plan || "None Set"} onValueChange={v => setField("commission_plan", v)}>
                   <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                   <SelectContent>
                     <SelectItem value="None Set">None Set</SelectItem>
                     {(settings?.commission_plans || []).filter(p => p.name !== "None Set").map(plan => (
                       <SelectItem key={plan.name} value={plan.name}>
                         {plan.name} {plan.type === "flat_fee" ? `— $${plan.flat_fee_amount?.toLocaleString()}` : `— ${plan.agent_split}% / ${plan.office_split}%`}
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
              <div>
                <Label>Annual Cap ($)</Label>
                <Input type="number" className="mt-1.5" value={form.annual_cap_amount ?? 0} onChange={e => setField("annual_cap_amount", parseFloat(e.target.value) || 0)} />
              </div>
              <div>
                <Label>Cap Status</Label>
                <Select value={form.cap_status || "none"} onValueChange={v => setField("cap_status", v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="pre_cap">Pre-Cap</SelectItem>
                    <SelectItem value="post_cap">Post-Cap</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Role</Label>
                <Select value={form.role || "agent"} onValueChange={v => setField("role", v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(settings?.role_permission_matrix?.length > 0
                      ? settings.role_permission_matrix.map(r => r.name)
                      : ["agent", "manager", "admin"]
                    ).map(roleName => (
                      <SelectItem key={roleName} value={roleName} className="capitalize">{roleName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Status</Label>
                <Select value={form.status || "active"} onValueChange={v => setField("status", v)}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Notes</Label>
                <Input className="mt-1.5" value={form.notes || ""} onChange={e => setField("notes", e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}