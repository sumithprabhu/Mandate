import { Routes, Route, NavLink, Link, Outlet } from "react-router-dom";
import { LayoutGrid, Network } from "lucide-react";

import "./shell.css";
import { ConnectWalletButton } from "./components/ConnectWalletButton";
import { HomePage } from "./pages/Home";
import { AgentsPage } from "./pages/Agents";
import { AgentDetailPage } from "./pages/AgentDetail";
import { ProposePage } from "./pages/Propose";
import { ActionPendingPage } from "./pages/ActionPending";
import { ActionResultPage } from "./pages/ActionResult";
import { TrustPage } from "./pages/Trust";

function AppShell() {
  return (
    <div className="shell">
      <nav className="nav">
        <Link to="/" className="nav__brand">
          Mandate
        </Link>
        <div className="nav__links">
          <NavLink to="/agents" className={({ isActive }) => `nav__link${isActive ? " active" : ""}`}>
            <LayoutGrid size={16} strokeWidth={1.5} />
            Agents
          </NavLink>
          <NavLink to="/trust" className={({ isActive }) => `nav__link${isActive ? " active" : ""}`}>
            <Network size={16} strokeWidth={1.5} />
            Trust
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
        <Route path="/actions/:id/pending" element={<ActionPendingPage />} />
        <Route path="/actions/:id/result" element={<ActionResultPage />} />
        <Route path="/trust" element={<TrustPage />} />
      </Route>
    </Routes>
  );
}
