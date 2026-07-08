import { motion } from "framer-motion";
import {
  Archive,
  BriefcaseBusiness,
  CheckCircle2,
  Clock3,
  FileText,
  Folder,
  Gavel,
  LockKeyhole,
  Search,
  ShieldCheck,
  UploadCloud,
  UserRoundCheck,
} from "lucide-react";
import PageLayout from "@/components/PageLayout";
import AnimatedSection from "@/components/AnimatedSection";

const folders = ["Complaints", "Discovery", "Medical Records", "Bills", "Insurance", "Court Docs", "Police Reports", "Correspondence"];

const recentFiles = [
  { name: "Complaint - Filed.pdf", case: "Karen Dorsey", type: "Court Docs", date: "Today" },
  { name: "Initial Disclosures.docx", case: "Leo Morrill", type: "Discovery", date: "Yesterday" },
  { name: "Hospital Bills Packet.pdf", case: "Marissa Ayar", type: "Bills", date: "Jul 2" },
];

const cases = [
  { name: "Karen Dorsey", label: "Slip and Fall", files: 42, status: "Active" },
  { name: "Leo Morrill", label: "Auto Accident", files: 67, status: "Discovery" },
  { name: "Marissa Ayar", label: "No-Fault", files: 31, status: "Organizing" },
];

const securityItems = [
  { icon: LockKeyhole, title: "Login-only workspace", description: "Everything stays behind a private sign-in screen for approved users only." },
  { icon: Search, title: "Hidden from Google", description: "No public marketing pages, no sitemap promotion, and noindex rules built in." },
  { icon: UserRoundCheck, title: "Two-user access", description: "Designed for you and Attorney Tim first, with room to add more approved users later." },
  { icon: Archive, title: "Filevine-style order", description: "Cases, folders, upload history, notes, and search without client messaging clutter." },
];

const Home = () => {
  return (
    <PageLayout>
      <section className="relative overflow-hidden min-h-[88vh] flex items-center bg-background">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,hsl(var(--primary-light)),transparent_38%),linear-gradient(135deg,hsl(var(--background)),hsl(var(--muted)))]" />
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background to-transparent" />

        <div className="relative section-container grid lg:grid-cols-[1fr_0.92fr] gap-12 items-center py-24 md:py-32">
          <motion.div initial={{ opacity: 0, y: 32 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
            <span className="badge-accent mb-6">Private Legal File Organizer</span>
            <h1 className="heading-display mb-6 max-w-4xl">TJ Organization</h1>
            <p className="text-body-lg mb-8 max-w-2xl">
              A clean internal workspace for TJY Law files: case folders, document categories, uploads, notes, and search. No public website energy. Just organized files and smooth access.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 mb-10">
              <a href="#login" className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary-dark transition-colors duration-200 shadow-lg">
                <LockKeyhole className="w-5 h-5" /> Preview Login Flow
              </a>
              <a href="#workspace" className="inline-flex items-center justify-center gap-2 px-8 py-4 text-base font-semibold rounded-lg border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors duration-200">
                <Folder className="w-5 h-5" /> View Dashboard
              </a>
            </div>
            <div className="grid grid-cols-3 gap-4 max-w-xl">
              {[
                ["2", "Approved Users"],
                ["8", "Core Folders"],
                ["0", "Public Pages"],
              ].map(([num, label]) => (
                <div key={label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <p className="text-2xl font-bold text-foreground">{num}</p>
                  <p className="text-xs uppercase tracking-widest text-muted-foreground mt-1">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 36 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.75, delay: 0.15, ease: [0.22, 1, 0.36, 1] }} className="rounded-3xl border border-border bg-card shadow-2xl overflow-hidden">
            <div className="border-b border-border bg-foreground text-background p-5 flex items-center justify-between">
              <div>
                <p className="text-sm text-background/70">Private dashboard</p>
                <h2 className="text-2xl font-bold font-body">Case Files</h2>
              </div>
              <ShieldCheck className="w-8 h-8 text-primary-light" />
            </div>
            <div className="p-5 md:p-6 space-y-5">
              <div className="rounded-2xl border border-border bg-muted p-4 flex items-center gap-3">
                <Search className="w-5 h-5 text-primary" />
                <span className="text-muted-foreground">Search client, case, file name, or folder...</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {folders.slice(0, 6).map((folder) => (
                  <div key={folder} className="rounded-xl border border-border bg-card p-4 flex items-center gap-3 hover:shadow-md transition-shadow">
                    <Folder className="w-5 h-5 text-primary" />
                    <span className="font-semibold text-sm">{folder}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-2xl border border-border overflow-hidden">
                {recentFiles.map((file) => (
                  <div key={file.name} className="flex items-center justify-between gap-4 p-4 border-b border-border last:border-b-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{file.name}</p>
                        <p className="text-sm text-muted-foreground truncate">{file.case} • {file.type}</p>
                      </div>
                    </div>
                    <span className="text-xs font-semibold bg-primary-light text-primary px-2.5 py-1 rounded-full shrink-0">{file.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      <section id="login" className="section-padding bg-background">
        <div className="section-container grid lg:grid-cols-[0.9fr_1fr] gap-10 items-center">
          <AnimatedSection>
            <span className="badge-accent mb-4">Access Flow</span>
            <h2 className="heading-section mb-6">Private first, always.</h2>
            <p className="text-body mb-6">
              The first screen is a locked login page. Nobody sees cases, file names, client names, or documents unless their account is approved.
            </p>
            <div className="space-y-3">
              {["Email + password login", "Optional 2FA for extra protection", "No public browsing or public case pages", "Session timeout for shared office computers"].map((item) => (
                <div key={item} className="flex items-center gap-3 text-foreground">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </AnimatedSection>

          <AnimatedSection delay={0.1}>
            <div className="max-w-md mx-auto rounded-3xl border border-border bg-card shadow-elevated p-7 md:p-8">
              <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-6">
                <LockKeyhole className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold mb-2">Sign in to TJ Organization</h3>
              <p className="text-muted-foreground mb-6">Approved TJY Law access only.</p>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-foreground">Email</label>
                  <div className="mt-2 rounded-xl border border-border bg-muted px-4 py-3 text-muted-foreground">name@tjylaw.com</div>
                </div>
                <div>
                  <label className="text-sm font-semibold text-foreground">Password</label>
                  <div className="mt-2 rounded-xl border border-border bg-muted px-4 py-3 text-muted-foreground">••••••••••••</div>
                </div>
                <button className="w-full rounded-xl bg-primary text-primary-foreground py-3.5 font-semibold hover:bg-primary-dark transition-colors">Unlock Workspace</button>
              </div>
            </div>
          </AnimatedSection>
        </div>
      </section>

      <section id="workspace" className="section-padding bg-muted">
        <div className="section-container">
          <AnimatedSection>
            <div className="text-center max-w-3xl mx-auto mb-12">
              <span className="badge-accent mb-4">Workspace Flow</span>
              <h2 className="heading-section mb-6">Filevine vibes, without all the extra noise.</h2>
              <p className="text-body">Simple case cards, organized document folders, upload history, and notes. Built for finding the right document fast.</p>
            </div>
          </AnimatedSection>

          <div className="grid lg:grid-cols-[0.75fr_1.25fr] gap-6">
            <AnimatedSection delay={0.1}>
              <div className="card-elevated h-full">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-2xl font-bold">Cases</h3>
                  <BriefcaseBusiness className="w-6 h-6 text-primary" />
                </div>
                <div className="space-y-3">
                  {cases.map((item) => (
                    <div key={item.name} className="rounded-2xl border border-border bg-background p-4 hover:border-primary/40 transition-colors">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="font-bold">{item.name}</p>
                        <span className="text-[11px] uppercase tracking-widest bg-primary-light text-primary px-2 py-1 rounded-full">{item.status}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.label} • {item.files} files</p>
                    </div>
                  ))}
                </div>
              </div>
            </AnimatedSection>

            <AnimatedSection delay={0.18}>
              <div className="card-elevated h-full">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                  <div>
                    <p className="text-sm text-muted-foreground">Selected Case</p>
                    <h3 className="text-2xl font-bold">Karen Dorsey</h3>
                  </div>
                  <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-3 font-semibold hover:bg-primary-dark transition-colors">
                    <UploadCloud className="w-5 h-5" /> Upload File
                  </button>
                </div>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                  {folders.map((folder) => (
                    <div key={folder} className="rounded-xl bg-background border border-border p-4 text-center hover:shadow-md transition-shadow">
                      <Folder className="w-6 h-6 text-primary mx-auto mb-2" />
                      <p className="text-sm font-semibold">{folder}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl bg-background border border-border p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <Gavel className="w-5 h-5 text-primary" />
                    <h4 className="font-bold">Case Notes</h4>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Add quick internal notes here: what was requested, who needs a follow-up, what folder documents belong in, and what still needs to be uploaded.
                  </p>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      <section className="section-padding bg-background">
        <div className="section-container">
          <AnimatedSection>
            <div className="text-center max-w-3xl mx-auto mb-12">
              <span className="badge-accent mb-4">Security Basics</span>
              <h2 className="heading-section mb-6">Built to stay private.</h2>
            </div>
          </AnimatedSection>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {securityItems.map((item, index) => (
              <AnimatedSection key={item.title} delay={0.08 + index * 0.06}>
                <div className="card-elevated h-full text-center">
                  <div className="w-14 h-14 mx-auto mb-5 rounded-xl bg-primary-light flex items-center justify-center">
                    <item.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="heading-card mb-3">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      <section className="section-padding bg-foreground text-background">
        <div className="section-container text-center max-w-3xl">
          <AnimatedSection>
            <Clock3 className="w-10 h-10 mx-auto mb-5 text-primary-light" />
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Next build step: real backend.</h2>
            <p className="text-lg md:text-xl leading-relaxed text-background/70">
              This prototype shows the look and flow. The real version should connect Supabase/Auth + private storage so uploads, users, and case files are actually locked down.
            </p>
          </AnimatedSection>
        </div>
      </section>
    </PageLayout>
  );
};

export default Home;
