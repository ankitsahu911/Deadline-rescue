"use client";
import { useState, useEffect, useRef } from "react";

// ---------------------------------------------------------
// Types
// ---------------------------------------------------------
type User = { id: string; name: string; email: string; password: string; createdAt: string };

type ScheduleItem = { time: string; activity: string; duration: string };

type FinalPlan = {
  schedule?: ScheduleItem[];
  emergency_schedule?: ScheduleItem[];
  message?: string;
  extension_email?: string;
  cancelled_tasks?: string[];
};

type ShockScenario = { label: string; risk_score: number };

type Task = {
  id: string;
  task_name: string;
  deadline: string;
  description: string;
  status: "active" | "completed";
  risk_score: number;
  risk_reason: string;
  rescue_mode: boolean;
  effort_hours: number;
  priority_score: number;
  cognitive_load: string;
  steps: { step: string; duration_minutes: number }[];
  memories: { task_name: string; best_time: string; actual_hours: number; on_time: boolean }[];
  final_plan: FinalPlan;
  shock_scenarios?: ShockScenario[];
  calendar_synced?: boolean;
  calendar_event_id?: string;
  calendar_link?: string;
  calendar_email?: string;
  actual_hours?: number;
  created_at: string;
};

type Note = { id: string; title: string; content: string; color: string; createdAt: string; updatedAt: string };

type AuthView = "login" | "register";
type AppTab = "dashboard" | "add" | "task" | "notes";
type AuthErrors = { name?: string; email?: string; password?: string; confirm?: string; general?: string };
type SpeechRecognitionResultItem = { transcript: string };
type SpeechRecognitionResultGroup = { 0: SpeechRecognitionResultItem };
type SpeechRecognitionResultGroups = { 0: SpeechRecognitionResultGroup };
type BrowserSpeechRecognitionEvent = { results: SpeechRecognitionResultGroups };
type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start: () => void;
};
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type SpeechWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

// ---------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const PALETTE = {
  paper: "#FAF8F4",
  paperRaised: "#FFFFFF",
  ink: "#1C1B1A",
  inkSoft: "#5B564E",
  inkFaint: "#9B958A",
  line: "#E7E2D9",
  lineSoft: "#F0ECE3",
  indigo: "#4F46E5",
  indigoSoft: "#EEF0FD",
  amber: "#D97706",
  amberSoft: "#FDF1E1",
  red: "#DC2626",
  redSoft: "#FCE9E8",
  green: "#16A34A",
  greenSoft: "#E9F6ED",
  teal: "#0E7C86",
  tealSoft: "#E6F3F4",
};

const NOTE_COLORS = ["#4F46E5", "#16A34A", "#D97706", "#DC2626", "#0E7C86", "#BE185D"];

const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const validateName = (n: string) => n.trim().length >= 2 && n.trim().length <= 50;
const passwordChecks = (p: string) => ({
  length: p.length >= 8,
  upper: /[A-Z]/.test(p),
  number: /\d/.test(p),
});
const simpleHash = (s: string) => btoa(s + "_dr_salt_2026");

const riskColor = (score: number) => (score > 75 ? PALETTE.red : score > 50 ? PALETTE.amber : PALETTE.green);
const riskSoft = (score: number) => (score > 75 ? PALETTE.redSoft : score > 50 ? PALETTE.amberSoft : PALETTE.greenSoft);

function buildShockScenarios(task: Task): ShockScenario[] {
  if (task.shock_scenarios && task.shock_scenarios.length) return task.shock_scenarios;
  const base = task.risk_score;
  const bump = (n: number) => Math.max(0, Math.min(100, n));
  return [
    { label: "Start now", risk_score: bump(Math.round(base * 0.55)) },
    { label: "Delay 1 day", risk_score: bump(Math.round(base + 22)) },
    { label: "Delay 2 days", risk_score: bump(Math.round(base + 45)) },
    { label: "Cancel one low-priority task", risk_score: bump(Math.round(base * 0.7)) },
  ];
}

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function scheduleHourFromPlan(task: Task): number | null {
  const schedule = task.rescue_mode ? task.final_plan.emergency_schedule : task.final_plan.schedule;
  const rawTime = schedule?.[0]?.time;
  const match = rawTime?.match(/^(\d{1,2})(?::\d{2})?/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : null;
}

function calendarSlotForTask(task: Task): { date: string; startHour: number } {
  const now = new Date();
  const today = toLocalDateString(now);
  let date = task.deadline < today ? today : task.deadline;
  let startHour = scheduleHourFromPlan(task) ?? 18;

  if (date === today && startHour <= now.getHours()) {
    const nextHour = now.getHours() + 1;
    if (nextHour <= 23) {
      startHour = nextHour;
    } else {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      date = toLocalDateString(tomorrow);
      startHour = 9;
    }
  }

  return { date, startHour };
}

function readStoredJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const saved = localStorage.getItem(key);
    return saved ? (JSON.parse(saved) as T) : fallback;
  } catch {
    return fallback;
  }
}

const readSavedUser = () => readStoredJson<User | null>("dr_user", null);
const readSavedTasks = (uid?: string) => (uid ? readStoredJson<Task[]>(`dr_tasks_${uid}`, []) : []);
const readSavedNotes = (uid?: string) => (uid ? readStoredJson<Note[]>(`dr_notes_${uid}`, []) : []);
type CalendarStatus = "idle" | "syncing" | "done" | "error";
type EmailStatus = "idle" | "sending" | "sent" | "error";
type ApiErrorBody = { detail?: string | { msg?: string }[] };

const requestTimeoutMessage = "The backend took too long to respond. Check the backend terminal/logs and try again.";

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as ApiErrorBody;
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((item) => item.msg).filter(Boolean).join("; ") || fallback;
    }
  } catch {
    // Use the fallback when the backend returned non-JSON.
  }
  return fallback;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 25000): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(requestTimeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

// Circular risk gauge - the signature element
function RiskGauge({ score, size = 64 }: { score: number; size?: number }) {
  const stroke = size * 0.11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const color = riskColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={PALETTE.lineSoft} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x="50%"
        y="51%"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: size * 0.26, fontWeight: 600, fill: color }}
      >
        {score}
      </text>
    </svg>
  );
}

function VoiceAssistant({ task }: { task: Task }) {
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const schedule = (task.rescue_mode ? task.final_plan?.emergency_schedule : task.final_plan?.schedule) ?? [];
  const firstStep = task.steps[0];

  const speak = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Voice reading is not supported in this browser.");
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const readTaskSummary = () => {
    const parts = [
      `${task.task_name}.`,
      `Deadline is ${task.deadline}.`,
      task.status === "completed" ? "This task is completed." : "This task is not completed yet.",
      `Risk score is ${task.risk_score} percent.`,
      task.risk_reason,
      `Estimated effort is ${task.effort_hours} hours.`,
      firstStep ? `Start with ${firstStep.step}, planned for ${firstStep.duration_minutes} minutes.` : "",
      task.rescue_mode ? "Rescue mode is active. Use the emergency schedule and start a focus sprint now." : "You have a recommended plan ready.",
    ].filter(Boolean);

    speak(parts.join(" "));
  };

  const answerQuestion = (question: string) => {
    const q = question.toLowerCase();
    if (q.includes("risk") || q.includes("danger")) {
      speak(`Risk is ${task.risk_score} percent. ${task.risk_reason}`);
      return;
    }
    if (q.includes("step") || q.includes("plan") || q.includes("roadmap")) {
      const stepText = task.steps.length
        ? task.steps.map((step, index) => `Step ${index + 1}: ${step.step}, ${step.duration_minutes} minutes.`).join(" ")
        : "No roadmap steps were generated.";
      speak(stepText);
      return;
    }
    if (q.includes("time") || q.includes("hour") || q.includes("effort")) {
      speak(`Estimated effort is ${task.effort_hours} hours. Priority is ${task.priority_score} out of 10.`);
      return;
    }
    if (q.includes("calendar")) {
      speak(task.calendar_synced ? "This task has been added to Google Calendar." : "This task is not on Google Calendar yet. Use the Google Calendar button.");
      return;
    }
    if (q.includes("email") || q.includes("reminder")) {
      speak(task.status === "completed" ? "Use the completion email button to send a summary." : "Use the reminder email button to send the risk, roadmap, and schedule.");
      return;
    }
    if (q.includes("status") || q.includes("complete") || q.includes("done")) {
      speak(task.status === "completed" ? "This task is marked completed." : "This task is still active.");
      return;
    }
    if (q.includes("schedule")) {
      const scheduleText = schedule.length
        ? schedule.map((item) => `${item.time}: ${item.activity}, ${item.duration}.`).join(" ")
        : "No schedule was generated.";
      speak(scheduleText);
      return;
    }

    speak("You can ask about risk, roadmap, effort, schedule, calendar, email, or completion status.");
  };

  const startListening = () => {
    if (typeof window === "undefined") return;
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      alert("Voice questions need Chrome or Edge with microphone permission.");
      return;
    }

    const recognition = new Recognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => answerQuestion(event.results[0][0].transcript);
    recognition.start();
  };

  return (
    <div style={{ background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "18px", padding: "1.25rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
      <div>
        <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: PALETTE.ink, marginBottom: "0.2rem" }}>Voice assistant</h3>
        <p style={{ fontSize: "0.78rem", color: PALETTE.inkFaint }}>
          Listen to the rescue summary or ask about risk, roadmap, effort, schedule, calendar, email, or status.
        </p>
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
        <button onClick={readTaskSummary}
          style={{ padding: "0.6rem 1.1rem", background: speaking ? PALETTE.greenSoft : PALETTE.tealSoft, color: speaking ? PALETTE.green : PALETTE.teal, border: "none", borderRadius: "9px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap" }}>
          {speaking ? "Reading..." : "Read summary"}
        </button>
        <button onClick={startListening} disabled={listening}
          style={{ padding: "0.6rem 1.1rem", background: listening ? PALETTE.amberSoft : PALETTE.indigoSoft, color: listening ? PALETTE.amber : PALETTE.indigo, border: "none", borderRadius: "9px", cursor: listening ? "wait" : "pointer", fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap" }}>
          {listening ? "Listening..." : "Ask question"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Focus timer (frontend-only, 25-min default)
// ---------------------------------------------------------
function FocusTimer() {
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s <= 1) {
            setRunning(false);
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const mins = Math.floor(seconds / 60).toString().padStart(2, "0");
  const secs = (seconds % 60).toString().padStart(2, "0");
  const pct = 1 - seconds / (25 * 60);

  return (
    <div style={{ background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "16px", padding: "1.5rem", display: "flex", alignItems: "center", gap: "1.5rem" }}>
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r="30" fill="none" stroke={PALETTE.lineSoft} strokeWidth="7" />
        <circle
          cx="36" cy="36" r="30" fill="none" stroke={PALETTE.indigo} strokeWidth="7"
          strokeDasharray={2 * Math.PI * 30}
          strokeDashoffset={2 * Math.PI * 30 * (1 - pct)}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.8rem", fontWeight: 600, color: PALETTE.ink, letterSpacing: "0.02em" }}>
          {mins}:{secs}
        </div>
        <div style={{ fontSize: "0.78rem", color: PALETTE.inkFaint, marginTop: "0.15rem" }}>Focus sprint</div>
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button onClick={() => setRunning((r) => !r)}
          style={{ padding: "0.55rem 1.1rem", background: running ? PALETTE.amberSoft : PALETTE.indigo, color: running ? PALETTE.amber : "#fff", border: "none", borderRadius: "9px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600 }}>
          {running ? "Pause" : seconds === 25 * 60 ? "Start" : "Resume"}
        </button>
        <button onClick={() => { setRunning(false); setSeconds(25 * 60); }}
          style={{ padding: "0.55rem 1.1rem", background: "transparent", color: PALETTE.inkSoft, border: `1px solid ${PALETTE.line}`, borderRadius: "9px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 500 }}>
          Reset
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Shared field style
// ---------------------------------------------------------
const fieldStyle = (hasErr?: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "0.75rem",
  borderRadius: "10px",
  border: `1px solid ${hasErr ? PALETTE.red : PALETTE.line}`,
  background: PALETTE.paperRaised,
  color: PALETTE.ink,
  fontSize: "0.95rem",
  boxSizing: "border-box",
  outline: "none",
  fontFamily: "inherit",
});

export default function Home() {
  const [authView, setAuthView] = useState<AuthView>("login");
  const [currentUser, setCurrentUser] = useState<User | null>(() => readSavedUser());
  const [tab, setTab] = useState<AppTab>("dashboard");

  // Auth state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [authErrors, setAuthErrors] = useState<AuthErrors>({});
  const [authLoading, setAuthLoading] = useState(false);

  // Task state
  const [tasks, setTasks] = useState<Task[]>(() => readSavedTasks(currentUser?.id));
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskName, setTaskName] = useState("");
  const [deadline, setDeadline] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [showReflect, setShowReflect] = useState(false);
  const [reflectTaskId, setReflectTaskId] = useState<string | null>(null);
  const [actualHours, setActualHours] = useState("");
  const [calendarStatus, setCalendarStatus] = useState<Record<string, CalendarStatus>>({});
  const [calendarError, setCalendarError] = useState<Record<string, string>>({});
  const [emailStatus, setEmailStatus] = useState<Record<string, EmailStatus>>({});
  const [emailError, setEmailError] = useState<Record<string, string>>({});
  const [emailCopied, setEmailCopied] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<Note[]>(() => readSavedNotes(currentUser?.id));
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteColor, setNoteColor] = useState(NOTE_COLORS[0]);
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const active = tasks.filter((t) => t.status === "active");
  const done = tasks.filter((t) => t.status === "completed");
  const atRisk = active.filter((t) => t.risk_score > 75);
  const pwd = passwordChecks(password);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";

  const loadUserData = (uid: string) => {
    setTasks(readSavedTasks(uid));
    setNotes(readSavedNotes(uid));
  };

  const saveTasks = (u: Task[]) => {
    setTasks(u);
    if (currentUser) localStorage.setItem(`dr_tasks_${currentUser.id}`, JSON.stringify(u));
  };
  const saveNotes = (u: Note[]) => {
    setNotes(u);
    if (currentUser) localStorage.setItem(`dr_notes_${currentUser.id}`, JSON.stringify(u));
  };

  // -- AUTH --
  const clearAuth = () => { setName(""); setEmail(""); setPassword(""); setConfirmPwd(""); setAuthErrors({}); setShowPwd(false); };

  const handleRegister = () => {
    const errs: AuthErrors = {};
    if (!validateName(name)) errs.name = "Name must be 2-50 characters";
    if (!validateEmail(email)) errs.email = "Enter a valid email address";
    if (!pwd.length) errs.password = "At least 8 characters required";
    else if (!pwd.upper) errs.password = "Must include an uppercase letter";
    else if (!pwd.number) errs.password = "Must include a number";
    if (password !== confirmPwd) errs.confirm = "Passwords do not match";
    if (Object.keys(errs).length) { setAuthErrors(errs); return; }

    setAuthLoading(true);
    const users: User[] = JSON.parse(localStorage.getItem("dr_users") || "[]");
    if (users.find((u) => u.email === email.toLowerCase())) {
      setAuthErrors({ email: "An account with this email already exists" });
      setAuthLoading(false);
      return;
    }
    const newUser: User = { id: Date.now().toString(), name: name.trim(), email: email.toLowerCase().trim(), password: simpleHash(password), createdAt: new Date().toISOString() };
    localStorage.setItem("dr_users", JSON.stringify([...users, newUser]));
    localStorage.setItem("dr_user", JSON.stringify(newUser));
    setCurrentUser(newUser);
    clearAuth();
    setAuthLoading(false);
  };

  const handleLogin = () => {
    const errs: AuthErrors = {};
    if (!validateEmail(email)) errs.email = "Enter a valid email address";
    if (!password) errs.password = "Password is required";
    if (Object.keys(errs).length) { setAuthErrors(errs); return; }

    setAuthLoading(true);
    const users: User[] = JSON.parse(localStorage.getItem("dr_users") || "[]");
    const user = users.find((u) => u.email === email.toLowerCase().trim() && u.password === simpleHash(password));
    if (!user) { setAuthErrors({ general: "Incorrect email or password" }); setAuthLoading(false); return; }
    localStorage.setItem("dr_user", JSON.stringify(user));
    setCurrentUser(user);
    loadUserData(user.id);
    clearAuth();
    setAuthLoading(false);
  };

  const handleLogout = () => { localStorage.removeItem("dr_user"); setCurrentUser(null); setTasks([]); setNotes([]); setTab("dashboard"); };

  // -- TASKS --
  const analyzeTask = async () => {
    if (!taskName || !deadline) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task_name: taskName, deadline, description }) });
      const data = await res.json();
      const t: Task = { id: Date.now().toString(), ...data, status: "active", created_at: new Date().toISOString() };
      saveTasks([...tasks, t]);
      setSelectedTaskId(t.id); setTab("task");
      setTaskName(""); setDeadline(""); setDescription("");
    } catch { alert("Backend not running. Start uvicorn first."); }
    setLoading(false);
  };

  const markComplete = async () => {
    if (!reflectTaskId) return;
    const task = tasks.find((t) => t.id === reflectTaskId);
    if (!task) return;
    const parsedActualHours = actualHours ? parseFloat(actualHours) : undefined;
    const completedTasks = tasks.map((t) => (
      t.id === reflectTaskId
        ? { ...t, status: "completed" as const, actual_hours: parsedActualHours }
        : t
    ));
    saveTasks(completedTasks);
    if (parsedActualHours) {
      try {
        await fetch(`${API}/reflect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_name: task.task_name, actual_hours: parsedActualHours, on_time: true, cognitive_load: task.cognitive_load || "deep_focus", best_time: "evening", notes: "" }),
        });
      } catch { /* non-blocking */ }
    }
    if (task.calendar_event_id) {
      try {
        const res = await fetch(`${API}/calendar/complete-event`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: task.calendar_event_id }),
        });
        if (res.ok) {
          const data: { link?: string } = await res.json();
          saveTasks(completedTasks.map((t) => (
            t.id === reflectTaskId
              ? { ...t, calendar_link: data.link || t.calendar_link }
              : t
          )));
        }
      } catch { /* calendar sync is non-blocking */ }
    }
    setShowReflect(false); setActualHours(""); setTab("dashboard");
  };

  const deleteTask = (id: string) => { saveTasks(tasks.filter((t) => t.id !== id)); if (selectedTaskId === id) { setTab("dashboard"); setSelectedTaskId(null); } };

  // -- CALENDAR --
  const addToCalendar = async (task: Task) => {
    setCalendarStatus((s) => ({ ...s, [task.id]: "syncing" }));
    setCalendarError((s) => ({ ...s, [task.id]: "" }));
    const effortHours = Number(task.effort_hours);
    const durationHours = Number.isFinite(effortHours) ? Math.max(0.25, effortHours) : 1;
    const { date, startHour } = calendarSlotForTask(task);
    const eventWindow = window.open("about:blank", "_blank");
    eventWindow?.document.write("<p style=\"font-family: system-ui, sans-serif; padding: 24px;\">Creating Google Calendar event...</p>");
    try {
      const res = await fetchWithTimeout(`${API}/schedule-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: task.task_name,
          date,
          start_hour: startHour,
          duration_hours: durationHours,
          description: task.risk_reason,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Calendar event could not be created."));
      const data: { event_id: string; link?: string; calendar_email?: string } = await res.json();
      setCalendarStatus((s) => ({ ...s, [task.id]: "done" }));
      saveTasks(tasks.map((t) => (
        t.id === task.id
          ? { ...t, calendar_synced: true, calendar_event_id: data.event_id, calendar_link: data.link, calendar_email: data.calendar_email }
          : t
      )));
      if (data.link) {
        if (eventWindow) {
          eventWindow.location.href = data.link;
        } else {
          window.open(data.link, "_blank", "noopener,noreferrer");
        }
      } else {
        eventWindow?.close();
      }
    } catch (error) {
      eventWindow?.close();
      setCalendarStatus((s) => ({ ...s, [task.id]: "error" }));
      setCalendarError((s) => ({
        ...s,
        [task.id]: error instanceof Error ? error.message : "Calendar event could not be created.",
      }));
    }
  };

  const openGoogleCalendar = (task?: Task) => {
    window.open(
      task?.calendar_link || "https://calendar.google.com/calendar/u/0/r",
      "_blank",
      "noopener,noreferrer"
    );
  };

  const sendTaskEmail = async (task: Task) => {
    if (!currentUser?.email) {
      alert("Sign in with an email first.");
      return;
    }

    setEmailStatus((s) => ({ ...s, [task.id]: "sending" }));
    setEmailError((s) => ({ ...s, [task.id]: "" }));
    try {
      const res = await fetchWithTimeout(`${API}/send-task-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: currentUser.email,
          task_name: task.task_name,
          deadline: task.deadline,
          status: task.status,
          risk_score: task.risk_score,
          risk_reason: task.risk_reason,
          effort_hours: task.effort_hours,
          priority_score: task.priority_score,
          cognitive_load: task.cognitive_load,
          steps: task.steps,
          final_plan: task.final_plan,
          rescue_mode: task.rescue_mode,
          actual_hours: task.actual_hours,
          calendar_link: task.calendar_link,
          shock_scenarios: buildShockScenarios(task),
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, "Email could not be sent."));
      setEmailStatus((s) => ({ ...s, [task.id]: "sent" }));
    } catch (error) {
      setEmailStatus((s) => ({ ...s, [task.id]: "error" }));
      setEmailError((s) => ({
        ...s,
        [task.id]: error instanceof Error ? error.message : "Email could not be sent.",
      }));
    }
  };

  const copyExtensionEmail = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    });
  };

  // -- NOTES --
  const openAddNote = () => { setEditingNote(null); setNoteTitle(""); setNoteContent(""); setNoteColor(NOTE_COLORS[0]); setShowNoteModal(true); };
  const openEditNote = (n: Note) => { setEditingNote(n); setNoteTitle(n.title); setNoteContent(n.content); setNoteColor(n.color); setShowNoteModal(true); };
  const saveNote = () => {
    if (!noteTitle.trim() && !noteContent.trim()) return;
    if (editingNote) {
      saveNotes(notes.map((n) => (n.id === editingNote.id ? { ...n, title: noteTitle, content: noteContent, color: noteColor, updatedAt: new Date().toISOString() } : n)));
    } else {
      saveNotes([{ id: Date.now().toString(), title: noteTitle.trim(), content: noteContent.trim(), color: noteColor, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, ...notes]);
    }
    setShowNoteModal(false);
  };

  // ===========================================
  // AUTH SCREEN
  // ===========================================
  if (!currentUser) {
    return (
      <div style={{ minHeight: "100vh", background: PALETTE.paper, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <style>{FONT_IMPORT}</style>
        <div style={{ width: "100%", maxWidth: "430px" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <div style={{ width: "52px", height: "52px", margin: "0 auto 0.85rem", borderRadius: "14px", background: PALETTE.indigo, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
              </svg>
            </div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.7rem", fontWeight: 600, color: PALETTE.ink, letterSpacing: "-0.01em" }}>Deadline Rescue</h1>
            <p style={{ color: PALETTE.inkFaint, fontSize: "0.88rem", marginTop: "0.3rem" }}>AI-powered productivity companion</p>
          </div>

          <div style={{ background: PALETTE.paperRaised, borderRadius: "20px", padding: "2rem", border: `1px solid ${PALETTE.line}`, boxShadow: "0 1px 2px rgba(28,27,26,0.04)" }}>
            <div style={{ display: "flex", background: PALETTE.lineSoft, borderRadius: "10px", padding: "4px", marginBottom: "1.75rem" }}>
              {(["login", "register"] as AuthView[]).map((v) => (
                <button key={v} onClick={() => { setAuthView(v); setAuthErrors({}); }}
                  style={{ flex: 1, padding: "0.55rem", borderRadius: "8px", border: "none", background: authView === v ? PALETTE.paperRaised : "transparent", color: authView === v ? PALETTE.ink : PALETTE.inkFaint, cursor: "pointer", fontSize: "0.86rem", fontWeight: 600, transition: "all 0.2s", boxShadow: authView === v ? "0 1px 2px rgba(28,27,26,0.08)" : "none" }}>
                  {v === "login" ? "Sign in" : "Create account"}
                </button>
              ))}
            </div>

            {authErrors.general && (
              <div style={{ background: PALETTE.redSoft, border: `1px solid ${PALETTE.red}30`, borderRadius: "10px", padding: "0.75rem 1rem", marginBottom: "1rem", color: PALETTE.red, fontSize: "0.85rem" }}>
                {authErrors.general}
              </div>
            )}

            {authView === "register" && (
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", color: PALETTE.inkSoft, marginBottom: "0.4rem", fontWeight: 500 }}>Full name</label>
                <input value={name} onChange={(e) => { setName(e.target.value); setAuthErrors((p) => ({ ...p, name: undefined })); }} placeholder="Your full name" style={fieldStyle(!!authErrors.name)} />
                {authErrors.name && <p style={{ color: PALETTE.red, fontSize: "0.74rem", marginTop: "0.3rem" }}>{authErrors.name}</p>}
              </div>
            )}

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", color: PALETTE.inkSoft, marginBottom: "0.4rem", fontWeight: 500 }}>Email address</label>
              <input type="email" value={email} onChange={(e) => { setEmail(e.target.value); setAuthErrors((p) => ({ ...p, email: undefined, general: undefined })); }} placeholder="you@gmail.com" style={fieldStyle(!!authErrors.email)} />
              {authErrors.email && <p style={{ color: PALETTE.red, fontSize: "0.74rem", marginTop: "0.3rem" }}>{authErrors.email}</p>}
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.8rem", color: PALETTE.inkSoft, marginBottom: "0.4rem", fontWeight: 500 }}>Password</label>
              <div style={{ position: "relative" }}>
                <input type={showPwd ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); setAuthErrors((p) => ({ ...p, password: undefined, general: undefined })); }}
                  placeholder={authView === "register" ? "Min 8 chars, 1 uppercase, 1 number" : "Enter your password"}
                  style={{ ...fieldStyle(!!authErrors.password), paddingRight: "3.5rem" }} />
                <button onClick={() => setShowPwd(!showPwd)}
                  style={{ position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: PALETTE.inkFaint, cursor: "pointer", fontSize: "0.78rem", fontWeight: 500 }}>
                  {showPwd ? "Hide" : "Show"}
                </button>
              </div>
              {authErrors.password && <p style={{ color: PALETTE.red, fontSize: "0.74rem", marginTop: "0.3rem" }}>{authErrors.password}</p>}

              {authView === "register" && password && (
                <div style={{ marginTop: "0.6rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {[
                    { label: "At least 8 characters", ok: pwd.length },
                    { label: "One uppercase letter (A-Z)", ok: pwd.upper },
                    { label: "One number (0-9)", ok: pwd.number },
                  ].map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span style={{ fontSize: "0.7rem", color: r.ok ? PALETTE.green : PALETTE.inkFaint }}>{r.ok ? "[x]" : "[ ]"}</span>
                      <span style={{ fontSize: "0.72rem", color: r.ok ? PALETTE.green : PALETTE.inkFaint }}>{r.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {authView === "register" && (
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.8rem", color: PALETTE.inkSoft, marginBottom: "0.4rem", fontWeight: 500 }}>Confirm password</label>
                <input type="password" value={confirmPwd} onChange={(e) => { setConfirmPwd(e.target.value); setAuthErrors((p) => ({ ...p, confirm: undefined })); }} placeholder="Re-enter your password" style={fieldStyle(!!authErrors.confirm)} />
                {authErrors.confirm && <p style={{ color: PALETTE.red, fontSize: "0.74rem", marginTop: "0.3rem" }}>{authErrors.confirm}</p>}
              </div>
            )}

            <button onClick={authView === "login" ? handleLogin : handleRegister} disabled={authLoading}
              style={{ width: "100%", padding: "0.85rem", borderRadius: "10px", border: "none", background: authLoading ? PALETTE.inkFaint : PALETTE.indigo, color: "#fff", fontSize: "0.95rem", fontWeight: 600, cursor: authLoading ? "not-allowed" : "pointer", marginTop: authView === "login" ? "0.5rem" : 0, transition: "background 0.15s" }}>
              {authLoading ? "Please wait..." : authView === "login" ? "Sign in ->" : "Create account ->"}
            </button>

            <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.83rem", color: PALETTE.inkFaint }}>
              {authView === "login" ? "No account? " : "Already registered? "}
              <button onClick={() => { setAuthView(authView === "login" ? "register" : "login"); setAuthErrors({}); }}
                style={{ background: "none", border: "none", color: PALETTE.indigo, cursor: "pointer", fontSize: "0.83rem", fontWeight: 600 }}>
                {authView === "login" ? "Create one" : "Sign in"}
              </button>
            </p>
          </div>

          <p style={{ textAlign: "center", marginTop: "1.25rem", fontSize: "0.74rem", color: PALETTE.inkFaint }}>
            Your data stays on this device.
          </p>
        </div>
      </div>
    );
  }

  // ===========================================
  // MAIN APP
  // ===========================================
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: PALETTE.paper, color: PALETTE.ink, fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}>
      <style>{FONT_IMPORT}</style>

      {/* Sidebar */}
      <div style={{ width: "232px", background: PALETTE.paperRaised, padding: "1.5rem 1rem", display: "flex", flexDirection: "column", flexShrink: 0, borderRight: `1px solid ${PALETTE.line}` }}>
        <div style={{ marginBottom: "2rem", paddingLeft: "0.5rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <div style={{ width: "32px", height: "32px", borderRadius: "9px", background: PALETTE.indigo, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: "1.02rem", fontWeight: 600, color: PALETTE.ink, lineHeight: 1.1 }}>Deadline</div>
            <div style={{ fontSize: "0.7rem", color: PALETTE.indigo, fontWeight: 600 }}>Rescue Agent</div>
          </div>
        </div>

        {([
          { id: "dashboard", label: "Dashboard", icon: "::" },
          { id: "add", label: "Add task", icon: "+" },
          { id: "notes", label: "Notes", icon: "/" },
        ] as { id: AppTab; label: string; icon: string }[]).map((item) => (
          <button key={item.id} onClick={() => setTab(item.id)}
            style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.65rem 0.9rem", borderRadius: "9px", border: "none", background: tab === item.id ? PALETTE.indigoSoft : "transparent", color: tab === item.id ? PALETTE.indigo : PALETTE.inkSoft, cursor: "pointer", fontSize: "0.88rem", textAlign: "left", width: "100%", marginBottom: "0.2rem", fontWeight: tab === item.id ? 600 : 500 }}>
            <span style={{ width: "16px", textAlign: "center" }}>{item.icon}</span>{item.label}
          </button>
        ))}

        <div style={{ marginTop: "auto" }}>
          <div style={{ background: PALETTE.lineSoft, borderRadius: "12px", padding: "1rem", marginBottom: "0.75rem" }}>
            <div style={{ fontSize: "0.66rem", color: PALETTE.inkFaint, marginBottom: "0.7rem", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Overview</div>
            {[
              { label: "Active", value: active.length, color: PALETTE.indigo },
              { label: "At risk", value: atRisk.length, color: PALETTE.red },
              { label: "Done", value: done.length, color: PALETTE.green },
              { label: "Notes", value: notes.length, color: PALETTE.teal },
            ].map((s, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.28rem 0" }}>
                <span style={{ fontSize: "0.78rem", color: PALETTE.inkSoft }}>{s.label}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "0.85rem", fontWeight: 600, color: s.color }}>{s.value}</span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.7rem", borderRadius: "10px", background: PALETTE.lineSoft }}>
            <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: PALETTE.indigo, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.78rem", fontWeight: 700, flexShrink: 0, color: "#fff" }}>
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.name}</div>
              <div style={{ fontSize: "0.68rem", color: PALETTE.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.email}</div>
            </div>
            <button onClick={handleLogout} title="Sign out" aria-label="Sign out"
              style={{ background: "none", border: "none", color: PALETTE.inkFaint, cursor: "pointer", fontSize: "0.75rem", fontWeight: 600, flexShrink: 0 }}>Exit</button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, padding: "2.25rem 2.5rem", overflowY: "auto" }}>

        {/* -- DASHBOARD -- */}
        {tab === "dashboard" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
              <div>
                <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.65rem", fontWeight: 600, color: PALETTE.ink, letterSpacing: "-0.01em" }}>Good {greeting}, {currentUser.name.split(" ")[0]}</h1>
                <p style={{ color: PALETTE.inkFaint, fontSize: "0.9rem", marginTop: "0.3rem" }}>Here&apos;s your productivity overview</p>
              </div>
              <button onClick={() => setTab("add")}
                style={{ padding: "0.65rem 1.3rem", background: PALETTE.indigo, color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "0.86rem", fontWeight: 600 }}>
                + Add task
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
              {[
                { label: "Total tasks", value: tasks.length, color: PALETTE.indigo, bg: PALETTE.indigoSoft },
                { label: "At risk", value: atRisk.length, color: PALETTE.red, bg: PALETTE.redSoft },
                { label: "Completed", value: done.length, color: PALETTE.green, bg: PALETTE.greenSoft },
                { label: "Notes", value: notes.length, color: PALETTE.teal, bg: PALETTE.tealSoft },
              ].map((s, i) => (
                <div key={i} style={{ background: s.bg, border: `1px solid ${s.color}25`, borderRadius: "14px", padding: "1.25rem" }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.9rem", fontWeight: 600, color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: "0.78rem", color: PALETTE.inkSoft, marginTop: "0.25rem" }}>{s.label}</div>
                </div>
              ))}
            </div>

            <h2 style={{ fontSize: "0.78rem", fontWeight: 600, color: PALETTE.inkFaint, marginBottom: "1rem", textTransform: "uppercase", letterSpacing: "0.07em" }}>Tasks - sorted by risk</h2>

            {tasks.length === 0 ? (
              <div style={{ textAlign: "center", padding: "4rem 2rem", background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "18px", color: PALETTE.inkFaint, maxWidth: "640px" }}>
                <div style={{ width: "48px", height: "48px", margin: "0 auto 1rem", borderRadius: "12px", border: `2px solid ${PALETTE.line}` }} />
                <p style={{ marginBottom: "1.25rem", color: PALETTE.inkSoft }}>No tasks yet. Add your first one.</p>
                <button onClick={() => setTab("add")} style={{ padding: "0.75rem 1.5rem", background: PALETTE.indigo, color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>Add first task</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxWidth: "780px" }}>
                {[...active.sort((a, b) => b.risk_score - a.risk_score), ...done].map((task) => (
                  <div key={task.id} style={{ background: PALETTE.paperRaised, borderRadius: "14px", padding: "1.25rem", border: `1px solid ${task.status === "completed" ? PALETTE.line : riskColor(task.risk_score) + "35"}`, opacity: task.status === "completed" ? 0.6 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1.25rem" }}>
                      {task.status === "active" && <RiskGauge score={task.risk_score} size={56} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
                          <span style={{ fontSize: "1rem", fontWeight: 600, textTransform: "capitalize" }}>{task.task_name}</span>
                          {task.rescue_mode && task.status === "active" && <span style={{ fontSize: "0.68rem", background: PALETTE.redSoft, color: PALETTE.red, padding: "0.2rem 0.6rem", borderRadius: "20px", fontWeight: 700 }}>RESCUE</span>}
                          {task.status === "completed" && <span style={{ fontSize: "0.68rem", background: PALETTE.greenSoft, color: PALETTE.green, padding: "0.2rem 0.6rem", borderRadius: "20px", fontWeight: 600 }}>Done</span>}
                          {task.calendar_synced && <span style={{ fontSize: "0.68rem", background: PALETTE.indigoSoft, color: PALETTE.indigo, padding: "0.2rem 0.6rem", borderRadius: "20px", fontWeight: 600 }}>On calendar</span>}
                        </div>
                        <div style={{ display: "flex", gap: "1.1rem", fontSize: "0.78rem", color: PALETTE.inkFaint }}>
                          <span>{task.deadline}</span><span>{task.effort_hours}h</span><span>P{task.priority_score}/10</span>
                        </div>
                        {task.status === "active" && <span style={{ fontSize: "0.74rem", color: PALETTE.inkSoft, display: "block", marginTop: "0.35rem" }}>{task.risk_reason}</span>}
                      </div>
                      <div style={{ display: "flex", gap: "0.4rem", flexShrink: 0 }}>
                        <button onClick={() => { setSelectedTaskId(task.id); setTab("task"); }} style={{ padding: "0.45rem 0.85rem", background: PALETTE.lineSoft, color: PALETTE.ink, border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "0.78rem", fontWeight: 500 }}>View</button>
                        {task.status === "active" && <button onClick={() => { setReflectTaskId(task.id); setShowReflect(true); }} style={{ padding: "0.45rem 0.85rem", background: PALETTE.greenSoft, color: PALETTE.green, border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "0.78rem", fontWeight: 600 }}>Done</button>}
                        <button onClick={() => deleteTask(task.id)} style={{ padding: "0.45rem 0.7rem", background: "transparent", color: PALETTE.inkFaint, border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "0.78rem" }}>X</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* -- ADD TASK -- */}
        {tab === "add" && (
          <div style={{ maxWidth: "560px" }}>
            <div style={{ marginBottom: "2rem" }}>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.5rem", fontWeight: 600, color: PALETTE.ink }}>Add a task</h1>
              <p style={{ color: PALETTE.inkFaint, fontSize: "0.9rem", marginTop: "0.3rem" }}>AI will analyze risk and build a rescue plan</p>
            </div>
            <div style={{ background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "18px", padding: "2rem" }}>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", color: PALETTE.inkSoft, marginBottom: "0.4rem", fontWeight: 500 }}>Task name</label>
                <input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="e.g. Machine learning assignment" style={fieldStyle()} />
              </div>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", color: PALETTE.inkSoft, marginBottom: "0.4rem", fontWeight: 500 }}>Deadline</label>
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={fieldStyle()} />
              </div>
              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "block", fontSize: "0.82rem", color: PALETTE.inkSoft, marginBottom: "0.4rem", fontWeight: 500 }}>Description (optional)</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this task involve?" rows={3} style={{ ...fieldStyle(), resize: "vertical" }} />
              </div>
              <button onClick={analyzeTask} disabled={loading} style={{ width: "100%", padding: "0.9rem", borderRadius: "11px", border: "none", background: loading ? PALETTE.inkFaint : PALETTE.indigo, color: "#fff", fontSize: "0.95rem", fontWeight: 600, cursor: loading ? "not-allowed" : "pointer" }}>
                {loading ? "Agents analyzing..." : "Analyze with AI ->"}
              </button>
            </div>
          </div>
        )}

        {/* -- TASK DETAIL -- */}
        {tab === "task" && selectedTask && (
          <div style={{ maxWidth: "700px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.75rem" }}>
              <button onClick={() => setTab("dashboard")} style={{ padding: "0.5rem 1rem", background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, color: PALETTE.ink, borderRadius: "9px", cursor: "pointer", fontSize: "0.84rem" }}>Back</button>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.3rem", fontWeight: 600, textTransform: "capitalize", flex: 1, color: PALETTE.ink }}>{selectedTask.task_name}</h1>
              {selectedTask.status === "active" && <button onClick={() => { setReflectTaskId(selectedTask.id); setShowReflect(true); }} style={{ padding: "0.55rem 1.2rem", background: PALETTE.greenSoft, color: PALETTE.green, border: "none", borderRadius: "9px", cursor: "pointer", fontWeight: 600, fontSize: "0.84rem" }}>Mark complete</button>}
            </div>

            {/* Risk card with gauge */}
            <div style={{ background: PALETTE.paperRaised, borderRadius: "18px", padding: "1.5rem", marginBottom: "1rem", border: `1px solid ${riskColor(selectedTask.risk_score)}40`, display: "flex", alignItems: "center", gap: "1.5rem" }}>
              <RiskGauge score={selectedTask.risk_score} size={84} />
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.4rem", color: selectedTask.rescue_mode ? PALETTE.red : PALETTE.ink }}>
                  {selectedTask.rescue_mode ? "Rescue mode active" : "Risk assessment"}
                </h2>
                <p style={{ color: PALETTE.inkSoft, fontSize: "0.88rem" }}>{selectedTask.risk_reason}</p>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1rem" }}>
              {[{ label: "Effort", value: `${selectedTask.effort_hours}h` }, { label: "Priority", value: `${selectedTask.priority_score}/10` }, { label: "Focus type", value: (selectedTask.cognitive_load || "").replace(/_/g, " ") }].map((s, i) => (
                <div key={i} style={{ background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "12px", padding: "1rem", textAlign: "center" }}>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.15rem", fontWeight: 600, color: PALETTE.indigo }}>{s.value}</div>
                  <div style={{ fontSize: "0.72rem", color: PALETTE.inkFaint, marginTop: "0.25rem" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Rescue action buttons - only when rescue_mode */}
            {selectedTask.rescue_mode && selectedTask.status === "active" && (
              <div style={{ background: PALETTE.redSoft, border: `1px solid ${PALETTE.red}30`, borderRadius: "16px", padding: "1.25rem", marginBottom: "1rem" }}>
                <h3 style={{ fontSize: "0.85rem", fontWeight: 700, color: PALETTE.red, marginBottom: "0.9rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Rescue actions</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.6rem" }}>
                  <button onClick={() => document.getElementById("focus-timer-section")?.scrollIntoView({ behavior: "smooth" })}
                    style={{ padding: "0.65rem 0.9rem", background: "#fff", border: `1px solid ${PALETTE.red}40`, borderRadius: "10px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: PALETTE.ink, textAlign: "left" }}>
                    Start 25-min focus sprint
                  </button>
                  <button onClick={() => addToCalendar(selectedTask)}
                    style={{ padding: "0.65rem 0.9rem", background: "#fff", border: `1px solid ${PALETTE.red}40`, borderRadius: "10px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: PALETTE.ink, textAlign: "left" }}>
                    {calendarStatus[selectedTask.id] === "syncing"
                      ? "Adding emergency plan..."
                      : calendarStatus[selectedTask.id] === "done" || selectedTask.calendar_synced
                        ? "Emergency plan added"
                        : "Add emergency plan to Calendar"}
                  </button>
                  <button onClick={() => openGoogleCalendar(selectedTask)}
                    style={{ padding: "0.65rem 0.9rem", background: "#fff", border: `1px solid ${PALETTE.red}40`, borderRadius: "10px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: PALETTE.ink, textAlign: "left" }}>
                    {selectedTask.calendar_link ? "Open Calendar Event" : "Open Google Calendar"}
                  </button>
                  {selectedTask.final_plan?.extension_email && (
                    <button onClick={() => copyExtensionEmail(selectedTask.final_plan.extension_email!)}
                      style={{ padding: "0.65rem 0.9rem", background: "#fff", border: `1px solid ${PALETTE.red}40`, borderRadius: "10px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: PALETTE.ink, textAlign: "left" }}>
                      {emailCopied ? "Copied" : "Copy extension email"}
                    </button>
                  )}
                  <button onClick={() => alert("This will call a backend endpoint that generates a first-pass outline for the task. Not wired up yet.")} title="Not wired to a backend endpoint yet"
                    style={{ padding: "0.65rem 0.9rem", background: PALETTE.lineSoft, border: `1px dashed ${PALETTE.inkFaint}`, borderRadius: "10px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, color: PALETTE.inkFaint, textAlign: "left" }}>
                    Generate first 20% outline (coming soon)
                  </button>
                </div>
              </div>
            )}

            {/* Focus timer */}
            <div id="focus-timer-section" style={{ marginBottom: "1rem" }}>
              <FocusTimer />
            </div>

            {/* Future Shock Simulator */}
            <div style={{ background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "18px", padding: "1.5rem", marginBottom: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.3rem" }}>
                <h3 style={{ fontSize: "0.95rem", fontWeight: 600, color: PALETTE.ink }}>Future Shock Simulator</h3>
                <span
                  title={selectedTask.shock_scenarios && selectedTask.shock_scenarios.length ? "Calculated by the backend risk engine" : "Estimated in the browser - not yet calculated by the backend"}
                  style={{ fontSize: "0.65rem", fontWeight: 600, padding: "0.18rem 0.55rem", borderRadius: "20px", background: selectedTask.shock_scenarios && selectedTask.shock_scenarios.length ? PALETTE.indigoSoft : PALETTE.lineSoft, color: selectedTask.shock_scenarios && selectedTask.shock_scenarios.length ? PALETTE.indigo : PALETTE.inkFaint, flexShrink: 0 }}>
                  {selectedTask.shock_scenarios && selectedTask.shock_scenarios.length ? "From backend" : "Estimated"}
                </span>
              </div>
              <p style={{ fontSize: "0.78rem", color: PALETTE.inkFaint, marginBottom: "1.1rem" }}>How your risk score shifts depending on what you do next</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.7rem" }}>
                {buildShockScenarios(selectedTask).map((sc, i) => (
                  <div key={i} style={{ background: riskSoft(sc.risk_score), border: `1px solid ${riskColor(sc.risk_score)}30`, borderRadius: "12px", padding: "0.9rem 0.7rem", textAlign: "center" }}>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "1.3rem", fontWeight: 700, color: riskColor(sc.risk_score) }}>{sc.risk_score}%</div>
                    <div style={{ fontSize: "0.7rem", color: PALETTE.inkSoft, marginTop: "0.3rem", lineHeight: 1.3 }}>{sc.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Calendar sync (non-rescue tasks) */}
            {!selectedTask.rescue_mode && selectedTask.status === "active" && (
              <div style={{ background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "18px", padding: "1.25rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                <div>
                  <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: PALETTE.ink, marginBottom: "0.2rem" }}>Google Calendar</h3>
                  <p style={{ fontSize: "0.78rem", color: PALETTE.inkFaint }}>
                    {calendarStatus[selectedTask.id] === "done" || selectedTask.calendar_synced
                      ? `This plan is on ${selectedTask.calendar_email || "your Google Calendar"}.`
                      : "Add the recommended schedule to your calendar."}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <button onClick={() => addToCalendar(selectedTask)} disabled={calendarStatus[selectedTask.id] === "syncing"}
                    style={{ padding: "0.6rem 1.1rem", background: calendarStatus[selectedTask.id] === "done" || selectedTask.calendar_synced ? PALETTE.greenSoft : PALETTE.indigoSoft, color: calendarStatus[selectedTask.id] === "done" || selectedTask.calendar_synced ? PALETTE.green : PALETTE.indigo, border: "none", borderRadius: "9px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {calendarStatus[selectedTask.id] === "syncing" ? "Adding..." : calendarStatus[selectedTask.id] === "done" || selectedTask.calendar_synced ? "Added" : "Add to Calendar"}
                  </button>
                  <button onClick={() => openGoogleCalendar(selectedTask)}
                    style={{ padding: "0.6rem 1.1rem", background: PALETTE.amberSoft, color: PALETTE.amber, border: "none", borderRadius: "9px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                    {selectedTask.calendar_link ? "Open Event" : "Open Calendar"}
                  </button>
                </div>
              </div>
            )}
            {calendarStatus[selectedTask.id] === "error" && (
              <p style={{ fontSize: "0.78rem", color: PALETTE.red, marginTop: "-0.5rem", marginBottom: "1rem" }}>
                {calendarError[selectedTask.id] || "Calendar event could not be created. Check the backend logs."}
              </p>
            )}

            {/* Email report */}
            <div style={{ background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "18px", padding: "1.25rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
              <div>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 600, color: PALETTE.ink, marginBottom: "0.2rem" }}>
                  {selectedTask.status === "completed" ? "Completion email" : "Reminder email"}
                </h3>
                <p style={{ fontSize: "0.78rem", color: PALETTE.inkFaint }}>
                  {selectedTask.status === "completed"
                    ? "Send yourself a completed-task summary with time, risk, roadmap, and schedule."
                    : "Send yourself a pending-task reminder with risk, roadmap, time required, and rescue plan."}
                </p>
                {emailStatus[selectedTask.id] === "error" && (
                  <p style={{ fontSize: "0.76rem", color: PALETTE.red, marginTop: "0.35rem" }}>
                    {emailError[selectedTask.id] || "Email failed. Check backend .env EMAIL_FROM and EMAIL_PASSWORD."}
                  </p>
                )}
              </div>
              <button onClick={() => sendTaskEmail(selectedTask)} disabled={emailStatus[selectedTask.id] === "sending"}
                style={{ padding: "0.6rem 1.1rem", background: emailStatus[selectedTask.id] === "sent" ? PALETTE.greenSoft : PALETTE.indigoSoft, color: emailStatus[selectedTask.id] === "sent" ? PALETTE.green : PALETTE.indigo, border: "none", borderRadius: "9px", cursor: "pointer", fontSize: "0.82rem", fontWeight: 600, whiteSpace: "nowrap" }}>
                {emailStatus[selectedTask.id] === "sending"
                  ? "Sending..."
                  : emailStatus[selectedTask.id] === "sent"
                    ? "Email sent"
                    : selectedTask.status === "completed"
                      ? "Send summary"
                      : "Send reminder"}
              </button>
            </div>

            <VoiceAssistant task={selectedTask} />

            {/* Steps */}
            <div style={{ background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "18px", padding: "1.5rem", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1rem", color: PALETTE.inkSoft }}>Action steps</h3>
              {selectedTask.steps.map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.65rem 0", borderBottom: i < selectedTask.steps.length - 1 ? `1px solid ${PALETTE.lineSoft}` : "none" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <span style={{ width: "22px", height: "22px", background: PALETTE.indigoSoft, color: PALETTE.indigo, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: "0.88rem", color: PALETTE.ink }}>{s.step}</span>
                  </div>
                  <span style={{ color: PALETTE.inkFaint, fontSize: "0.8rem", fontFamily: "'IBM Plex Mono', monospace" }}>{s.duration_minutes}m</span>
                </div>
              ))}
            </div>

            {selectedTask.memories.length > 0 && (
              <div style={{ background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "18px", padding: "1.5rem", marginBottom: "1rem" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1rem", color: PALETTE.inkSoft }}>RAG memory - similar past tasks</h3>
                {selectedTask.memories.map((m, i) => (
                  <div key={i} style={{ background: PALETTE.lineSoft, borderRadius: "11px", padding: "0.75rem 1rem", marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: "0.86rem", fontWeight: 500, color: PALETTE.ink }}>{m.task_name}</div>
                      <div style={{ fontSize: "0.72rem", color: PALETTE.inkFaint, marginTop: "0.2rem" }}>Best time: {m.best_time}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: PALETTE.indigo, fontWeight: 700, fontSize: "0.88rem", fontFamily: "'IBM Plex Mono', monospace" }}>{m.actual_hours}h actual</div>
                      <div style={{ fontSize: "0.72rem", color: m.on_time ? PALETTE.green : PALETTE.red }}>{m.on_time ? "On time" : "Missed"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "18px", padding: "1.5rem" }}>
              <h3 style={{ fontSize: "0.9rem", fontWeight: 600, marginBottom: "1rem", color: PALETTE.inkSoft }}>{selectedTask.rescue_mode ? "Emergency schedule" : "Recommended schedule"}</h3>
              {(selectedTask.rescue_mode ? selectedTask.final_plan?.emergency_schedule : selectedTask.final_plan?.schedule)?.map((s, i) => (
                <div key={i} style={{ display: "flex", gap: "1rem", padding: "0.6rem 0", borderBottom: `1px solid ${PALETTE.lineSoft}`, alignItems: "center" }}>
                  <span style={{ color: riskColor(selectedTask.risk_score), fontWeight: 700, minWidth: "55px", fontSize: "0.85rem", fontFamily: "'IBM Plex Mono', monospace" }}>{s.time}</span>
                  <span style={{ fontSize: "0.88rem", color: PALETTE.ink }}>{s.activity} <span style={{ color: PALETTE.inkFaint }}>({s.duration})</span></span>
                </div>
              ))}
              <p style={{ marginTop: "1rem", color: PALETTE.indigo, fontStyle: "italic", fontSize: "0.86rem" }}>{selectedTask.final_plan?.message}</p>
              {selectedTask.rescue_mode && selectedTask.final_plan?.extension_email && (
                <div style={{ marginTop: "1.25rem", background: PALETTE.lineSoft, borderRadius: "11px", padding: "1rem", border: `1px solid ${PALETTE.line}` }}>
                  <div style={{ fontSize: "0.74rem", color: PALETTE.inkFaint, marginBottom: "0.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Extension email draft</span>
                    <button onClick={() => copyExtensionEmail(selectedTask.final_plan.extension_email!)} style={{ background: "none", border: "none", color: PALETTE.indigo, cursor: "pointer", fontSize: "0.74rem", fontWeight: 600 }}>{emailCopied ? "Copied" : "Copy"}</button>
                  </div>
                  <p style={{ fontSize: "0.82rem", color: PALETTE.ink, whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{selectedTask.final_plan.extension_email}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* -- NOTES -- */}
        {tab === "notes" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "2rem" }}>
              <div>
                <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: "1.5rem", fontWeight: 600, color: PALETTE.ink }}>Notes</h1>
                <p style={{ color: PALETTE.inkFaint, fontSize: "0.9rem", marginTop: "0.3rem" }}>Capture ideas, strategies, and reminders</p>
              </div>
              <button onClick={openAddNote} style={{ padding: "0.65rem 1.3rem", background: PALETTE.indigo, color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontSize: "0.86rem", fontWeight: 600 }}>+ New note</button>
            </div>

            {notes.length === 0 ? (
              <div style={{ textAlign: "center", padding: "4rem 2rem", background: PALETTE.paperRaised, border: `1px solid ${PALETTE.line}`, borderRadius: "18px", color: PALETTE.inkFaint, maxWidth: "640px" }}>
                <div style={{ width: "48px", height: "48px", margin: "0 auto 1rem", borderRadius: "12px", border: `2px solid ${PALETTE.line}` }} />
                <p style={{ marginBottom: "1.25rem", color: PALETTE.inkSoft }}>No notes yet. Create your first one.</p>
                <button onClick={openAddNote} style={{ padding: "0.75rem 1.5rem", background: PALETTE.indigo, color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>Create note</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: "1rem", maxWidth: "960px" }}>
                {notes.map((note) => (
                  <div key={note.id} style={{ background: PALETTE.paperRaised, borderRadius: "16px", padding: "1.25rem", border: `1px solid ${PALETTE.line}`, borderTop: `3px solid ${note.color}`, cursor: "pointer" }}
                    onClick={() => setExpandedNoteId(expandedNoteId === note.id ? null : note.id)}>
                    <h3 style={{ fontSize: "0.92rem", fontWeight: 600, marginBottom: "0.5rem", color: PALETTE.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.title || "Untitled"}</h3>
                    <p style={{ fontSize: "0.82rem", color: PALETTE.inkSoft, lineHeight: 1.55, whiteSpace: "pre-wrap", overflow: "hidden", maxHeight: expandedNoteId === note.id ? "none" : "4.6em" }}>
                      {note.content || "No content"}
                    </p>
                    {expandedNoteId !== note.id && note.content.length > 120 && <span style={{ fontSize: "0.74rem", color: PALETTE.indigo }}>Click to expand</span>}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: `1px solid ${PALETTE.lineSoft}` }}>
                      <span style={{ fontSize: "0.68rem", color: PALETTE.inkFaint }}>{new Date(note.updatedAt).toLocaleDateString()}</span>
                      <div style={{ display: "flex", gap: "0.4rem" }} onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => openEditNote(note)} style={{ padding: "0.3rem 0.6rem", background: PALETTE.lineSoft, color: PALETTE.inkSoft, border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.7rem" }}>Edit</button>
                        <button onClick={() => { saveNotes(notes.filter((n) => n.id !== note.id)); if (expandedNoteId === note.id) setExpandedNoteId(null); }} style={{ padding: "0.3rem 0.6rem", background: PALETTE.redSoft, color: PALETTE.red, border: "none", borderRadius: "6px", cursor: "pointer", fontSize: "0.7rem" }}>X</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* -- REFLECT MODAL -- */}
      {showReflect && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(28,27,26,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: PALETTE.paperRaised, borderRadius: "18px", padding: "2rem", width: "380px", border: `1px solid ${PALETTE.line}` }}>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.5rem", color: PALETTE.ink }}>Mark as complete</h2>
            <p style={{ color: PALETTE.inkFaint, fontSize: "0.84rem", marginBottom: "1.5rem" }}>Help the AI learn from your experience</p>
            <label style={{ display: "block", fontSize: "0.82rem", color: PALETTE.inkSoft, marginBottom: "0.4rem", fontWeight: 500 }}>Actual hours taken?</label>
            <input type="number" value={actualHours} onChange={(e) => setActualHours(e.target.value)} placeholder="e.g. 5.5" style={{ ...fieldStyle(), marginBottom: "1.5rem" }} />
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setShowReflect(false)} style={{ flex: 1, padding: "0.75rem", background: PALETTE.lineSoft, color: PALETTE.ink, border: "none", borderRadius: "10px", cursor: "pointer" }}>Cancel</button>
              <button onClick={markComplete} style={{ flex: 1, padding: "0.75rem", background: PALETTE.green, color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>Save & complete</button>
            </div>
          </div>
        </div>
      )}

      {/* -- NOTE MODAL -- */}
      {showNoteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(28,27,26,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: PALETTE.paperRaised, borderRadius: "18px", padding: "2rem", width: "480px", border: `1px solid ${PALETTE.line}` }}>
            <h2 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "1.5rem", color: PALETTE.ink }}>{editingNote ? "Edit note" : "New note"}</h2>
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", color: PALETTE.inkSoft, marginBottom: "0.4rem", fontWeight: 500 }}>Title</label>
              <input value={noteTitle} onChange={(e) => setNoteTitle(e.target.value)} placeholder="Note title" style={fieldStyle()} />
            </div>
            <div style={{ marginBottom: "1.25rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", color: PALETTE.inkSoft, marginBottom: "0.4rem", fontWeight: 500 }}>Content</label>
              <textarea value={noteContent} onChange={(e) => setNoteContent(e.target.value)} placeholder="Write your note here..." rows={6} style={{ ...fieldStyle(), resize: "vertical" }} />
            </div>
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.82rem", color: PALETTE.inkSoft, marginBottom: "0.6rem", fontWeight: 500 }}>Color tag</label>
              <div style={{ display: "flex", gap: "0.6rem" }}>
                {NOTE_COLORS.map((c) => (
                  <button key={c} onClick={() => setNoteColor(c)}
                    style={{ width: "26px", height: "26px", borderRadius: "50%", background: c, border: noteColor === c ? `3px solid ${PALETTE.ink}` : "3px solid transparent", cursor: "pointer" }} />
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button onClick={() => setShowNoteModal(false)} style={{ flex: 1, padding: "0.75rem", background: PALETTE.lineSoft, color: PALETTE.ink, border: "none", borderRadius: "10px", cursor: "pointer" }}>Cancel</button>
              <button onClick={saveNote} style={{ flex: 1, padding: "0.75rem", background: PALETTE.indigo, color: "#fff", border: "none", borderRadius: "10px", cursor: "pointer", fontWeight: 600 }}>
                {editingNote ? "Save changes" : "Create note"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FONT_IMPORT = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
`;
