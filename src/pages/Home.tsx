import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import AIClientImport from "@/components/AIClientImport";
import CaseAI from "@/components/CaseAI";
import { getCurrentSession, loginWithEmail, logout } from "@/services/auth";
import {
  createEvent as createEventInDb,
  getEvents,
  restoreEvent,
  softDeleteEvent,
  updateEvent as updateEventInDb,
  type EventRow,
} from "@/services/events";
import {
  createClient as createClientInDb,
  getClients,
  restoreClient,
  softDeleteClient,
  updateClient as updateClientInDb,
  type ClientRow,
} from "@/services/clients";
import {
  createFolder as createFolderInDb,
  getFolders,
  restoreFolder,
  softDeleteFolder,
  type FolderRow,
} from "@/services/folders";
import {
  createNote as createNoteInDb,
  getNotes,
  restoreNote,
  softDeleteNote,
  updateNoteCompletion,
  type NoteRow,
} from "@/services/notes";
import {
  getFiles,
  getSignedFileUrl,
  moveFiles as moveFilesInDb,
  renameFile as renameFileInDb,
  restoreFile,
  softDeleteFile,
  uploadClientFile,
  type FileRow,
} from "@/services/files";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarDays,
  ChevronLeft,
  Check,
  CheckCircle2,
  CheckSquare2,
  ChevronRight,
  FileUp,
  Folder,
  FolderOpen,
  FolderPlus,
  LockKeyhole,
  LogOut,
  Mail,
  MoveRight,
  Pencil,
  Phone,
  Plus,
  Search,
  Clock3,
  RotateCcw,
  Square,
  ShieldAlert,
  ShieldCheck,
  StickyNote,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  X,
} from "lucide-react";

type StoredFile = {
  id: string;
  name: string;
  uploadedAt: string;
  type?: string;
  size?: number;
  dataUrl?: string;
  storagePath?: string;
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
  completed: boolean;
};

type CalendarEvent = {
  id: string;
  clientId: string | null;
  title: string;
  eventType: string;
  startAt: string;
  endAt: string;
  location: string;
  notes: string;
};

type EventForm = Omit<CalendarEvent, "id">;

type UndoAction = {
  message: string;
  undo: () => Promise<void>;
};

type ClientStatus = "Active" | "Waiting on Records" | "Litigation" | "Settlement" | "Closed";

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
  status: ClientStatus;
  folders: FolderItem[];
  extraFiles: StoredFile[];
  notes: Note[];
};

type ClientForm = Omit<Client, "id" | "folders" | "extraFiles" | "notes">;

type View = "home" | "calendar" | "add-client" | "client-file" | "folder-file";

const STORAGE_KEY = "tj-organization-clients-v5";
const RECENT_CLIENTS_KEY = "tj-organization-recent-clients-v1";
const OLD_STORAGE_KEYS = [
  "tj-organization-clients-v4",
  "tj-organization-clients-v3",
  "tj-organization-clients",
];


const emptyClientForm: ClientForm = {
  firstName: "",
  lastName: "",
  phoneNumber: "",
  email: "",
  dateOfBirth: "",
  dateOfIncident: "",
  ssn: "",
  caseType: "",
  status: "Active",
};


const emptyEventForm: EventForm = {
  clientId: null,
  title: "",
  eventType: "Phone Call",
  startAt: "",
  endAt: "",
  location: "",
  notes: "",
};

const EVENT_TYPES = [
  "Court",
  "Deposition",
  "Phone Call",
  "Client Meeting",
  "Mediation",
  "Deadline",
  "Other",
];

const eventTypeClasses: Record<string, string> = {
  Court: "border-blue-200 bg-blue-50 text-blue-700",
  Deposition: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Phone Call": "border-orange-200 bg-orange-50 text-orange-700",
  "Client Meeting": "border-amber-200 bg-amber-50 text-amber-700",
  Mediation: "border-violet-200 bg-violet-50 text-violet-700",
  Deadline: "border-red-200 bg-red-50 text-red-700",
  Other: "border-slate-200 bg-slate-100 text-slate-700",
};

const CLIENT_STATUSES: ClientStatus[] = [
  "Active",
  "Waiting on Records",
  "Litigation",
  "Settlement",
  "Closed",
];

const statusClasses: Record<ClientStatus, string> = {
  Active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Waiting on Records": "border-amber-200 bg-amber-50 text-amber-700",
  Litigation: "border-blue-200 bg-blue-50 text-blue-700",
  Settlement: "border-violet-200 bg-violet-50 text-violet-700",
  Closed: "border-slate-200 bg-slate-100 text-slate-600",
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

const formatDate = (date: string) => {
  if (!date) return "—";

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return date;

  return parsedDate.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
};

const fileSizeLabel = (size?: number) => {
  if (!size) return "Size unknown";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

const fileTypeLabel = (file: StoredFile) => {
  if (file.type?.includes("pdf") || file.name.toLowerCase().endsWith(".pdf")) return "PDF";
  if (file.type?.startsWith("image/")) return "Image";
  if (file.type?.startsWith("text/")) return "Text";
  return file.name.split(".").pop()?.toUpperCase() || "File";
};

const sortClients = (clients: Client[]) =>
  [...clients].sort((a, b) => {
    const last = (a.lastName || "").localeCompare(b.lastName || "");
    if (last !== 0) return last;
    return (a.firstName || "").localeCompare(b.firstName || "");
  });


const clientFromRow = (row: ClientRow): Client => ({
  id: row.id,
  firstName: row.first_name || "",
  lastName: row.last_name || "",
  phoneNumber: row.phone_number || "",
  email: row.email || "",
  dateOfBirth: row.date_of_birth || "",
  dateOfIncident: row.date_of_incident || "",
  ssn: row.ssn || "",
  caseType: row.case_type || "",
  status: (row.status as ClientStatus) || "Active",
  folders: [],
  extraFiles: [],
  notes: [],
});

const calendarEventFromRow = (row: EventRow): CalendarEvent => ({
  id: row.id,
  clientId: row.client_id,
  title: row.title,
  eventType: row.event_type || "Other",
  startAt: row.start_at,
  endAt: row.end_at || "",
  location: row.location || "",
  notes: row.notes || "",
});

const toDateTimeLocal = (value: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
};

const formatEventTime = (value: string) =>
  new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

const storedFileFromRow = (row: FileRow): StoredFile => ({
  id: row.id,
  name: row.name,
  uploadedAt: row.created_at,
  type: row.file_type || undefined,
  size: row.file_size || undefined,
  storagePath: row.storage_path,
});

const buildClientsFromRows = (
  clientRows: ClientRow[],
  folderRows: FolderRow[],
  noteRows: NoteRow[],
  fileRows: FileRow[],
): Client[] => {
  const clientsById = new Map<string, Client>();

  clientRows.forEach((row) => {
    clientsById.set(row.id, clientFromRow(row));
  });

  folderRows.forEach((row) => {
    const client = clientsById.get(row.client_id);
    if (!client) return;
    client.folders.push({ id: row.id, name: row.name, files: [] });
  });

  noteRows.forEach((row) => {
    const client = clientsById.get(row.client_id);
    if (!client) return;
    client.notes.push({
      id: row.id,
      text: row.content,
      createdAt: row.created_at,
      completed: Boolean(row.completed),
    });
  });

  fileRows.forEach((row) => {
    const client = clientsById.get(row.client_id);
    if (!client) return;
    const file = storedFileFromRow(row);
    if (row.is_extra_file || !row.folder_id) {
      client.extraFiles.push(file);
      return;
    }
    const folder = client.folders.find((item) => item.id === row.folder_id);
    if (folder) folder.files.push(file);
  });

  return sortClients(Array.from(clientsById.values()));
};

const cleanFolder = (folder: unknown): FolderItem => {
  if (typeof folder === "string")
    return { id: newId(), name: folder, files: [] };

  if (folder && typeof folder === "object") {
    const value = folder as Partial<FolderItem>;
    return {
      id: value.id || newId(),
      name: value.name || "Untitled Folder",
      files: Array.isArray(value.files) ? value.files : [],
    };
  }

  return { id: newId(), name: "Untitled Folder", files: [] };
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
  status: client.status || "Active",
  folders: Array.isArray(client.folders) ? client.folders.map(cleanFolder) : [],
  extraFiles: Array.isArray(client.extraFiles) ? client.extraFiles : [],
  notes: Array.isArray(client.notes)
    ? client.notes.map((note) => ({ ...note, completed: Boolean(note.completed) }))
    : [],
});

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [view, setView] = useState<View>("home");
  const [search, setSearch] = useState("");
  const [clientFileSearch, setClientFileSearch] = useState("");
  const [recentClientIds, setRecentClientIds] = useState<string[]>(() => {
    try {
      const saved = window.localStorage.getItem(RECENT_CLIENTS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [clientForm, setClientForm] = useState<ClientForm>(emptyClientForm);
  const [folderName, setFolderName] = useState("");
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [previewFile, setPreviewFile] = useState<StoredFile | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [appError, setAppError] = useState("");
  const [isAiImportOpen, setIsAiImportOpen] = useState(false);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState("");
  const [undoAction, setUndoAction] = useState<UndoAction | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [eventForm, setEventForm] = useState<EventForm>(emptyEventForm);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  const offerUndo = (message: string, undo: () => Promise<void>) => {
    setUndoAction({ message, undo });
  };

  const runUndo = async () => {
    if (!undoAction) return;
    const action = undoAction;
    setUndoAction(null);
    setAppError("");
    try {
      await action.undo();
    } catch (error) {
      setAppError(error instanceof Error ? error.message : "Could not undo that action.");
    }
  };

  const loadWorkspace = async () => {
    setIsDataLoading(true);
    setAppError("");
    const [clientResult, folderResult, noteResult, fileResult, eventResult] = await Promise.all([
      getClients(),
      getFolders(),
      getNotes(),
      getFiles(),
      getEvents(),
    ]);

    const firstError = clientResult.error || folderResult.error || noteResult.error || fileResult.error || eventResult.error;
    if (firstError) {
      setAppError(firstError.message || "Could not load workspace data.");
      setIsDataLoading(false);
      return;
    }

    setClients(buildClientsFromRows(
      clientResult.data || [],
      folderResult.data || [],
      noteResult.data || [],
      fileResult.data || [],
    ));
    setEvents((eventResult.data || []).map((row) => calendarEventFromRow(row as EventRow)));
    setIsDataLoading(false);
  };

  useEffect(() => {
    const checkSession = async () => {
      const { data } = await getCurrentSession();
      if (data.session) {
        setIsLoggedIn(true);
        await loadWorkspace();
      }
    };
    checkSession();
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/client\/([^/]+)(?:\/folder\/([^/]+))?\/?$/);

    if (path === "/calendar") {
      window.history.replaceState(
        { view: "calendar", selectedClientId: null, selectedFolderId: null },
        "",
        path,
      );
      setView("calendar");
      setSelectedClientId(null);
      setSelectedFolderId(null);
      return;
    }

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
    setSelectedFileIds([]);
    setMoveTarget("");
  }, [selectedClientId, selectedFolderId, view]);

  useEffect(() => {
    if (!undoAction) return;
    const timeout = window.setTimeout(() => setUndoAction(null), 10000);
    return () => window.clearTimeout(timeout);
  }, [undoAction]);


  const sortedClients = useMemo(() => sortClients(clients), [clients]);
  const filteredClients = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return sortedClients;
    return sortedClients.filter((client) =>
      `${client.lastName}, ${client.firstName} ${client.status} ${client.caseType} ${client.phoneNumber} ${client.email}`
        .toLowerCase()
        .includes(value),
    );
  }, [search, sortedClients]);

  const recentClients = useMemo(
    () =>
      recentClientIds
        .map((id) => clients.find((client) => client.id === id))
        .filter((client): client is Client => Boolean(client))
        .slice(0, 6),
    [clients, recentClientIds],
  );

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) ?? null;
  const selectedFolder =
    selectedClient?.folders.find((folder) => folder.id === selectedFolderId) ??
    null;

  const clientFileSearchResults = useMemo(() => {
    if (!selectedClient) return [];
    const query = clientFileSearch.trim().toLowerCase();
    if (!query) return [];

    const folderFiles = selectedClient.folders.flatMap((folder) =>
      folder.files
        .filter((file) => file.name.toLowerCase().includes(query))
        .map((file) => ({ file, folderId: folder.id, folderName: folder.name })),
    );

    const extraFiles = selectedClient.extraFiles
      .filter((file) => file.name.toLowerCase().includes(query))
      .map((file) => ({ file, folderId: null as string | null, folderName: "Extra Files" }));

    return [...folderFiles, ...extraFiles];
  }, [clientFileSearch, selectedClient]);

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
        : nextView === "calendar"
          ? "/calendar"
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
    setRecentClientIds((current) => {
      const next = [clientId, ...current.filter((id) => id !== clientId)].slice(0, 6);
      window.localStorage.setItem(RECENT_CLIENTS_KEY, JSON.stringify(next));
      return next;
    });
    setClientFileSearch("");
    setAppView("client-file", clientId, null);
  };

  const openFolder = (folderId: string) => {
    setAppView("folder-file", selectedClientId, folderId);
  };

  const openCalendar = () => setAppView("calendar", null, null);

  const openNewEvent = (clientId: string | null = null, date?: Date) => {
    const start = date || new Date();
    start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
    setEditingEventId(null);
    setEventForm({
      ...emptyEventForm,
      clientId,
      startAt: toDateTimeLocal(start.toISOString()),
    });
    setIsEventModalOpen(true);
  };

  const openEditEvent = (event: CalendarEvent) => {
    setEditingEventId(event.id);
    setEventForm({
      clientId: event.clientId,
      title: event.title,
      eventType: event.eventType,
      startAt: toDateTimeLocal(event.startAt),
      endAt: toDateTimeLocal(event.endAt),
      location: event.location,
      notes: event.notes,
    });
    setIsEventModalOpen(true);
  };

  const saveEvent = async () => {
    if (!eventForm.title.trim() || !eventForm.startAt) return;
    setAppError("");
    const input = {
      client_id: eventForm.clientId || null,
      title: eventForm.title.trim(),
      event_type: eventForm.eventType,
      start_at: new Date(eventForm.startAt).toISOString(),
      end_at: eventForm.endAt ? new Date(eventForm.endAt).toISOString() : null,
      location: eventForm.location.trim() || null,
      notes: eventForm.notes.trim() || null,
    };

    const result = editingEventId
      ? await updateEventInDb(editingEventId, input)
      : await createEventInDb(input);

    if (result.error || !result.data) {
      setAppError(result.error?.message || "Could not save calendar event.");
      return;
    }

    const saved = calendarEventFromRow(result.data as EventRow);
    setEvents((current) =>
      [...current.filter((event) => event.id !== saved.id), saved].sort(
        (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
      ),
    );
    setIsEventModalOpen(false);
    setEditingEventId(null);
    setEventForm(emptyEventForm);
  };

  const deleteCalendarEvent = async (event: CalendarEvent) => {
    const confirmed = window.confirm(`Delete “${event.title}”?`);
    if (!confirmed) return;
    const { error } = await softDeleteEvent(event.id);
    if (error) {
      setAppError(error.message || "Could not delete calendar event.");
      return;
    }
    setEvents((current) => current.filter((item) => item.id !== event.id));
    setIsEventModalOpen(false);
    offerUndo(`Deleted calendar event “${event.title}.”`, async () => {
      const { error: restoreError } = await restoreEvent(event.id);
      if (restoreError) throw restoreError;
      await loadWorkspace();
    });
  };

  const handleLogin = async () => {
  setLoginError("");

  const { error } = await loginWithEmail(
    loginEmail.trim().toLowerCase(),
    loginPassword
  );

  if (error) {
    setLoginError("Wrong email or password.");
    return;
  }

  setIsLoggedIn(true);
  await loadWorkspace();
  setLoginEmail("");
  setLoginPassword("");
};

  const openCaseAISource = (fileId: string) => {
    if (!selectedClient) return;
    const file = [
      ...selectedClient.extraFiles,
      ...selectedClient.folders.flatMap((folder) => folder.files),
    ].find((item) => item.id === fileId);
    if (file) void handlePreviewFile(file);
  };

  const handlePreviewFile = async (file: StoredFile) => {
    if (file.storagePath && !file.dataUrl) {
      const { data, error } = await getSignedFileUrl(file.storagePath);
      if (error || !data?.signedUrl) {
        setAppError(error?.message || "Could not open file preview.");
        return;
      }
      setPreviewFile({ ...file, dataUrl: data.signedUrl });
      return;
    }
    setPreviewFile(file);
  };

  const addClient = async () => {
    setAppError("");
    const cleanedForm = {
      firstName: clientForm.firstName.trim(),
      lastName: clientForm.lastName.trim(),
      phoneNumber: clientForm.phoneNumber.trim(),
      email: clientForm.email.trim(),
      dateOfBirth: clientForm.dateOfBirth.trim(),
      dateOfIncident: clientForm.dateOfIncident.trim(),
      ssn: clientForm.ssn.trim(),
      caseType: clientForm.caseType.trim(),
      status: clientForm.status,
    };

    const dbInput = {
      first_name: cleanedForm.firstName,
      last_name: cleanedForm.lastName,
      phone_number: cleanedForm.phoneNumber,
      email: cleanedForm.email,
      date_of_birth: cleanedForm.dateOfBirth,
      date_of_incident: cleanedForm.dateOfIncident,
      ssn: cleanedForm.ssn,
      case_type: cleanedForm.caseType,
      status: cleanedForm.status,
    };

    if (editingClientId) {
      const { data, error } = await updateClientInDb(editingClientId, dbInput);
      if (error) {
        setAppError(error.message || "Could not save client changes.");
        return;
      }
      if (data) {
        setClients((current) =>
          sortClients(current.map((client) =>
            client.id === editingClientId ? { ...client, ...clientFromRow(data as ClientRow) } : client,
          )),
        );
      }
      const clientToOpen = editingClientId;
      setClientForm(emptyClientForm);
      setEditingClientId(null);
      openClient(clientToOpen);
      return;
    }

    const { data, error } = await createClientInDb(dbInput);
    if (error || !data) {
      setAppError(error?.message || "Could not create client.");
      return;
    }

    const client: Client = {
      ...clientFromRow(data as ClientRow),
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
      status: client.status,
    });
    setAppView("add-client", client.id, null);
  };

  const changeClientStatus = async (clientId: string, status: ClientStatus) => {
    setAppError("");
    const { data, error } = await updateClientInDb(clientId, { status });

    if (error || !data) {
      setAppError(error?.message || "Could not update client status.");
      return;
    }

    setClients((current) =>
      current.map((client) =>
        client.id === clientId ? { ...client, status } : client,
      ),
    );
  };

  const deleteClient = async (clientId: string) => {
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;

    const confirmed = window.confirm(
      `Delete ${clientName(client)}?\n\nThis client file will be removed.`,
    );
    if (!confirmed) return;

    const { error } = await softDeleteClient(clientId);
    if (error) {
      setAppError(error.message || "Could not delete client.");
      return;
    }

    setClients((current) => current.filter((item) => item.id !== clientId));
    if (selectedClientId === clientId) goHome();

    offerUndo(`Deleted ${clientName(client)}.`, async () => {
      const { error: restoreError } = await restoreClient(clientId);
      if (restoreError) throw restoreError;
      await loadWorkspace();
    });
  };

  const addFolder = async () => {
    if (!selectedClient || !folderName.trim()) return;
    const { data, error } = await createFolderInDb({ client_id: selectedClient.id, name: folderName.trim() });
    if (error || !data) {
      setAppError(error?.message || "Could not create folder.");
      return;
    }
    const folder: FolderItem = { id: data.id, name: data.name, files: [] };
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

  const deleteFolder = async (folderId: string) => {
    if (!selectedClient) return;

    const folder = selectedClient.folders.find((item) => item.id === folderId);
    if (!folder) return;

    const confirmed = window.confirm(
      `Delete "${folder.name}"?\n\nThe folder and its file list will be removed.`,
    );
    if (!confirmed) return;

    const { error } = await softDeleteFolder(folderId);
    if (error) {
      setAppError(error.message || "Could not delete folder.");
      return;
    }

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

    offerUndo(`Deleted folder “${folder.name}.”`, async () => {
      const { error: restoreError } = await restoreFolder(folderId);
      if (restoreError) throw restoreError;
      await loadWorkspace();
    });
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
    setAppError("");
    const uploaded: StoredFile[] = [];
    for (const file of Array.from(files)) {
      const { data, error } = await uploadClientFile({
        clientId: selectedClient.id,
        folderId: selectedFolder.id,
        file,
        isExtraFile: false,
      });
      if (error || !data) {
        setAppError(error?.message || `Could not upload ${file.name}.`);
        continue;
      }
      uploaded.push(storedFileFromRow(data as FileRow));
    }
    if (uploaded.length === 0) return;
    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? {
              ...client,
              folders: client.folders.map((folder) =>
                folder.id === selectedFolder.id
                  ? { ...folder, files: [...uploaded, ...folder.files] }
                  : folder,
              ),
            }
          : client,
      ),
    );
  };

  const addExtraFiles = async (files: FileList | null) => {
    if (!selectedClient || !files?.length) return;
    setAppError("");
    const uploaded: StoredFile[] = [];
    for (const file of Array.from(files)) {
      const { data, error } = await uploadClientFile({
        clientId: selectedClient.id,
        file,
        isExtraFile: true,
      });
      if (error || !data) {
        setAppError(error?.message || `Could not upload ${file.name}.`);
        continue;
      }
      uploaded.push(storedFileFromRow(data as FileRow));
    }
    if (uploaded.length === 0) return;
    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? { ...client, extraFiles: [...uploaded, ...client.extraFiles] }
          : client,
      ),
    );
  };

const renameFile = async (fileId: string, currentName: string) => {
  const nextName = window.prompt("Enter a new file name:", currentName);
  if (nextName === null) return;

  const trimmedName = nextName.trim();
  if (!trimmedName || trimmedName === currentName) return;

  setAppError("");
  const { error } = await renameFileInDb(fileId, trimmedName);

  if (error) {
    setAppError(error.message || "Could not rename file.");
    return;
  }

  const applyNameLocally = (name: string) => {
    setClients((current) =>
      current.map((client) => ({
        ...client,
        extraFiles: client.extraFiles.map((file) =>
          file.id === fileId ? { ...file, name } : file,
        ),
        folders: client.folders.map((folder) => ({
          ...folder,
          files: folder.files.map((file) =>
            file.id === fileId ? { ...file, name } : file,
          ),
        })),
      })),
    );
    setPreviewFile((current) =>
      current?.id === fileId ? { ...current, name } : current,
    );
  };

  applyNameLocally(trimmedName);

  offerUndo(`Renamed file to “${trimmedName}.”`, async () => {
    const { error: undoError } = await renameFileInDb(fileId, currentName);
    if (undoError) throw undoError;
    applyNameLocally(currentName);
  });
};

const deleteFolderFile = async (fileId: string) => {
  if (!selectedClient || !selectedFolder) return;

  const file = selectedFolder.files.find((item) => item.id === fileId);
  if (!file) return;

  const confirmed = window.confirm(
    `Are you sure you want to delete "${file.name}"?`,
  );
  if (!confirmed) return;

  setAppError("");
  const { error } = await softDeleteFile(fileId);

  if (error) {
    setAppError(error.message || "Could not delete file.");
    return;
  }

  setClients((current) =>
    current.map((client) =>
      client.id === selectedClient.id
        ? {
            ...client,
            folders: client.folders.map((folder) =>
              folder.id === selectedFolder.id
                ? { ...folder, files: folder.files.filter((item) => item.id !== fileId) }
                : folder,
            ),
          }
        : client,
    ),
  );

  setSelectedFileIds((current) => current.filter((id) => id !== fileId));
  if (previewFile?.id === fileId) setPreviewFile(null);

  offerUndo(`Deleted “${file.name}.”`, async () => {
    const { error: restoreError } = await restoreFile(fileId);
    if (restoreError) throw restoreError;
    await loadWorkspace();
  });
};

  const deleteExtraFile = async (fileId: string) => {
    if (!selectedClient) return;

    const file = selectedClient.extraFiles.find((item) => item.id === fileId);
    if (!file) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${file.name}"?`,
    );
    if (!confirmed) return;

    setAppError("");
    const { error } = await softDeleteFile(fileId);

    if (error) {
      setAppError(error.message || "Could not delete file.");
      return;
    }

    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? { ...client, extraFiles: client.extraFiles.filter((item) => item.id !== fileId) }
          : client,
      ),
    );

    setSelectedFileIds((current) => current.filter((id) => id !== fileId));
    if (previewFile?.id === fileId) setPreviewFile(null);

    offerUndo(`Deleted “${file.name}.”`, async () => {
      const { error: restoreError } = await restoreFile(fileId);
      if (restoreError) throw restoreError;
      await loadWorkspace();
    });
  };

  const addNote = async () => {
    if (!selectedClient || !noteText.trim()) return;
    const { data, error } = await createNoteInDb({ client_id: selectedClient.id, content: noteText.trim() });
    if (error || !data) {
      setAppError(error?.message || "Could not add note.");
      return;
    }
    const note: Note = {
      id: data.id,
      text: data.content,
      createdAt: data.created_at,
      completed: Boolean(data.completed),
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

  const toggleNote = async (noteId: string, completed: boolean) => {
    if (!selectedClient) return;

    const { error } = await updateNoteCompletion(noteId, completed);
    if (error) {
      setAppError(error.message || "Could not update task.");
      return;
    }

    const applyCompletionLocally = (nextCompleted: boolean) => {
      setClients((current) =>
        current.map((client) =>
          client.id === selectedClient.id
            ? {
                ...client,
                notes: client.notes.map((note) =>
                  note.id === noteId ? { ...note, completed: nextCompleted } : note,
                ),
              }
            : client,
        ),
      );
    };

    applyCompletionLocally(completed);

    offerUndo(completed ? "Task completed." : "Task marked incomplete.", async () => {
      const { error: undoError } = await updateNoteCompletion(noteId, !completed);
      if (undoError) throw undoError;
      applyCompletionLocally(!completed);
    });
  };

  const deleteNote = async (noteId: string) => {
    if (!selectedClient) return;

    const note = selectedClient.notes.find((item) => item.id === noteId);
    if (!note) return;

    const confirmed = window.confirm("Are you sure you want to delete this task?");
    if (!confirmed) return;

    setAppError("");
    const { error } = await softDeleteNote(noteId);

    if (error) {
      setAppError(error.message || "Could not delete task.");
      return;
    }

    setClients((current) =>
      current.map((client) =>
        client.id === selectedClient.id
          ? { ...client, notes: client.notes.filter((item) => item.id !== noteId) }
          : client,
      ),
    );

    offerUndo("Deleted task.", async () => {
      const { error: restoreError } = await restoreNote(noteId);
      if (restoreError) throw restoreError;
      await loadWorkspace();
    });
  };

  const moveSelectedFiles = async () => {
    if (!selectedClient || selectedFileIds.length === 0 || !moveTarget) return;

    const destinationFolderId = moveTarget === "extra" ? null : moveTarget;
    const destinationName = destinationFolderId
      ? selectedClient.folders.find((folder) => folder.id === destinationFolderId)?.name || "folder"
      : "Extra Files";

    const origins = selectedFileIds.map((fileId) => {
      if (selectedClient.extraFiles.some((file) => file.id === fileId)) {
        return { fileId, folderId: null as string | null };
      }
      const folder = selectedClient.folders.find((item) =>
        item.files.some((file) => file.id === fileId),
      );
      return { fileId, folderId: folder?.id || null };
    });

    const { error } = await moveFilesInDb(selectedFileIds, destinationFolderId);
    if (error) {
      setAppError(error.message || "Could not move selected files.");
      return;
    }

    const movedCount = selectedFileIds.length;
    setSelectedFileIds([]);
    setMoveTarget("");
    await loadWorkspace();

    offerUndo(
      `Moved ${movedCount} ${movedCount === 1 ? "file" : "files"} to ${destinationName}.`,
      async () => {
        const groups = new Map<string, string[]>();
        origins.forEach(({ fileId, folderId }) => {
          const key = folderId || "extra";
          groups.set(key, [...(groups.get(key) || []), fileId]);
        });

        for (const [key, ids] of groups) {
          const { error: undoError } = await moveFilesInDb(ids, key === "extra" ? null : key);
          if (undoError) throw undoError;
        }
        await loadWorkspace();
      },
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
            Private office login powered by Supabase.
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
              onClick={openCalendar}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 font-black text-slate-700 hover:border-blue-200 hover:text-blue-700"
            >
              <CalendarDays className="h-4 w-4" /> Calendar
            </button>
            <button
              onClick={async () => {
  await logout();
  setIsLoggedIn(false);
  setClients([]);
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
        {appError && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {appError}
          </div>
        )}
        {isDataLoading && (
          <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700">
            Loading secure office data...
          </div>
        )}
        {view === "home" && (
          <motion.section
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"
          >
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
              <div className="mb-6 flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.25em] text-blue-600">Home</p>
                  <h2 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">All Clients</h2>
                  <p className="mt-2 text-slate-500">Sorted by last name, then first name.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={() => setIsAiImportOpen(true)}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-4 font-black text-white hover:bg-violet-700"
                  >
                    <Sparkles className="h-5 w-5" /> AI Import
                  </button>
                  <button
                    onClick={() => setAppView("add-client", null, null)}
                    className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white hover:bg-blue-700"
                  >
                    <UserPlus className="h-5 w-5" /> Add Client
                  </button>
                </div>
              </div>

              <div className="mb-6 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Search className="h-5 w-5 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full bg-transparent outline-none"
                  placeholder="Search client, status, case type, phone, email..."
                />
              </div>

              {filteredClients.length === 0 ? (
                <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                  <div className="max-w-lg">
                    <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-50 text-blue-600">
                      <UserPlus className="h-9 w-9" />
                    </div>
                    <h3 className="text-3xl font-black">No clients found</h3>
                    <p className="mt-3 text-slate-500">Try another search or add a new client.</p>
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
                      className="grid cursor-pointer gap-3 border-b border-slate-200 bg-white p-4 text-left last:border-b-0 hover:bg-blue-50/40 md:grid-cols-[1.4fr_1fr_1fr_auto] md:items-center"
                    >
                      <div>
                        <p className="text-lg font-black">{clientName(client)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-sm text-slate-500">{displayValue(client.caseType)}</p>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${statusClasses[client.status]}`}>
                            {client.status}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-slate-500">Incident: <span className="font-bold text-slate-700">{formatDate(client.dateOfIncident)}</span></p>
                      <p className="text-sm text-slate-500">Folders: <span className="font-bold text-slate-700">{client.folders.length}</span></p>
                      <div className="flex items-center gap-2 md:justify-end">
                        <span className="hidden items-center gap-1 text-sm font-black text-blue-700 md:flex">Open <ChevronRight className="h-4 w-4" /></span>
                        <button
                          onClick={(event) => { event.stopPropagation(); deleteClient(client.id); }}
                          className="rounded-2xl border border-slate-200 bg-white p-3 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
              <button
                onClick={openCalendar}
                className="flex w-full items-center justify-between rounded-3xl border border-blue-200 bg-blue-600 p-5 text-left text-white shadow-sm transition hover:bg-blue-700"
              >
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-100">Office Schedule</p>
                  <h3 className="mt-1 text-2xl font-black">Calendar</h3>
                  <p className="mt-1 text-sm text-blue-100">Calls, court, depositions, deadlines, and meetings.</p>
                </div>
                <CalendarDays className="h-8 w-8 shrink-0" />
              </button>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-5 flex items-center gap-3">
                <div className="rounded-2xl bg-blue-50 p-3 text-blue-700"><Clock3 className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-2xl font-black">Recently Viewed</h3>
                  <p className="text-sm text-slate-500">Your latest client files.</p>
                </div>
              </div>

              {recentClients.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                  Open a client and it will appear here.
                </div>
              ) : (
                <div className="space-y-2">
                  {recentClients.map((client) => (
                    <button
                      key={client.id}
                      onClick={() => openClient(client.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-black text-slate-900">{clientName(client)}</p>
                        <p className="truncate text-xs text-slate-500">{displayValue(client.caseType)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-blue-600" />
                    </button>
                  ))}
                </div>
              )}
              </div>
            </aside>
          </motion.section>
        )}

        {view === "calendar" && (
          <CalendarPage
            events={events}
            clients={clients}
            month={calendarMonth}
            setMonth={setCalendarMonth}
            openNewEvent={openNewEvent}
            openEditEvent={openEditEvent}
            openClient={openClient}
          />
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
              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-600">Client Status</span>
                <select
                  value={clientForm.status}
                  onChange={(event) => updateClientForm("status", event.target.value as ClientStatus)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600"
                >
                  {CLIENT_STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
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
            toggleNote={toggleNote}
            view={view}
            selectedFolder={selectedFolder}
            setAppView={setAppView}
            startEditClient={startEditClient}
            changeClientStatus={changeClientStatus}
            clientEvents={events.filter((event) => event.clientId === selectedClient.id)}
            openCalendar={openCalendar}
            openNewEvent={openNewEvent}
            openEditEvent={openEditEvent}
            showNotes
          >
            <section className="space-y-6">
              

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <Search className="h-5 w-5 text-slate-400" />
                  <input
                    value={clientFileSearch}
                    onChange={(event) => setClientFileSearch(event.target.value)}
                    className="w-full bg-transparent outline-none"
                    placeholder="Search every file in this client..."
                  />
                </div>

                {clientFileSearch.trim() && (
                  <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                    {clientFileSearchResults.length === 0 ? (
                      <div className="p-5 text-center text-sm text-slate-500">No matching files found.</div>
                    ) : (
                      clientFileSearchResults.map(({ file, folderId, folderName }) => (
                        <button
                          key={file.id}
                          onClick={() => {
                            if (folderId) {
                              setAppView("folder-file", selectedClient.id, folderId);
                            } else {
                              handlePreviewFile(file);
                            }
                          }}
                          className="flex w-full items-center justify-between gap-3 border-b border-slate-200 bg-white p-4 text-left last:border-b-0 hover:bg-blue-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-black text-slate-900">{file.name}</p>
                            <p className="mt-1 text-xs font-bold text-slate-500">Located in: {folderName}</p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-blue-600" />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

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
                <FileMoveToolbar
                  selectedCount={selectedFileIds.length}
                  folders={selectedClient.folders}
                  currentFolderId={null}
                  moveTarget={moveTarget}
                  setMoveTarget={setMoveTarget}
                  onMove={moveSelectedFiles}
                  onClear={() => setSelectedFileIds([])}
                />
                <FileList
                  files={selectedClient.extraFiles}
                  emptyText="No extra files yet."
                  onDelete={deleteExtraFile}
                  onRename={renameFile}
                  onPreview={handlePreviewFile}
                  selectedFileIds={selectedFileIds}
                  onToggleSelected={(fileId) =>
                    setSelectedFileIds((current) =>
                      current.includes(fileId)
                        ? current.filter((id) => id !== fileId)
                        : [...current, fileId],
                    )
                  }
                />
              </div>
                  
                  <CaseAI
  clientId={selectedClient.id}
  clientName={clientName(selectedClient)}
  files={[
    ...selectedClient.extraFiles,
    ...selectedClient.folders.flatMap((folder) => folder.files),
  ]}
  onOpenSource={openCaseAISource}
/>
              
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
            toggleNote={toggleNote}
            view={view}
            selectedFolder={selectedFolder}
            setAppView={setAppView}
            startEditClient={startEditClient}
            changeClientStatus={changeClientStatus}
            clientEvents={events.filter((event) => event.clientId === selectedClient.id)}
            openCalendar={openCalendar}
            openNewEvent={openNewEvent}
            openEditEvent={openEditEvent}
            showNotes={false}
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
                <FileMoveToolbar
                  selectedCount={selectedFileIds.length}
                  folders={selectedClient.folders}
                  currentFolderId={selectedFolder.id}
                  moveTarget={moveTarget}
                  setMoveTarget={setMoveTarget}
                  onMove={moveSelectedFiles}
                  onClear={() => setSelectedFileIds([])}
                />
                <FileList
                  files={selectedFolder.files}
                  emptyText="No files uploaded in this folder yet."
                  onDelete={deleteFolderFile}
                  onRename={renameFile}
                  onPreview={handlePreviewFile}
                  selectedFileIds={selectedFileIds}
                  onToggleSelected={(fileId) =>
                    setSelectedFileIds((current) =>
                      current.includes(fileId)
                        ? current.filter((id) => id !== fileId)
                        : [...current, fileId],
                    )
                  }
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
      {undoAction && (
        <div className="fixed bottom-5 left-1/2 z-[70] flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center justify-between gap-4 rounded-2xl bg-slate-950 px-5 py-4 text-white shadow-2xl">
          <p className="text-sm font-bold">{undoAction.message}</p>
          <button
            onClick={runUndo}
            className="flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-950 hover:bg-slate-100"
          >
            <RotateCcw className="h-4 w-4" /> Undo
          </button>
        </div>
      )}
      {isEventModalOpen && (
        <EventModal
          form={eventForm}
          setForm={setEventForm}
          clients={clients}
          editingEvent={editingEventId ? events.find((event) => event.id === editingEventId) || null : null}
          onSave={saveEvent}
          onDelete={deleteCalendarEvent}
          onClose={() => {
            setIsEventModalOpen(false);
            setEditingEventId(null);
            setEventForm(emptyEventForm);
          }}
        />
      )}
      <AIClientImport
        open={isAiImportOpen}
        onClose={() => setIsAiImportOpen(false)}
        onComplete={async (clientId) => {
          await loadWorkspace();
          setIsAiImportOpen(false);
          openClient(clientId);
        }}
      />
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
  changeClientStatus,
  noteText,
  setNoteText,
  addNote,
  deleteNote,
  toggleNote,
  clientEvents,
  openCalendar,
  openNewEvent,
  openEditEvent,
  showNotes = true,
  children,
}: {
  selectedClient: Client;
  selectedFolder: FolderItem | null;
  view: View;
  goHome: () => void;
  setAppView: (view: View, clientId?: string | null, folderId?: string | null) => void;
  startEditClient: (client: Client) => void;
  changeClientStatus: (clientId: string, status: ClientStatus) => void;
  noteText: string;
  setNoteText: (value: string) => void;
  addNote: () => void;
  deleteNote: (noteId: string) => void;
  toggleNote: (noteId: string, completed: boolean) => void;
  clientEvents: CalendarEvent[];
  openCalendar: () => void;
  openNewEvent: (clientId?: string | null, date?: Date) => void;
  openEditEvent: (event: CalendarEvent) => void;
  showNotes?: boolean;
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
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              value={selectedClient.status}
              onChange={(event) => changeClientStatus(selectedClient.id, event.target.value as ClientStatus)}
              className={`rounded-xl border px-3 py-2 text-sm font-black outline-none ${statusClasses[selectedClient.status]}`}
              aria-label="Client status"
            >
              {CLIENT_STATUSES.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <button
              onClick={() => startEditClient(selectedClient)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-500 hover:border-blue-200 hover:text-blue-700"
            >
              Edit Client
            </button>
          </div>
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
           value={formatDate(selectedClient.dateOfBirth)}
          />
          <InfoCard
            icon={<CalendarDays className="h-4 w-4" />}
            label="Date of Incident"
            value={formatDate(selectedClient.dateOfIncident)}
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
        <ClientUpcomingEvents
          events={clientEvents}
          onOpenCalendar={openCalendar}
          onAdd={() => openNewEvent(selectedClient.id)}
          onOpenEvent={openEditEvent}
        />
      </div>
      <div className={showNotes ? "grid gap-6 xl:grid-cols-[1fr_390px]" : "grid gap-6"}>
        {children}
        {showNotes && (
          <StickyNotes
            selectedClient={selectedClient}
            noteText={noteText}
            setNoteText={setNoteText}
            addNote={addNote}
            deleteNote={deleteNote}
            toggleNote={toggleNote}
          />
        )}
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
  toggleNote,
}: {
  selectedClient: Client;
  noteText: string;
  setNoteText: (value: string) => void;
  addNote: () => void;
  deleteNote: (noteId: string) => void;
  toggleNote: (noteId: string, completed: boolean) => void;
}) {
  const activeTasks = selectedClient.notes.filter((note) => !note.completed);
  const completedTasks = selectedClient.notes.filter((note) => note.completed);

  const renderTask = (note: Note) => (
    <article
      key={note.id}
      className={`rounded-2xl border p-4 shadow-sm ${
        note.completed
          ? "border-emerald-200 bg-emerald-50/70"
          : "border-yellow-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => toggleNote(note.id, !note.completed)}
          className={`mt-0.5 shrink-0 rounded-lg transition ${
            note.completed ? "text-emerald-600" : "text-slate-400 hover:text-blue-600"
          }`}
          title={note.completed ? "Mark incomplete" : "Mark complete"}
        >
          {note.completed ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : (
            <Square className="h-6 w-6" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <p
            className={`whitespace-pre-wrap leading-relaxed ${
              note.completed ? "text-slate-500 line-through" : "text-slate-700"
            }`}
          >
            {note.text}
          </p>
          <p className="mt-2 text-xs font-bold text-slate-400">
            {new Date(note.createdAt).toLocaleDateString()}
          </p>
        </div>

        <button
          onClick={() => deleteNote(note.id)}
          className="shrink-0 rounded-xl p-2 text-slate-300 hover:bg-red-50 hover:text-red-600"
          title="Delete task"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </article>
  );

  return (
    <section className="rounded-3xl border border-yellow-200 bg-yellow-50/80 p-5 shadow-sm xl:sticky xl:top-28 xl:self-start">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-yellow-300 p-3 text-slate-950">
          <StickyNote className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-2xl font-black">Tasks</h3>
          <p className="text-sm text-slate-600">
            Write what needs to be done, then check it off.
          </p>
        </div>
      </div>

      <textarea
        value={noteText}
        onChange={(event) => setNoteText(event.target.value)}
        className="min-h-28 w-full rounded-2xl border border-yellow-200 bg-white/80 px-4 py-3 outline-none focus:border-yellow-400"
        placeholder="What needs to be done?"
      />
      <button
        onClick={addNote}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white hover:bg-slate-800"
      >
        <Check className="h-5 w-5" /> Add Task
      </button>

      <div className="mt-5 space-y-3">
        {activeTasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-yellow-300 bg-white/50 p-6 text-center text-slate-500">
            No unfinished tasks.
          </div>
        ) : (
          activeTasks.map(renderTask)
        )}
      </div>

      {completedTasks.length > 0 && (
        <div className="mt-6 border-t border-yellow-200 pt-5">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h4 className="font-black text-slate-700">Completed ({completedTasks.length})</h4>
          </div>
          <div className="space-y-3">{completedTasks.map(renderTask)}</div>
        </div>
      )}
    </section>
  );
}

function ClientUpcomingEvents({
  events,
  onOpenCalendar,
  onAdd,
  onOpenEvent,
}: {
  events: CalendarEvent[];
  onOpenCalendar: () => void;
  onAdd: () => void;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const upcoming = events
    .filter((event) => new Date(event.startAt).getTime() >= Date.now() - 60 * 60 * 1000)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
    .slice(0, 3);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-blue-600" />
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">Upcoming for this client</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onAdd} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-black text-white hover:bg-blue-700">Add Event</button>
          <button onClick={onOpenCalendar} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 hover:text-blue-700">Full Calendar</button>
        </div>
      </div>
      {upcoming.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No upcoming calendar events linked to this client.</p>
      ) : (
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {upcoming.map((event) => (
            <button key={event.id} onClick={() => onOpenEvent(event)} className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-blue-200 hover:bg-blue-50/40">
              <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${eventTypeClasses[event.eventType] || eventTypeClasses.Other}`}>{event.eventType}</span>
              <p className="mt-2 truncate text-sm font-black text-slate-900">{event.title}</p>
              <p className="mt-1 text-xs text-slate-500">{new Date(event.startAt).toLocaleDateString()} · {formatEventTime(event.startAt)}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarPage({
  events,
  clients,
  month,
  setMonth,
  openNewEvent,
  openEditEvent,
  openClient,
}: {
  events: CalendarEvent[];
  clients: Client[];
  month: Date;
  setMonth: (date: Date) => void;
  openNewEvent: (clientId?: string | null, date?: Date) => void;
  openEditEvent: (event: CalendarEvent) => void;
  openClient: (clientId: string) => void;
}) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const gridStart = new Date(year, monthIndex, 1 - firstDay.getDay());
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    return date;
  });
  const todayKey = new Date().toDateString();
  const upcoming = events
    .filter((event) => new Date(event.startAt).getTime() >= Date.now() - 60 * 60 * 1000)
    .slice(0, 8);

  return (
    <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:p-8">
        <div>
          <p className="text-sm font-black uppercase tracking-[0.25em] text-blue-600">Office Calendar</p>
          <h2 className="mt-2 text-4xl font-black tracking-tight md:text-5xl">Schedule</h2>
          <p className="mt-2 text-slate-500">Court, depositions, calls, meetings, mediations, and deadlines.</p>
        </div>
        <button onClick={() => openNewEvent()} className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 font-black text-white hover:bg-blue-700">
          <Plus className="h-5 w-5" /> Add Event
        </button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <button onClick={() => setMonth(new Date(year, monthIndex - 1, 1))} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:text-blue-700"><ChevronLeft className="h-5 w-5" /></button>
            <h3 className="text-2xl font-black">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h3>
            <button onClick={() => setMonth(new Date(year, monthIndex + 1, 1))} className="rounded-xl border border-slate-200 p-2 text-slate-600 hover:text-blue-700"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-7 border-l border-t border-slate-200 text-center text-xs font-black uppercase tracking-wider text-slate-400">
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((day) => <div key={day} className="border-b border-r border-slate-200 bg-slate-50 py-2">{day}</div>)}
          </div>
          <div className="grid grid-cols-7 border-l border-slate-200">
            {days.map((date) => {
              const dayEvents = events.filter((event) => new Date(event.startAt).toDateString() === date.toDateString());
              const inMonth = date.getMonth() === monthIndex;
              const isToday = date.toDateString() === todayKey;
              return (
                <div key={date.toISOString()} onDoubleClick={() => openNewEvent(null, date)} className={`min-h-28 border-b border-r border-slate-200 p-2 ${inMonth ? 'bg-white' : 'bg-slate-50/70'}`}>
                  <button onClick={() => openNewEvent(null, date)} className={`mb-1 flex h-7 w-7 items-center justify-center rounded-full text-xs font-black ${isToday ? 'bg-blue-600 text-white' : inMonth ? 'text-slate-700 hover:bg-blue-50' : 'text-slate-300'}`}>{date.getDate()}</button>
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button key={event.id} onClick={() => openEditEvent(event)} className={`block w-full truncate rounded-lg border px-2 py-1 text-left text-[10px] font-black ${eventTypeClasses[event.eventType] || eventTypeClasses.Other}`}>
                        {formatEventTime(event.startAt)} {event.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && <p className="text-[10px] font-bold text-slate-400">+{dayEvents.length - 3} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-28 xl:self-start">
          <h3 className="text-2xl font-black">Upcoming</h3>
          <p className="mt-1 text-sm text-slate-500">Next office events.</p>
          <div className="mt-4 space-y-3">
            {upcoming.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center text-sm text-slate-500">Nothing scheduled.</p> : upcoming.map((event) => {
              const client = clients.find((item) => item.id === event.clientId);
              return (
                <article key={event.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <button onClick={() => openEditEvent(event)} className="w-full text-left">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${eventTypeClasses[event.eventType] || eventTypeClasses.Other}`}>{event.eventType}</span>
                    <p className="mt-2 font-black text-slate-900">{event.title}</p>
                    <p className="mt-1 text-xs text-slate-500">{new Date(event.startAt).toLocaleDateString()} · {formatEventTime(event.startAt)}</p>
                  </button>
                  {client && <button onClick={() => openClient(client.id)} className="mt-2 text-xs font-black text-blue-700 hover:underline">{clientName(client)}</button>}
                </article>
              );
            })}
          </div>
        </aside>
      </div>
    </motion.section>
  );
}

function EventModal({
  form,
  setForm,
  clients,
  editingEvent,
  onSave,
  onDelete,
  onClose,
}: {
  form: EventForm;
  setForm: React.Dispatch<React.SetStateAction<EventForm>>;
  clients: Client[];
  editingEvent: CalendarEvent | null;
  onSave: () => void;
  onDelete: (event: CalendarEvent) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-5 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Calendar</p><h3 className="mt-1 text-3xl font-black">{editingEvent ? 'Edit Event' : 'Add Event'}</h3></div>
          <button onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="md:col-span-2"><span className="mb-2 block text-sm font-black text-slate-600">Title</span><input autoFocus value={form.title} onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600" placeholder="Deposition, call client, court hearing..." /></label>
          <label><span className="mb-2 block text-sm font-black text-slate-600">Type</span><select value={form.eventType} onChange={(e) => setForm((current) => ({ ...current, eventType: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600">{EVENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label><span className="mb-2 block text-sm font-black text-slate-600">Link Client (optional)</span><select value={form.clientId || ''} onChange={(e) => setForm((current) => ({ ...current, clientId: e.target.value || null }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600"><option value="">No linked client</option>{clients.map((client) => <option key={client.id} value={client.id}>{clientName(client)}</option>)}</select></label>
          <label><span className="mb-2 block text-sm font-black text-slate-600">Starts</span><input type="datetime-local" value={form.startAt} onChange={(e) => setForm((current) => ({ ...current, startAt: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600" /></label>
          <label><span className="mb-2 block text-sm font-black text-slate-600">Ends (optional)</span><input type="datetime-local" value={form.endAt} onChange={(e) => setForm((current) => ({ ...current, endAt: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600" /></label>
          <label className="md:col-span-2"><span className="mb-2 block text-sm font-black text-slate-600">Location (optional)</span><input value={form.location} onChange={(e) => setForm((current) => ({ ...current, location: e.target.value }))} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600" placeholder="Court, office, Zoom, phone..." /></label>
          <label className="md:col-span-2"><span className="mb-2 block text-sm font-black text-slate-600">Notes (optional)</span><textarea value={form.notes} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-600" placeholder="Anything the office needs to know..." /></label>
        </div>
        <div className="mt-6 flex flex-col-reverse justify-between gap-3 sm:flex-row">
          {editingEvent ? <button onClick={() => onDelete(editingEvent)} className="flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 font-black text-red-700 hover:bg-red-100"><Trash2 className="h-4 w-4" /> Delete</button> : <div />}
          <div className="flex gap-3"><button onClick={onClose} className="rounded-2xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-600">Cancel</button><button onClick={onSave} disabled={!form.title.trim() || !form.startAt} className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">Save Event</button></div>
        </div>
      </motion.div>
    </div>
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    onFiles(files);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          inputRef.current?.click();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();

        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setIsDragging(false);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
      className={`mb-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
        isDragging
          ? "scale-[1.01] border-blue-600 bg-blue-50 shadow-md"
          : "border-slate-300 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/40"
      }`}
    >
      <div
        className={`mb-3 rounded-xl p-3 shadow-sm transition ${
          isDragging
            ? "bg-blue-600 text-white"
            : "bg-white text-blue-600"
        }`}
      >
        <Upload className="h-6 w-6" />
      </div>

      <p className="text-base font-black">
        {isDragging ? "Drop files here" : label}
      </p>

      <p className="mt-1 text-sm text-slate-500">
        Drag and drop files here, or click to browse.
      </p>

      <p className="mt-3 rounded-lg bg-white px-3 py-1 text-xs font-bold text-slate-400 shadow-sm">
        Multiple files supported
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          handleFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function FileMoveToolbar({
  selectedCount,
  folders,
  currentFolderId,
  moveTarget,
  setMoveTarget,
  onMove,
  onClear,
}: {
  selectedCount: number;
  folders: FolderItem[];
  currentFolderId: string | null;
  moveTarget: string;
  setMoveTarget: (value: string) => void;
  onMove: () => void;
  onClear: () => void;
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 md:flex-row md:items-center">
      <div className="flex items-center gap-2 font-black text-blue-900">
        <CheckSquare2 className="h-5 w-5" />
        {selectedCount} {selectedCount === 1 ? "file" : "files"} selected
      </div>
      <div className="flex flex-1 flex-col gap-2 sm:flex-row md:justify-end">
        <select
          value={moveTarget}
          onChange={(event) => setMoveTarget(event.target.value)}
          className="min-w-52 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold outline-none focus:border-blue-600"
        >
          <option value="">Move to...</option>
          {currentFolderId !== null && <option value="extra">Extra Files</option>}
          {folders
            .filter((folder) => folder.id !== currentFolderId)
            .map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={onMove}
          disabled={!moveTarget}
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <MoveRight className="h-4 w-4" /> Move
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-black text-blue-700 hover:bg-blue-100"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

function FileList({
  files,
  emptyText,
  onDelete,
  onRename,
  onPreview,
  selectedFileIds,
  onToggleSelected,
}: {
  files: StoredFile[];
  emptyText: string;
  onDelete: (fileId: string) => void;
  onRename: (fileId: string, currentName: string) => void;
  onPreview: (file: StoredFile) => void;
  selectedFileIds: string[];
  onToggleSelected: (fileId: string) => void;
}) {
  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {files.map((file) => (
        <article
          key={file.id}
          role="button"
          tabIndex={0}
          onClick={() => onPreview(file)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              onPreview(file);
            }
          }}
          className={`group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-200 ${
            selectedFileIds.includes(file.id)
              ? "border-blue-500 ring-2 ring-blue-100"
              : "border-slate-200 hover:border-blue-200"
          }`}
        >
          <button
            type="button"
            title={selectedFileIds.includes(file.id) ? "Deselect file" : "Select file"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSelected(file.id);
            }}
            className="absolute left-3 top-3 z-10 rounded-lg bg-white/95 p-1.5 text-blue-600 shadow-md backdrop-blur"
          >
            {selectedFileIds.includes(file.id) ? (
              <CheckSquare2 className="h-5 w-5" />
            ) : (
              <Square className="h-5 w-5 text-slate-400" />
            )}
          </button>
          <FileThumb file={file} />

          <div className="p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p
                  className="truncate text-sm font-black text-slate-950 group-hover:text-blue-700"
                  title={file.name}
                >
                  {file.name}
                </p>

                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                  {fileTypeLabel(file)} • {fileSizeLabel(file.size)}
                </p>
              </div>

              <span className="shrink-0 rounded-lg bg-blue-50 px-2 py-1 text-[10px] font-black text-blue-700">
                {fileTypeLabel(file)}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-2">
              <p className="text-xs font-bold text-slate-400">
                {formatDate(file.uploadedAt)}
              </p>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  title="Rename file"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRename(file.id, file.name);
                  }}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-600"
                >
                  <Pencil className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  title="Delete file"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(file.id);
                  }}
                  className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function FileThumb({ file }: { file: StoredFile }) {
  const [thumbUrl, setThumbUrl] = useState(file.dataUrl || "");
  const isImage = file.type?.startsWith("image/");
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  useEffect(() => {
    let active = true;
    if (file.dataUrl) {
      setThumbUrl(file.dataUrl);
      return;
    }
    if (!file.storagePath || (!isPdf && !isImage)) return;

    getSignedFileUrl(file.storagePath).then(({ data }) => {
      if (active && data?.signedUrl) setThumbUrl(data.signedUrl);
    });

    return () => {
      active = false;
    };
  }, [file.dataUrl, file.storagePath, isPdf, isImage]);

  if (isImage && thumbUrl) {
    return (
      <div className="h-44 overflow-hidden bg-slate-100">
        <img
          src={thumbUrl}
          alt=""
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
        />
      </div>
    );
  }

  if (isPdf && thumbUrl) {
    return (
      <div className="relative h-44 overflow-hidden bg-slate-100">
        <iframe
          src={`${thumbUrl}#page=1&view=FitH&toolbar=0&navpanes=0&scrollbar=0`}
          title={`${file.name} preview`}
          className="pointer-events-none h-[230px] w-full origin-top scale-[0.88] border-0 bg-white"
        />
        <div className="absolute left-3 top-3 rounded-md bg-red-600 px-2 py-1 text-[10px] font-black text-white shadow-sm">
          PDF
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-44 flex-col items-center justify-center bg-slate-50 text-blue-700">
      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <FileUp className="h-8 w-8" />
      </div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-400">
        {fileTypeLabel(file)} File
      </p>
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