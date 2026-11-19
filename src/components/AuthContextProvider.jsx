import { createContext, useContext, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const me = await base44.auth.me().catch(() => null);
        
        if (!me) {
          setAuthError({ type: 'auth_required' });
          setIsLoadingAuth(false);
          return;
        }

        // Block suspended or inactive users
        if (me.status === 'suspended' || me.status === 'inactive') {
          setAuthError({ type: 'user_not_registered' });
          setIsLoadingAuth(false);
          return;
        }

        setUser(me);

        // Only admins and staff bypass agent roster check
        if (me.role !== 'admin' && me.role !== 'staff') {
          const agents = await base44.entities.Agent.filter({ user_email: me.email }, null, 1).catch(() => []);
          if (!agents || agents.length === 0) {
            setAuthError({ type: 'user_not_registered' });
            setIsLoadingAuth(false);
            return;
          }
        }

        setIsLoadingAuth(false);
      } catch (error) {
        setAuthError({ type: 'auth_required' });
        setIsLoadingAuth(false);
      }
    };

    initAuth();
    setIsLoadingPublicSettings(false);
  }, []);

  const navigateToLogin = () => {
    base44.auth.redirectToLogin();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoadingAuth,
        isLoadingPublicSettings,
        authError,
        navigateToLogin,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};