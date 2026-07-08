import { LockKeyhole, ShieldCheck } from "lucide-react";

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-md border-b border-border">
      <div className="section-container flex items-center justify-between h-16 md:h-20">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center font-bold tracking-tight shadow-sm">
            TJ
          </div>
          <div className="leading-none">
            <span className="block text-base md:text-lg font-bold text-foreground tracking-[0.14em] uppercase">TJ Organization</span>
            <span className="block text-[10px] md:text-xs text-muted-foreground uppercase tracking-[0.22em] mt-1">Private File Workspace</span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground bg-muted px-3 py-2 rounded-full">
            <ShieldCheck className="w-4 h-4 text-primary" /> No public access
          </div>
          <a href="#login" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary-dark transition-colors">
            <LockKeyhole className="w-4 h-4" /> Login
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
