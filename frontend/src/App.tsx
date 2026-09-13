import { Routes, Route, NavLink, Link, Outlet } from "react-router-dom";
import { LayoutGrid, UserPlus } from "lucide-react";

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
  return (
    <div className="shell">
      <nav className="nav">
        <div className="nav__brand-row">
          <Link to="/" className="nav__brand">
            Mandate
          </Link>
          <span className="nav__network">Sepolia</span>
        </div>
        <div className="nav__links">
          <NavLink to="/agents" className={({ isActive }) => `nav__link${isActive ? " active" : ""}`}>
            <LayoutGrid size={16} strokeWidth={1.5} />
            Agents
          </NavLink>
          <NavLink to="/register" className={({ isActive }) => `nav__link${isActive ? " active" : ""}`}>
            <UserPlus size={16} strokeWidth={1.5} />
            Register
          </NavLink>
        </div>
        <div className="nav__wallet">
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
