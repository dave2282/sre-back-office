/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import Accounting from './pages/Accounting';
import AdminDashboard from './pages/AdminDashboard';
import AgentDashboard from './pages/AgentDashboard';
import AgentRoster from './pages/AgentRoster';
import AllTransactions from './pages/AllTransactions';
import BrokerageSettings from './pages/BrokerageSettings';
import Commissions from './pages/Commissions';
import Community from './pages/Community';
import DocumentVault from './pages/DocumentVault';
import MyTransactions from './pages/MyTransactions';
import Reports from './pages/Reports';
import Resources from './pages/Resources';
import SubmitCDA from './pages/SubmitCDA';


export const PAGES = {
    "Accounting": Accounting,
    "AdminDashboard": AdminDashboard,
    "AgentDashboard": AgentDashboard,
    "AgentRoster": AgentRoster,
    "AllTransactions": AllTransactions,
    "BrokerageSettings": BrokerageSettings,
    "Commissions": Commissions,
    "Community": Community,
    "DocumentVault": DocumentVault,
    "MyTransactions": MyTransactions,
    "Reports": Reports,
    "Resources": Resources,
    "SubmitCDA": SubmitCDA,
}

export const pagesConfig = {
    mainPage: "AgentDashboard",
    Pages: PAGES,
};