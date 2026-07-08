import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  LockKeyhole,
  LogOut,
  Mail,
  Phone,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  StickyNote,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";

type StoredFile = {
  id: string;
  name: string;
  uploadedAt: string;
  type?: string;
  size?: number;
  dataUrl?: string;
};

type FolderItem = {
  id: string;
  name: string;
  files: StoredFile[];
};

type Note = {
  id: string;
  text: string;
  createdAt: string;
};

type Client = {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  email: string;
  dateOfBirth: string;
  dateOfIncident: string;
  ssn: string;
  caseType: string;
  folders: FolderItem[];
  extraFiles: StoredFile[];
  notes: Note[];
};

type ClientForm = Omit<Client, "id" | "folders" | "extraFiles" | "notes">;

type View = "home" | "add-client" | "client-file" | "folder-file";

const STORAGE_KEY = "tj-organization-clients-v5";
const OLD_STORAGE_KEYS = [
  "tj-organization-clients-v4",
  "tj-organization-clients-v3",
  "tj-organization-clients",
];
const AUTH_EMAIL = "tjylaw@site.com";
const AUTH_PASSWORD = "Lukedrew1";
const AUTH_STORAGE_KEY = "tj-organization-auth-v1";
const AUTH_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

const emptyClientForm: ClientForm = {
  firstName: "",
  lastName: "",
  phoneNumber: "",
  email: "",
  dateOfBirth: "",
  dateOfIncident: "",
  ssn: "",
  caseType: "",
};

const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const displayValue = (value: string) => value.trim() || "—";
const titleCase = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const clientName = (client: Client) => {
  const last = titleCase(client.lastName);
  const first = titleCase(client.firstName);
  if (last && first) return `${last}, ${first}`;
  return last || first || "Untitled Client";
};

const formatDate = (date: string) =>
  new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));

const sortClients = (clients: Client[]) =>
  [...clients].sort((a, b) => {
    const last = (a.lastName || "").localeCompare(b.lastName || "");
    if (last !== 0) return last;
    return (a.firstName || "").localeCompare(b.firstName || "");
  });

const cleanFolder = (folder: any): FolderItem => {
  if (typeof folder === "string")
    return { id: newId(), name: folder, files: [] };
  return {
    id: folder?.id || newId(),
    name: folder?.name || "Untitled Folder",
    files: Array.isArray(folder?.files) ? folder.files : [],
  };
};

const cleanClient = (client: Partial<Client>): Client => ({
  id: client.id || newId(),
  firstName: client.firstName || "",
  lastName: client.lastName || "",
  phoneNumber: client.phoneNumber || "",
  email: client.email || "",
  dateOfBirth: client.dateOfBirth || "",
  dateOfIncident: client.dateOfIncident || "",
  ssn: client.ssn || "",
  caseType: client.caseType || "",
  folders: Array.isArray(client.folders) ? client.folders.map(cleanFolder) : [],
  extraFiles: Array.isArray(client.extraFiles) ? client.extraFiles : [],
  notes: Array.isArray(client.notes) ? client.notes : [],
});

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [search, setSearch] = useState("");
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClientForm);
  const [folderName, setFolderName] = useState("");
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [previewFile, setPreviewFile] = useState<StoredFile | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);

  useEffect(() => {
    const saved =
      localStorage.getItem(STORAGE_KEY) ||
      OLD_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setClients(parsed.map(cleanClient));
      } catch {
        setClients([]);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const savedAuth = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!savedAuth) return;
      const parsed = JSON.parse(savedAuth);
      if (parsed?.expiresAt && Date.now() < parsed.expiresAt) {
        setIsLoggedIn(true);
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/client\/([^/]+)(?:\/folder\/([^/]+))?\/?$/);

    if (path === "/add-client") {
      window.history.replaceState(
        { view: "add-client", selectedClientId: null, selectedFolderId: null },
        "",
        path,
      );
      setView("add-client");
      setSelectedClientId(null);
      setSelectedFolderId(null);
      return;
    }

    if (match) {
      const clientId = match[1];
      const folderId = match[2] || null;
      const nextView = folderId ? "folder-file" : "client-file";
      window.history.replaceState(
        { view: nextView, selectedClientId: clientId, selectedFolderId: folderId },
        "",
        path,
      );
      setView(nextView as View);
      setSelectedClientId(clientId);
      setSelectedFolderId(folderId);
      return;
    }

    window.history.replaceState(
      { view: "home", selectedClientId: null, selectedFolderId: null },
      "",
      "/",
    );
  }, []);

  useEffect(() => {
    const handleBrowserBack = (event: PopStateEvent) => {
      const nextView = (event.state?.view as View | undefined) || "home";
      setView(nextView);
      setSelectedClientId(event.state?.selectedClientId || null);
      setSelectedFolderId(event.state?.selectedFolderId || null);
    };
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
  }, [clients]);

  const sortedClients = useMemo(() => sortClients(clients), [clients]);
  const filteredClients = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return sortedClients;
    return sortedClients.filter((client) =>
      `${client.lastName}, ${client.firstName} ${client.caseType} ${client.phoneNumber} ${client.email}`
        .toLowerCase()
        .includes(value),
    );
  }, [search, sortedClients]);

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ?? null;
  const selectedFolder =
    selectedClient?.folders.find((folder) => folder.id === selectedFolderId) ??
    null;

  useEffect(() => {
    if (!isLoggedIn || clients.length === 0) return;
    if ((view === "client-file" || view === "folder-file") && selectedClientId && !selectedClient) {
      setView("home");
      setSelectedClientId(null);
      setSelectedFolderId(null);
      window.history.replaceState(
        { view: "home", selectedClientId: null, selectedFolderId: null },
        "",
        "/",
      );
    }
    if (view === "folder-file" && selectedClient && selectedFolderId && !selectedFolder) {
      setView("client-file");
      setSelectedFolderId(null);
      window.history.replaceState(
        { view: "client-file", selectedClientId: selectedClient.id, selectedFolderId: null },
        "",
        `/client/${selectedClient.id}`,
      );
    }
  }, [isLoggedIn, clients.length, selectedClient, selectedClientId, selectedFolder, selectedFolderId, view]);

  const setAppView = (
    nextView: View,
    nextClientId: string | null = selectedClientId,
    nextFolderId: string | null = selectedFolderId,
    mode: "push" | "replace" = "push",
  ) => {
    const state = {
      view: nextView,
      selectedClientId: nextClientId,
      selectedFolderId: nextFolderId,
    };
    const url =
      nextView === "home"
        ? "/"
        : nextView === "add-client"
          ? "/add-client"
          : nextView === "folder-file"
            ? `/client/${nextClientId}/folder/${nextFolderId}`
            : `/client/${nextClientId}`;

    if (mode === "replace") {
      window.history.replaceState(state, "", url);
    } else {
      window.history.pushState(state, "", url);
    }
    setView(nextView);
    setSelectedClientId(nextClientId);
    setSelectedFolderId(nextFolderId);
  };

  const updateClientForm = (field: keyof ClientForm, value: string) => {
    setClientForm((current) => ({ ...current, [field]: value }));
  };

  const goHome = () => {
    setAppView("home", null, null);
  };

  const openClient = (clientId: string) => {
    setAppView("client-file", clientId, null);
  };

  const openFolder = (folderId: string) => {
    setAppView("folder-file", selectedClientId, folderId);
  };

  const handleLogin = () => {
    if (
      loginEmail.trim().toLowerCase() === AUTH_EMAIL &&
      loginPassword === AUTH_PASSWORD
    ) {
      localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({ expiresAt: Date.now() + AUTH_DURATION_MS }),
      );
      setIsLoggedIn(true);
      setLoginError("");
      setLoginEmail("");
      setLoginPassword("");
      return;
    }
    setLoginError("Wrong email or password.");
  };

  const addClient = () => {
    const cleanedForm = {
      firstName: clientForm.firstName.trim(),
      lastName: clientForm.lastName.trim(),
      phoneNumber: clientForm.phoneNumber.trim(),
      email: clientForm.email.trim(),
      dateOfBirth: clientForm.dateOfBirth.trim(),
      dateOfIncident: clientForm.dateOfIncident.trim(),
      ssn: clientForm.ssn.trim(),
      caseType: clientForm.caseType.trim(),
    };

    if (editingClientId) {
      setClients((current) =>
        sortClients(
          current.map((client) =>
            client.id === editingClientId ? { ...client, ...cleanedForm } : client,
          ),
        ),
      );
      const clientToOpen = editingClientId;
      setClientForm(emptyClientForm);
      setEditingClientId(null);
      openClient(clientToOpen);
      return;
    }

    const client: Client = {
      id: newId(),
      ...cleanedForm,
      folders: [],
      extraFiles: [],
      notes: [],
    };

    setClients((current) => sortClients([...current, client]));
    setClientForm(emptyClientForm);
    openClient(client.id);
  };

  const startEditClient = (client: Client) => {
    setEditingClientId(client.id);
    setClientForm({
      firstName: client.firstName,
      lastName: client.lastName,
      phoneNumber: client.phoneNumber,
      email: client.email,
      dateOfBirth: client.dateOfBirth,
      dateOfIncident: client.dateOfIncident,
      ssn: client.ssn,
      caseType: client.caseType,
    });
    setAppView("add-client", client.id, null);
  };

  const deleteClient = (clientId: string) => {
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;
    if (!window.confirm(`Delete ${clientName(client)}? This cannot be undone.`))
      return;
    setClients((current) => current.filter((item) => item.id !== clientId));
    if (selectedClientId === clientId) goHome();
  };

  const addFolder = () => {
    if (!selectedClient || !folderName.trim()) return;
    const folder: FolderItem = {
      id: newId(),
      name: folderName.trim(),
      files: [],
    };
    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? { ...client, folders: [...client.folders, folder] }
          : client,
      ),
    );
    setFolderName("");
    setIsFolderModalOpen(false);
  };

  const deleteFolder = (folderId: string) => {
    if (!selectedClient) return;
    if (!window.confirm("Delete this folder and its uploaded file list?"))
      return;
    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              folders: client.folders.filter((item) => item.id !== folderId),
            }
          : client,
      ),
    );
  };

  const readUploadedFiles = async (files: FileList | null): Promise<StoredFile[]> => {
    if (!files?.length) return [];

    return Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<StoredFile>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: newId(),
                name: file.name,
                uploadedAt: new Date().toISOString(),
                type: file.type,
                size: file.size,
                dataUrl: typeof reader.result === "string" ? reader.result : undefined,
              });
            reader.onerror = () =>
              resolve({
                id: newId(),
                name: file.name,
                uploadedAt: new Date().toISOString(),
                type: file.type,
                size: file.size,
              });
            reader.readAsDataURL(file);
          }),
      ),
    );
  };

  const addFilesToFolder = async (files: FileList | null) => {
    if (!selectedClient || !selectedFolder || !files?.length) return;
    const newFiles = await readUploadedFiles(files);
    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              folders: client.folders.map((folder) =>
                folder.id === selectedFolder.id
                  ? { ...folder, files: [...newFiles, ...folder.files] }
                  : folder,
              ),
            }
          : client,
      ),
    );
  };

  const addExtraFiles = async (files: FileList | null) => {
    if (!selectedClient || !files?.length) return;
    const newFiles = await readUploadedFiles(files);
    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? { ...client, extraFiles: [...newFiles, ...client.extraFiles] }
          : client,
      ),
    );
  };

  const deleteFolderFile = (fileId: string) => {
    if (!selectedClient || !selectedFolder) return;
    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              folders: client.folders.map((folder) =>
                folder.id === selectedFolder.id
                  ? {
                      ...folder,
                      files: folder.files.filter((file) => file.id !== fileId),
                    }
                  : folder,
              ),
            }
          : client,
      ),
    );
  };

  const deleteExtraFile = (fileId: string) => {
    if (!selectedClient) return;
    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              extraFiles: client.extraFiles.filter(
                (file) => file.id !== fileId,
              ),
            }
          : client,
      ),
    );
  };

  const addNote = () => {
    if (!selectedClient || !noteText.trim()) return;
    const note: Note = {
      id: newId(),
      text: noteText.trim(),
      createdAt: new Date().toISOString(),
    };
    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? { ...client, notes: [note, ...client.notes] }
          : client,
      ),
    );
    setNoteText("");
  };

  const deleteNote = (noteId: string) => {
    if (!selectedClient) return;
    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              notes: client.notes.filter((note) => note.id !== noteId),
            }
          : client,
      ),
    );
  };

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.35),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(148,163,184,0.18),transparent_28%)]" />
        <motion.section
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut" }}
          className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white p-8 text-slate-950 shadow-2xl"
        >
          <div className="mb-8 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.28em] text-blue-600">
                Private Access
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tight">
                TJ Organization
              </h1>
            </div>
            <div className="rounded-2xl bg-blue-600 p-4 text-white">
              <LockKeyhole className="h-7 w-7" />
            </div>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Email</span>
              <input
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600"
                placeholder="Email"
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-slate-700">Password</span>
              <input
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && handleLogin()}
                type="password"
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600"
                placeholder="Password"
              />
            </label>
            {loginError && (
              <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                <ShieldAlert className="h-4 w-4" /> {loginError}
              </div>
            )}
            <button
              onClick={handleLogin}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white transition hover:bg-blue-700"
            >
              <ShieldCheck className="h-5 w-5" /> Log In
            </button>
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            Testing login only. Real private auth/database should be added
            before real client files.
          </p>
        </motion.section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <button onClick={goHome} className="flex items-center gap-3">
            <div className="rounded-2xl bg-blue-600 p-3 text-white shadow-lg shadow-blue-600/20">
              <BriefcaseBusiness className="h-6 w-6" />
            </div>
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-600">
                TJY Law
              </p>
              <h1 className="text-xl font-black">TJ Organization</h1>
            </div>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={goHome}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 font-black text-slate-700 hover:border-blue-200 hover:text-blue-700"
            >
              Home
            </button>
            <button
              onClick={() => {
                localStorage.removeItem(AUTH_STORAGE_KEY);
                setIsLoggedIn(false);
                setAppView("home", null, null, "replace");
              }}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-600 hover:border-slate-300 hover:text-slate-950"
            >
              <LogOut className="h-4 w-4" /> Log Out
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-6">
        {view === "home" && (
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8"
          >
            <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.25em] text-blue-600">
                  Home
                </p>
                <h2 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">
                  Clients A-Z
                </h2>
                <p className="mt-2 text-slate-500">
                  Sorted by last name, then first name.
                </p>
              </div>
              <button
                onClick={() => setAppView("add-client", null, null)}
                className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white hover:bg-blue-700"
              >
                <UserPlus className="h-5 w-5" /> Add Client
              </button>
            </div>
            <div className="mb-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full bg-transparent outline-none"
                placeholder="Search client, case type, phone, email..."
              />
            </div>
            {filteredClients.length === 0 ? (
              <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                <div className="max-w-lg">
                  <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50 text-blue-600">
                    <UserPlus className="h-9 w-9" />
                  </div>
                  <h3 className="text-3xl font-black">No clients yet</h3>
                  <p className="mt-3 text-slate-500">
                    Add your first client file when you're ready.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-slate-200">
                {filteredClients.map((client) => (
                  <div
                    key={client.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openClient(client.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") openClient(client.id);
                    }}
                    className="grid cursor-pointer gap-3 border-b border-slate-200 bg-white p-4 text-left last:border-b-0 hover:bg-blue-50/40 md:grid-cols-[1.5fr_1fr_1fr_auto] md:items-center"
                  >
                    <div>
                      <p className="text-lg font-black">{clientName(client)}</p>
                      <p className="text-sm text-slate-500">
                        {displayValue(client.caseType)}
                      </p>
                    </div>
                    <p className="text-sm text-slate-500">
                      Incident:{" "}
                      <span className="font-bold text-slate-700">
                        {displayValue(client.dateOfIncident)}
                      </span>
                    </p>
                    <p className="text-sm text-slate-500">
                      Folders:{" "}
                      <span className="font-bold text-slate-700">
                        {client.folders.length}
                      </span>
                    </p>
                    <div className="flex items-center gap-2 md:justify-end">
                      <span className="hidden items-center gap-1 text-sm font-black text-blue-700 md:flex">
                        Open <ChevronRight className="h-4 w-4" />
                      </span>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteClient(client.id);
                        }}
                        className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        )}

        {view === "add-client" && (
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8"
          >
            <button
              onClick={goHome}
              className="mb-6 flex items-center gap-2 font-bold text-slate-500 hover:text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" /> Home
            </button>
            <div className="mb-8 border-b border-slate-200 pb-6">
              <p className="text-sm font-black uppercase tracking-[0.25em] text-blue-600">
                {editingClientId ? "Edit Client" : "Add Client"}
              </p>
              <h2 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">
                {editingClientId ? "Edit Client File" : "New Client File"}
              </h2>
              <p className="mt-2 text-slate-500">
                Nothing is required. Fill in whatever you have.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <TextInput
                value={clientForm.firstName}
                onChange={(value) => updateClientForm("firstName", value)}
                placeholder="First Name"
              />
              <TextInput
                value={clientForm.lastName}
                onChange={(value) => updateClientForm("lastName", value)}
                placeholder="Last Name"
              />
              <TextInput
                value={clientForm.phoneNumber}
                onChange={(value) => updateClientForm("phoneNumber", value)}
                placeholder="Phone Number"
              />
              <TextInput
                value={clientForm.email}
                onChange={(value) => updateClientForm("email", value)}
                placeholder="Email"
              />
              <DateInput
                label="Date of Birth"
                value={clientForm.dateOfBirth}
                onChange={(value) => updateClientForm("dateOfBirth", value)}
              />
              <DateInput
                label="Date of Incident"
                value={clientForm.dateOfIncident}
                onChange={(value) => updateClientForm("dateOfIncident", value)}
              />
              <TextInput
                value={clientForm.ssn}
                onChange={(value) => updateClientForm("ssn", value)}
                placeholder="SSN"
              />
              <TextInput
                value={clientForm.caseType}
                onChange={(value) => updateClientForm("caseType", value)}
                placeholder="Case Type"
              />
            </div>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={addClient}
                className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-4 font-black text-white hover:bg-blue-700"
              >
                <Plus className="h-5 w-5" /> {editingClientId ? "Save Changes" : "Create Client File"}
              </button>
              <button
                onClick={() => {
                  setClientForm(emptyClientForm);
                  setEditingClientId(null);
                }}
                className="rounded-2xl border border-slate-200 bg-white px-6 py-4 font-black text-slate-600 hover:border-slate-300 hover:text-slate-950"
              >
                {editingClientId ? "Cancel Edit" : "Clear Form"}
              </button>
            </div>
          </motion.section>
        )}

        {(view === "client-file" || view === "folder-file") && !selectedClient && (
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex min-h-[480px] items-center justify-center rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"
          >
            <div>
              <h2 className="text-4xl font-black">Loading client file...</h2>
              <p className="mt-2 text-slate-500">If it does not load, use Home to return to the client list.</p>
              <button
                onClick={goHome}
                className="mt-5 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700"
              >
                Home
              </button>
            </div>
          </motion.section>
        )}

        {view === "client-file" && selectedClient && (
          <ClientShell
            selectedClient={selectedClient}
            goHome={goHome}
            noteText={noteText}
            setNoteText={setNoteText}
            addNote={addNote}
            deleteNote={deleteNote}
            view={view}
            selectedFolder={selectedFolder}
            setAppView={setAppView}
            startEditClient={startEditClient}
          >
            <section className="space-y-6">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-2xl font-black">Folders</h3>
                    <p className="text-sm text-slate-500">
                      Click a folder to open its own upload page.
                    </p>
                  </div>
                  <button
                    onClick={() => setIsFolderModalOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-slate-800"
                  >
                    <FolderPlus className="h-5 w-5" /> New Folder
                  </button>
                </div>
                {selectedClient.folders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                    No folders yet.
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {selectedClient.folders.map((folder) => (
                      <article
                        key={folder.id}
                        className="group rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-white hover:shadow-md"
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <button
                            onClick={() => openFolder(folder.id)}
                            className="rounded-2xl bg-blue-50 p-3 text-blue-700 group-hover:bg-blue-600 group-hover:text-white"
                          >
                            <Folder className="h-6 w-6" />
                          </button>
                          <button
                            onClick={() => deleteFolder(folder.id)}
                            className="rounded-xl p-2 text-slate-300 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          onClick={() => openFolder(folder.id)}
                          className="block w-full text-left"
                        >
                          <h4 className="text-base font-black">{folder.name}</h4>
                          <p className="mt-1 text-sm text-slate-500">
                            {folder.files.length} files
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-xs font-black text-blue-700">
                            Open folder <ChevronRight className="h-4 w-4" />
                          </div>
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-4">
                  <h3 className="text-2xl font-black">Extra Files</h3>
                  <p className="text-sm text-slate-500">
                    Catch-all upload section for files that do not need their own folder.
                  </p>
                </div>
                <UploadBox label="Upload extra files" onFiles={addExtraFiles} />
                <FileList
                  files={selectedClient.extraFiles}
                  emptyText="No extra files yet."
                  onDelete={deleteExtraFile}
                  onPreview={setPreviewFile}
                />
              </div>
            </section>
          </ClientShell>
        )}

        {view === "folder-file" && selectedClient && selectedFolder && (
          <ClientShell
            selectedClient={selectedClient}
            goHome={goHome}
            noteText={noteText}
            setNoteText={setNoteText}
            addNote={addNote}
            deleteNote={deleteNote}
            view={view}
            selectedFolder={selectedFolder}
            setAppView={setAppView}
            startEditClient={startEditClient}
          >
            <section className="space-y-6">
              <button
                onClick={() => setAppView("client-file", selectedClient.id, null)}
                className="flex items-center gap-2 font-bold text-slate-500 hover:text-slate-950"
              >
                <ArrowLeft className="h-4 w-4" /> Back to{" "}
                {clientName(selectedClient)}
              </button>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-5 flex items-center gap-4">
                  <div className="rounded-3xl bg-blue-600 p-4 text-white">
                    <FolderOpen className="h-8 w-8" />
                  </div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.22em] text-blue-600">
                      Folder
                    </p>
                    <h3 className="text-3xl font-black">
                      {selectedFolder.name}
                    </h3>
                  </div>
                </div>
                <UploadBox
                  label="Upload files to this folder"
                  onFiles={addFilesToFolder}
                />
                <FileList
                  files={selectedFolder.files}
                  emptyText="No files uploaded in this folder yet."
                  onDelete={deleteFolderFile}
                  onPreview={setPreviewFile}
                />
              </div>
            </section>
          </ClientShell>
        )}
      </div>
      {previewFile && (
        <FilePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
      )}
      {isFolderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-5 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <div className="mb-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
                New Folder
              </p>
              <h3 className="mt-1 text-3xl font-black">Create folder</h3>
              <p className="mt-2 text-sm text-slate-500">
                Name it whatever you want. Nothing is preloaded.
              </p>
            </div>
            <input
              autoFocus
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addFolder()}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600"
              placeholder="Folder Name"
            />
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => {
                  setIsFolderModalOpen(false);
                  setFolderName("");
                }}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-600 hover:border-slate-300 hover:text-slate-950"
              >
                Cancel
              </button>
              <button
                onClick={addFolder}
                className="flex-1 rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700"
              >
                Create
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}

function Breadcrumbs({
  selectedClient,
  selectedFolder,
  view,
  goHome,
  setAppView,
}: {
  selectedClient: Client;
  selectedFolder: FolderItem | null;
  view: View;
  goHome: () => void;
  setAppView: (view: View, clientId?: string | null, folderId?: string | null) => void;
}) {
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm font-black text-slate-500">
      <button
        onClick={goHome}
        className="rounded-xl bg-white px-3 py-2 hover:text-blue-700"
      >
        Home
      </button>
      <ChevronRight className="h-4 w-4 text-slate-300" />
      <button
        onClick={() => setAppView("client-file", selectedClient.id, null)}
        className="rounded-xl bg-white px-3 py-2 hover:text-blue-700"
      >
        {clientName(selectedClient)}
      </button>
      {view === "folder-file" && selectedFolder && (
        <>
          <ChevronRight className="h-4 w-4 text-slate-300" />
          <span className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700">
            {selectedFolder.name}
          </span>
        </>
      )}
    </nav>
  );
}

function ClientShell({
  selectedClient,
  selectedFolder,
  view,
  goHome,
  setAppView,
  startEditClient,
  noteText,
  setNoteText,
  addNote,
  deleteNote,
  children,
}: {
  selectedClient: Client;
  selectedFolder: FolderItem | null;
  view: View;
  goHome: () => void;
  setAppView: (view: View, clientId?: string | null, folderId?: string | null) => void;
  startEditClient: (client: Client) => void;
  noteText: string;
  setNoteText: (value: string) => void;
  addNote: () => void;
  deleteNote: (noteId: string) => void;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <Breadcrumbs
        selectedClient={selectedClient}
        selectedFolder={selectedFolder}
        view={view}
        goHome={goHome}
        setAppView={setAppView}
      />
      <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">
              Client File
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">
              {clientName(selectedClient)}
            </h2>
            <p className="mt-1 text-sm font-black text-slate-500">
              {displayValue(selectedClient.caseType)}
            </p>
          </div>
          <button
            onClick={() => startEditClient(selectedClient)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-500 hover:border-blue-200 hover:text-blue-700"
          >
            Edit Client
          </button>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard
            icon={<BriefcaseBusiness className="h-4 w-4" />}
            label="Case Type"
            value={selectedClient.caseType}
          />
          <InfoCard
            icon={<Phone className="h-4 w-4" />}
            label="Phone"
            value={selectedClient.phoneNumber}
          />
          <InfoCard
            icon={<Mail className="h-4 w-4" />}
            label="Email"
            value={selectedClient.email}
          />
          <InfoCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Date of Birth"
            value={selectedClient.dateOfBirth}
          />
          <InfoCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Date of Incident"
            value={selectedClient.dateOfIncident}
          />
          <InfoCard label="SSN" value={selectedClient.ssn} />
          <InfoCard
            label="Folders"
            value={`${selectedClient.folders.length}`}
          />
          <InfoCard
            label="Extra Files"
            value={`${selectedClient.extraFiles.length}`}
          />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_390px]">
        {children}
        <StickyNotes
          selectedClient={selectedClient}
          noteText={noteText}
          setNoteText={setNoteText}
          addNote={addNote}
          deleteNote={deleteNote}
        />
      </div>
    </motion.section>
  );
}

function StickyNotes({
  selectedClient,
  noteText,
  setNoteText,
  addNote,
  deleteNote,
}: {
  selectedClient: Client;
  noteText: string;
  setNoteText: (value: string) => void;
  addNote: () => void;
  deleteNote: (noteId: string) => void;
}) {
  return (
    <section className="rounded-3xl border border-yellow-200 bg-yellow-50/80 p-5 shadow-sm xl:sticky xl:top-28 xl:self-start">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-yellow-300 p-3 text-slate-950">
          <StickyNote className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-2xl font-black">Sticky Notes</h3>
          <p className="text-sm text-slate-600">
            Case notes stay on the right.
          </p>
        </div>
      </div>
      <textarea
        value={noteText}
        onChange={(event) => setNoteText(event.target.value)}
        className="min-h-32 w-full rounded-2xl border border-yellow-200 bg-white/80 px-4 py-3 outline-none focus:border-yellow-400"
        placeholder="Type a new note..."
      />
      <button
        onClick={addNote}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-slate-800"
      >
        <Check className="h-5 w-5" /> Add Note
      </button>
      <div className="mt-5 space-y-3">
        {selectedClient.notes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-yellow-300 bg-white/50 p-6 text-center text-slate-500">
            No notes yet.
          </div>
        ) : (
          selectedClient.notes.map((note) => (
            <article
              key={note.id}
              className="rounded-2xl border border-yellow-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                  {formatDate(note.createdAt)}
                </p>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="rounded-xl p-2 text-slate-300 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="whitespace-pre-wrap leading-relaxed text-slate-700">
                {note.text}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600"
      placeholder={placeholder}
    />
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-600">
        {label}
      </span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600"
      />
    </label>
  );
}

function InfoCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
        {icon}
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-black text-slate-800">
        {displayValue(value)}
      </p>
    </div>
  );
}

function UploadBox({
  label,
  onFiles,
}: {
  label: string;
  onFiles: (files: FileList | null) => void;
}) {
  return (
    <label className="mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center transition hover:border-blue-300 hover:bg-blue-50/40">
      <div className="mb-2 rounded-xl bg-white p-3 text-blue-600 shadow-sm">
        <Upload className="h-5 w-5" />
      </div>
      <p className="text-sm font-black">{label}</p>
      <p className="mt-1 text-sm text-slate-500">
        Click here and select one or more files.
      </p>
      <input
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          onFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </label>
  );
}

function FileList({
  files,
  emptyText,
  onDelete,
  onPreview,
}: {
  files: StoredFile[];
  emptyText: string;
  onDelete: (fileId: string) => void;
  onPreview: (file: StoredFile) => void;
}) {
  if (files.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {files.map((file) => (
        <div
          key={file.id}
          role="button"
          tabIndex={0}
          onClick={() => onPreview(file)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onPreview(file);
          }}
          className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-2 transition hover:border-blue-200 hover:bg-blue-50/30"
        >
          <div className="flex w-full items-center gap-3 text-left">
            <FileThumb file={file} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black group-hover:text-blue-700">
                {file.name}
              </p>
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                {formatDate(file.uploadedAt)}
              </p>
            </div>
          </div>
          <div className="mt-2 flex justify-end border-t border-slate-100 pt-2">
            <button
              onClick={(event) => {
                event.stopPropagation();
                onDelete(file.id);
              }}
              className="rounded-lg px-2 py-1 text-xs font-black text-slate-300 hover:bg-red-50 hover:text-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function FileThumb({ file }: { file: StoredFile }) {
  if (file.dataUrl && file.type?.startsWith("image/")) {
    return (
      <img
        src={file.dataUrl}
        alt=""
        className="h-14 w-14 rounded-lg border border-slate-200 object-cover"
      />
    );
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-slate-200 bg-blue-50 text-blue-700">
      <FileUp className="h-5 w-5" />
    </div>
  );
}

function FilePreviewModal({
  file,
  onClose,
}: {
  file: StoredFile;
  onClose: () => void;
}) {
  const canPreview = Boolean(file.dataUrl);
  const isImage = file.type?.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const isText = file.type?.startsWith("text/");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
              File Preview
            </p>
            <h3 className="truncate text-xl font-black">{file.name}</h3>
          </div>
          <div className="flex gap-2">
            {file.dataUrl && isPdf && (
              <a
                href={file.dataUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-50"
              >
                Open
              </a>
            )}
            {file.dataUrl && (
              <a
                href={file.dataUrl}
                download={file.name}
                className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700"
              >
                Download
              </a>
            )}
            <button
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 hover:text-slate-950"
            >
              Close
            </button>
          </div>
        </div>
        <div className="min-h-[480px] overflow-auto bg-slate-100 p-4">
          {!canPreview ? (
            <div className="flex h-[480px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center text-slate-500">
              <div>
                <FileUp className="mx-auto mb-3 h-10 w-10 text-blue-600" />
                <p className="font-black">Preview unavailable for this saved file.</p>
                <p className="mt-1 text-sm">Upload it again in this version to preview/download it.</p>
              </div>
            </div>
          ) : isImage ? (
            <img
              src={file.dataUrl}
              alt={file.name}
              className="mx-auto max-h-[70vh] rounded-2xl bg-white object-contain shadow-sm"
            />
          ) : isPdf ? (
            <object
              data={file.dataUrl}
              type="application/pdf"
              className="h-[70vh] w-full rounded-2xl border border-slate-200 bg-white"
            >
              <div className="flex h-[70vh] items-center justify-center rounded-2xl bg-white text-center text-slate-500">
                <div>
                  <FileUp className="mx-auto mb-3 h-10 w-10 text-blue-600" />
                  <p className="font-black">Chrome did not show the PDF preview here.</p>
                  {file.dataUrl && (
                    <a
                      href={file.dataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700"
                    >
                      Open PDF in new tab
                    </a>
                  )}
                </div>
              </div>
            </object>
          ) : isText ? (
            <iframe
              src={file.dataUrl}
              title={file.name}
              className="h-[70vh] w-full rounded-2xl border border-slate-200 bg-white"
            />
          ) : (
            <div className="flex h-[480px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-center text-slate-500">
              <div>
                <FileUp className="mx-auto mb-3 h-10 w-10 text-blue-600" />
                <p className="font-black">This file type may not preview in the browser.</p>
                <p className="mt-1 text-sm">Use Download to open it on your computer.</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
