import { Routes, Route, Link, Outlet, useLocation } from "react-router-dom";
import { UserPlus } from "lucide-react";

import "./shell.css";
import { ConnectWalletButton } from "./components/ConnectWalletButton";
import { HomePage } from "./pages/Home";
import { AgentsPage } from "./pages/Agents";
import { AgentDetailPage } from "./pages/AgentDetail";
import { ProposePage } from "./pages/Propose";
import { RegisterPage } from "./pages/Register";
import { ActionPendingPage } from "./pages/ActionPending";
import { ActionResultPage } from "./pages/ActionResult";

function AppShell() {
  const { pathname } = useLocation();
  return (
    <div className="app-shell">
      <nav className="app-nav">
        <div className="app-nav__brand">
          <Link to="/agents" className="app-nav__logo">
            Mandate
          </Link>
          <span className="nav__network">Sepolia</span>
        </div>
        <div className="app-nav__actions">
          {pathname !== "/register" && (
            <Link to="/register" className="btn btn--primary">
              <UserPlus size={16} strokeWidth={1.5} />
              Register agent
            </Link>
          )}
          <ConnectWalletButton />
        </div>
      </nav>
      <div className="main">
        <Outlet />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route element={<AppShell />}>
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/:name" element={<AgentDetailPage />} />
        <Route path="/agents/:name/propose" element={<ProposePage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/actions/:id/pending" element={<ActionPendingPage />} />
        <Route path="/actions/:id/result" element={<ActionResultPage />} />
      </Route>
    </Routes>
  );
}
