import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Button } from "./button";
import { Logo } from "../Logo";

export function FloatingNav() {
  return (
    <header className="fixed top-4 left-1/2 z-50 w-[70%] max-w-4xl -translate-x-1/2">
      <nav className="flex items-center justify-between rounded-full border border-black/10 bg-white/80 px-6 py-3 shadow-[0_8px_30px_rgba(24,30,21,0.08)] backdrop-blur-md">
        <span className="flex items-center gap-2 text-base font-extrabold text-brand-black">
          <Logo size={22} />
          Mandate
        </span>
        <div className="hidden items-center gap-6 sm:flex">
          <a href="#how-it-works" className="text-sm text-brand-black hover:text-brand-text-dim">
            How it works
          </a>
          <a href="#faq" className="text-sm text-brand-black hover:text-brand-text-dim">
            FAQ
          </a>
        </div>
        <Button asChild size="sm">
          <Link to="/agents">
            Launch app
            <ArrowRight size={14} strokeWidth={2} />
          </Link>
        </Button>
      </nav>
    </header>
  );
}
