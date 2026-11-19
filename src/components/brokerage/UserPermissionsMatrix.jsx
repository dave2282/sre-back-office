import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Plus, Trash2, Loader2 } from "lucide-react";

const SECTIONS = [
  { id: "transactions", label: "Transactions", permissions: ["view", "create", "edit", "delete"] },
  { id: "commissions", label: "Commissions", permissions: ["view", "create", "edit", "delete"] },
  { id: "accounting", label: "Accounting", permissions: ["view", "create", "edit", "delete"] },
  { id: "documents", label: "Document Vault", permissions: ["view", "create", "edit", "delete"] },
  { id: "agents", label: "Agent Roster", permissions: ["view", "create", "edit", "delete"] },
  { id: "reports", label: "Reports", permissions: ["view"] },
  { id: "resources", label: "Resources", permissions: ["view"] },
  { id: "community", label: "Community", permissions: ["view", "create", "delete"] },
  { id: "settings", label: "Settings", permissions: ["view", "edit"] },
];

const DEFAULT_ROLES = [
  {
    name: "admin",
    permissions: Object.fromEntries(SECTIONS.map(s => [s.id, Object.fromEntries(s.permissions.map(p => [p, true]))])),
  },
  {
    name: "staff",
    permissions: Object.fromEntries(SECTIONS.map(s => [s.id, { view: true, create: true, edit: true, delete: false }])),
  },
  {
    name: "agent",
    permissions: {
      transactions: { view: true, create: true, edit: false, delete: false },
      commissions: { view: true, create: false, edit: false, delete: false },
      accounting: { view: false, create: false, edit: false, delete: false },
      documents: { view: true, create: true, edit: false, delete: false },
      agents: { view: false, create: false, edit: false, delete: false },
      reports: { view: false },
      resources: { view: true },
      community: { view: true, create: true, delete: false },
      settings: { view: false, edit: false },
    },
  },
];

export default function UserPermissionsMatrix() {
  const [settings, setSettings] = useState(null);
  const [roles, setRoles] = useState(DEFAULT_ROLES);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");

  useEffect(() => {
    const load = async () => {
      const data = await base44.entities.BrokerageSettings.list();
      if (data?.length > 0) {
        setSettings(data[0]);
        if (data[0].role_permission_matrix?.length > 0) {
          setRoles(data[0].role_permission_matrix);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  const save = async (updatedRoles) => {
    setSaving(true);
    if (settings) {
      await base44.entities.BrokerageSettings.update(settings.id, { role_permission_matrix: updatedRoles });
    }
    setSaving(false);
  };

  const handleSave = async () => {
    await save(roles);
  };

  const handlePermissionChange = (roleName, sectionId, permType, value) => {
    const updated = roles.map(role => {
      if (role.name !== roleName) return role;
      return {
        ...role,
        permissions: {
          ...role.permissions,
          [sectionId]: {
            ...(role.permissions?.[sectionId] || {}),
            [permType]: value,
          },
        },
      };
    });
    setRoles(updated);
  };

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return;
    const newRole = {
      name: newRoleName.trim().toLowerCase(),
      permissions: Object.fromEntries(SECTIONS.map(s => [s.id, Object.fromEntries(s.permissions.map(p => [p, false]))])),
    };
    const updated = [...roles, newRole];
    setRoles(updated);
    setNewRoleName("");
    await save(updated);
  };

  const handleDeleteRole = async (roleName) => {
    if (["admin", "agent"].includes(roleName)) return;
    const updated = roles.filter(r => r.name !== roleName);
    setRoles(updated);
    await save(updated);
  };

  const getPermission = (role, sectionId, permType) => {
    return role.permissions?.[sectionId]?.[permType] || false;
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900 font-medium">Role-Based Permission Matrix</p>
        <p className="text-xs text-blue-700 mt-1">
          Define what each role can access. Agents inherit permissions from the role assigned to them in the Agent Roster.
        </p>
      </div>

      {/* Add new role */}
      <div className="flex gap-2">
        <Input
          placeholder="New role name (e.g. manager, accountant)"
          value={newRoleName}
          onChange={e => setNewRoleName(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleAddRole()}
          className="max-w-xs"
        />
        <Button size="sm" onClick={handleAddRole} disabled={!newRoleName.trim() || saving} className="gap-1.5">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-4 h-4" />}
          Add Role
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="sticky left-0 bg-gray-50 p-3 text-left font-semibold text-gray-700 min-w-[140px] z-10">
                  Role
                </th>
                {SECTIONS.map(section => (
                  <th
                    key={section.id}
                    className="p-2 text-center font-semibold text-gray-700 border-l bg-gray-50"
                    style={{ minWidth: `${section.permissions.length * 32 + 16}px` }}
                  >
                    <div className="flex flex-col items-center">
                      <span className="font-bold text-[11px]">{section.label}</span>
                      <div className="flex gap-0.5 mt-1 text-[10px] text-gray-500">
                        {section.permissions.map(p => (
                          <span key={p} className="w-5 text-center capitalize">{p[0].toUpperCase()}</span>
                        ))}
                      </div>
                    </div>
                  </th>
                ))}
                <th className="p-2 text-center bg-gray-50 border-l w-10" />
              </tr>
            </thead>
            <tbody>
              {roles.map(role => (
                <tr key={role.name} className="border-b hover:bg-gray-50">
                  <td className="sticky left-0 bg-white p-3 z-10 border-r">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <span className="font-semibold text-gray-900 capitalize">{role.name}</span>
                    </div>
                  </td>
                  {SECTIONS.map(section => (
                    <td key={section.id} className="p-2 border-l text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        {section.permissions.map(permType => (
                          <label
                            key={permType}
                            className="flex items-center justify-center w-5 h-5 cursor-pointer hover:bg-gray-200 rounded"
                            title={permType.charAt(0).toUpperCase() + permType.slice(1)}
                          >
                            <Checkbox
                              checked={getPermission(role, section.id, permType)}
                              onCheckedChange={val => handlePermissionChange(role.name, section.id, permType, !!val)}
                              disabled={saving || (permType !== "view" && !getPermission(role, section.id, "view"))}
                              className="w-3.5 h-3.5"
                            />
                          </label>
                        ))}
                      </div>
                    </td>
                  ))}
                  <td className="p-2 border-l text-center">
                    {!["admin", "agent"].includes(role.name) && (
                      <button
                        onClick={() => handleDeleteRole(role.name)}
                        className="text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span className="font-semibold">Legend:</span>
          <span>V = View · C = Create · E = Edit · D = Delete</span>
          <span>· Create/Edit/Delete require View</span>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save Permissions
        </Button>
      </div>
    </div>
  );
}