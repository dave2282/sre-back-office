import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Loader2 } from "lucide-react";

const DEFAULT_PERMISSIONS = [
  { id: "view_commissions", label: "View Commissions", description: "Access the Commissions tab" },
  { id: "edit_commissions", label: "Edit Commissions", description: "Edit commission records" },
  { id: "view_accounting", label: "View Accounting", description: "Access the Accounting tab" },
  { id: "edit_accounting", label: "Edit Accounting", description: "Create and edit accounting entries" },
  { id: "view_agents", label: "View Agent Roster", description: "Access the Agent Roster" },
  { id: "manage_agents", label: "Manage Agents", description: "Add, edit, and remove agents" },
  { id: "view_documents", label: "View Documents", description: "Access the Document Vault" },
  { id: "manage_documents", label: "Manage Documents", description: "Upload and delete documents" },
  { id: "view_reports", label: "View Reports", description: "Access Reports tab" },
  { id: "view_dashboard", label: "View Admin Dashboard", description: "Access the Admin Dashboard" },
];

export default function RolePermissionsManager() {
  const [settings, setSettings] = useState(null);
  const [roles, setRoles] = useState([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const data = await base44.entities.BrokerageSettings.list();
      if (data?.length > 0) {
        setSettings(data[0]);
        setRoles(data[0].role_permissions || []);
      } else {
        setRoles([
          {
            name: "admin",
            permissions: DEFAULT_PERMISSIONS.map(p => p.id),
          },
          {
            name: "user",
            permissions: ["view_commissions", "view_accounting", "view_documents"],
          },
        ]);
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleAddRole = async () => {
    if (!newRoleName.trim()) return;
    setSaving(true);
    const updatedRoles = [
      ...roles,
      {
        name: newRoleName,
        permissions: [],
      },
    ];
    setRoles(updatedRoles);
    
    if (settings) {
      await base44.entities.BrokerageSettings.update(settings.id, { role_permissions: updatedRoles });
    }
    
    setNewRoleName("");
    setSaving(false);
  };

  const handleSave = async () => {
    setSaving(true);
    if (settings) {
      await base44.entities.BrokerageSettings.update(settings.id, { role_permissions: roles });
    }
    setSaving(false);
  };

  const handlePermissionToggle = (roleName, permissionId) => {
    const updatedRoles = roles.map(role => {
      if (role.name === roleName) {
        const permissions = role.permissions || [];
        return {
          ...role,
          permissions: permissions.includes(permissionId)
            ? permissions.filter(p => p !== permissionId)
            : [...permissions, permissionId],
        };
      }
      return role;
    });
    setRoles(updatedRoles);
  };

  const handleDeleteRole = async (roleName) => {
    if (["admin", "user"].includes(roleName)) {
      alert("Cannot delete default roles");
      return;
    }
    setSaving(true);
    const updatedRoles = roles.filter(r => r.name !== roleName);
    setRoles(updatedRoles);
    
    if (settings) {
      await base44.entities.BrokerageSettings.update(settings.id, { role_permissions: updatedRoles });
    }
    
    setSaving(false);
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          Define custom roles and assign permissions to control what each role can access in the system.
        </p>
      </div>

      {/* Add New Role */}
      <div className="p-4 bg-gray-50 border rounded-lg space-y-3">
        <p className="text-sm font-semibold text-gray-700">Create New Role</p>
        <div className="flex gap-3">
          <Input
            placeholder="Role name (e.g., manager, accountant)"
            value={newRoleName}
            onChange={e => setNewRoleName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddRole()}
          />
          <Button size="sm" onClick={handleAddRole} disabled={!newRoleName.trim() || saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Role
          </Button>
        </div>
      </div>

        {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Save Permissions
        </Button>
      </div>

      {/* Roles and Permissions */}
      {roles.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-8">No roles defined yet.</p>
      ) : (
        <div className="space-y-4">
          {roles.map(role => (
            <div key={role.name} className="border rounded-lg p-4 bg-white">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="font-semibold text-gray-900 capitalize">{role.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{(role.permissions || []).length} permissions granted</p>
                </div>
                {!["admin", "user"].includes(role.name) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                    onClick={() => handleDeleteRole(role.name)}
                    disabled={saving}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {DEFAULT_PERMISSIONS.map(permission => (
                  <label key={permission.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group">
                    <Checkbox
                      checked={(role.permissions || []).includes(permission.id)}
                      onCheckedChange={() => handlePermissionToggle(role.name, permission.id)}
                      disabled={saving}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-gray-700">{permission.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{permission.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}