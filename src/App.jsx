import { Toaster } from "@/components/ui/toaster"
import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/components/AuthContextProvider';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Layout from '@/components/Layout';

// Pages
import AgentDashboard from '@/pages/AgentDashboard';
import SubmitCDA from '@/pages/SubmitCDA';
import MyTransactions from '@/pages/MyTransactions';
import DocumentVault from '@/pages/DocumentVault';
import Resources from '@/pages/Resources';
import Community from '@/pages/Community';
import AdminDashboard from '@/pages/AdminDashboard';
import AllTransactions from '@/pages/AllTransactions';
import Commissions from '@/pages/Commissions';
import Accounting from '@/pages/Accounting';
import AgentRoster from '@/pages/AgentRoster';
import BrokerageSettings from '@/pages/BrokerageSettings';
import Reports from '@/pages/Reports';
import AgentSettings from '@/pages/AgentSettings';
import { LoginPage, ForgotPasswordPage, SetPasswordPage } from '@/pages/auth/AuthPages';


const AdminRoute = ({ children }) => {
  const [allowed, setAllowed] = useState(null);
  useEffect(() => {
    base44.auth.me().then(u => setAllowed(u?.role === 'admin' || u?.role === 'staff')).catch(() => setAllowed(false));
  }, []);
  if (allowed === null) return null;
  if (!allowed) return <Navigate to="/AgentDashboard" replace />;
  return children;
};

const InitialRouteRedirect = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return null;

  // Admins go to admin dashboard, everyone else to agent dashboard
  const defaultRoute = user?.role === 'admin' || user?.role === 'staff' ? '/AdminDashboard' : '/AgentDashboard';
  return <Navigate to={defaultRoute} replace />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route path="/" element={<InitialRouteRedirect />} />
      <Route element={<Layout />}>
        {/* Agent Routes */}
        <Route path="/AgentDashboard" element={<AgentDashboard />} />
        <Route path="/SubmitCDA" element={<SubmitCDA />} />
        <Route path="/MyTransactions" element={<MyTransactions />} />
        <Route path="/DocumentVault" element={<DocumentVault />} />
        <Route path="/Resources" element={<Resources />} />
        <Route path="/Community" element={<Community />} />
        <Route path="/AgentSettings" element={<AgentSettings />} />
        {/* Admin/Staff Routes */}
        <Route path="/AdminDashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        <Route path="/AllTransactions" element={<AdminRoute><AllTransactions /></AdminRoute>} />
        <Route path="/Commissions" element={<AdminRoute><Commissions /></AdminRoute>} />
        <Route path="/Accounting" element={<AdminRoute><Accounting /></AdminRoute>} />
        <Route path="/AgentRoster" element={<AdminRoute><AgentRoster /></AdminRoute>} />
        <Route path="/BrokerageSettings" element={<AdminRoute><BrokerageSettings /></AdminRoute>} />
        <Route path="/Reports" element={<AdminRoute><Reports /></AdminRoute>} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/set-password" element={<SetPasswordPage />} />
            <Route path="/*" element={<AuthenticatedApp />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App