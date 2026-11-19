import { useState, useEffect } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import SupportWidget from "@/components/SupportWidget";
import AgentProfileModal from "@/components/AgentProfileModal";
import {
  LayoutDashboard, FileText, Users, Settings, FolderOpen,
  BookOpen, MessageSquare, PlusCircle, Menu, LogOut, Eye, EyeOff, Calculator, DollarSign, BarChart2
} from "lucide-react";
import { Button } from "@/components/ui/button";

const agentNav = [
  { label: "Dashboard", path: "/AgentDashboard", icon: LayoutDashboard },
  { label: "Submit CDA", path: "/SubmitCDA", icon: PlusCircle },
  { label: "My Transactions", path: "/MyTransactions", icon: FileText },
  { label: "Document Vault", path: "/DocumentVault", icon: FolderOpen },
  { label: "Resources", path: "/Resources", icon: BookOpen },
  { label: "Agent Talk", path: "/Community", icon: MessageSquare },
  { label: "Settings", path: "/AgentSettings", icon: Settings },
];

const adminNav = [
  { label: "Dashboard", path: "/AdminDashboard", icon: LayoutDashboard },
  { label: "Commissions", path: "/Commissions", icon: DollarSign },
  { label: "Accounting", path: "/Accounting", icon: Calculator },
  { label: "Agent Roster", path: "/AgentRoster", icon: Users },
  { label: "Document Vault", path: "/DocumentVault", icon: FolderOpen },
  { label: "Resources", path: "/Resources", icon: BookOpen },
  { label: "Reports", path: "/Reports", icon: BarChart2 },
  { label: "Settings", path: "/BrokerageSettings", icon: Settings },
];

const staffNav = [
  { label: "Dashboard", path: "/AdminDashboard", icon: LayoutDashboard },
  { label: "Commissions", path: "/Commissions", icon: DollarSign },
  { label: "Accounting", path: "/Accounting", icon: Calculator },
  { label: "Agent Roster", path: "/AgentRoster", icon: Users },
  { label: "Document Vault", path: "/DocumentVault", icon: FolderOpen },
  { label: "Resources", path: "/Resources", icon: BookOpen },
  { label: "Reports", path: "/Reports", icon: BarChart2 },
];

const SETTINGS_CACHE_KEY = "brokerage_settings_cache";

function getCachedSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_CACHE_KEY)); } catch { return null; }
}

export default function Layout() {
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(() => getCachedSettings());
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [agentRecord, setAgentRecord] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewAsAgent, setViewAsAgent] = useState(() => localStorage.getItem("viewAsAgent") === "true");
  const [showProfile, setShowProfile] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      const me = await base44.auth.me().catch(() => null);
      if (!me) return;
      setUser(me);

      base44.entities.Agent.filter({ user_email: me.email }).then(agents => {
        if (agents?.length > 0) setAgentRecord(agents[0]);
      }).catch(() => {});

      base44.entities.BrokerageSettings.list().then(data => {
        if (data?.length > 0) {
          setSettings(data[0]);
          try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(data[0])); } catch {}
        }
      }).catch(() => {});
    };
    init();
  }, []);



  const actualRole = user?.role || "agent";
  const isAdminOrStaff = actualRole === "admin" || actualRole === "staff";
  const role = (isAdminOrStaff && viewAsAgent) ? "agent" : actualRole;

  // Build dynamic nav for non-admin users based on agent role + permission matrix
  const agentCustomRole = agentRecord?.role || "agent";
  const permMatrix = settings?.role_permission_matrix || [];
  const agentRolePerms = permMatrix.find(r => r.name === agentCustomRole)?.permissions || null;

  const dynamicAgentNav = (() => {
    if (!agentRolePerms || isAdminOrStaff) return agentNav;
    const items = [];
    items.push({ label: "Dashboard", path: "/AgentDashboard", icon: LayoutDashboard });
    if (agentRolePerms?.transactions?.view) items.push({ label: "Submit CDA", path: "/SubmitCDA", icon: PlusCircle });
    if (agentRolePerms?.transactions?.view) items.push({ label: "My Transactions", path: "/MyTransactions", icon: FileText });
    if (agentRolePerms?.documents?.view) items.push({ label: "Document Vault", path: "/DocumentVault", icon: FolderOpen });
    if (agentRolePerms?.resources?.view) items.push({ label: "Resources", path: "/Resources", icon: BookOpen });
    if (agentRolePerms?.community?.view) items.push({ label: "Agent Talk", path: "/Community", icon: MessageSquare });
    items.push({ label: "Settings", path: "/AgentSettings", icon: Settings });
    return items;
  })();

  const navItems = role === "admin" ? adminNav : role === "staff" ? staffNav : dynamicAgentNav;

  const primaryColor = settings?.primary_color || "#1e3a5f";
  const secondaryColor = settings?.secondary_color || "#c9a84c";
  const textColor = settings?.sidebar_text_color || "#ffffff";
  const brokerageName = settings?.brokerage_name || "Signature Real Estate";

  const handleLogout = () => base44.auth.logout();

  const SidebarContent = () => (
    <div className="flex flex-col h-full" style={{ backgroundColor: primaryColor }}>
      {/* Logo */}
      <div className="p-6 border-b border-white/10">
        {settings?.logo_url ? (
          <img src={settings.logo_url} alt={brokerageName} className="h-10 object-contain" />
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <img src="/favicon.svg" alt="" className="h-8 w-8" />
              <span className="text-white font-semibold">{brokerageName}</span>
            </div>
            <div className="text-white/50 text-[10px] leading-tight">Spend More Time Closing Deals,<br/>Not Filing Them.</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ label, path, icon: Icon }) => {
          const active = location.pathname === path;
          return (
            <Link
              key={path}
              to={path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:bg-white/10`}
              style={active ? { backgroundColor: secondaryColor, color: textColor } : { color: textColor + 'b3' }}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User + Logout */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3 cursor-pointer" onClick={() => { if (role === 'agent') { navigate('/AgentSettings'); setSidebarOpen(false); } else { setShowProfile(true); } }}>
          <label className="relative cursor-pointer group flex-shrink-0" onClick={e => e.stopPropagation()}>
            {agentRecord?.photo_url ? (
              <img src={agentRecord.photo_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                style={{ backgroundColor: secondaryColor, color: primaryColor }}>
                {uploadingPhoto ? "..." : (user?.full_name?.[0] || "U")}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <span className="text-white text-[9px] font-bold">EDIT</span>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={async e => {
              const file = e.target.files?.[0];
              if (!file || !agentRecord) return;
              setUploadingPhoto(true);
              const { file_url } = await base44.integrations.Core.UploadFile({ file });
              await base44.entities.Agent.update(agentRecord.id, { photo_url: file_url });
              setAgentRecord(r => ({ ...r, photo_url: file_url }));
              setUploadingPhoto(false);
            }} />
          </label>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate hover:underline" style={{ color: textColor }}>{user?.full_name || "User"}</div>
            <div className="text-xs capitalize" style={{ color: textColor + '80' }}>{role}</div>
          </div>
        </div>
        {isAdminOrStaff && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { const next = !viewAsAgent; setViewAsAgent(next); localStorage.setItem("viewAsAgent", String(next)); navigate(next ? "/AgentDashboard" : "/AdminDashboard"); setSidebarOpen(false); }}
            className="w-full hover:bg-white/10 justify-start mb-1"
            style={{ color: textColor + 'b3' }}
          >
            {viewAsAgent ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
            {viewAsAgent ? "Exit Agent View" : "View as Agent"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="w-full hover:bg-white/10 justify-start"
          style={{ color: textColor + 'b3' }}
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 shadow-xl">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 flex-shrink-0 shadow-xl">
            <SidebarContent />
          </div>
          <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center gap-4 px-4 py-3 bg-white border-b shadow-sm">
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>
          {settings?.logo_url
            ? <img src={settings.logo_url} alt={brokerageName} className="h-8 object-contain" />
            : <span className="font-bold text-gray-800">{brokerageName}</span>
          }
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Outlet key={location.key} />
        </main>
      </div>

      {/* Support Widget — only shown to admins */}
      {(user?.role === "admin" || user?.role === "staff") && (
        <SupportWidget user={user} brokerageName={brokerageName} />
      )}
      <AgentProfileModal
        open={showProfile}
        onClose={() => setShowProfile(false)}
        agentRecord={agentRecord}
        setAgentRecord={setAgentRecord}
        user={user}
      />
    </div>
  );
}