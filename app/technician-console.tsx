"use client";

import "./impact.css";

import {
  Activity, AlertTriangle, ArrowLeft, BookOpen, Camera, Check, CheckCircle2,
  ChevronRight, CircleUserRound, ClipboardCheck, FileText, Gauge,
  HardHat, Home, Info, LockKeyhole, Menu, Mic, QrCode, Search, ShieldAlert,
  Upload, Wifi, X, BarChart3, Users, Wrench,
  ShieldCheck, Library, UserCog, CloudOff, LogOut, MailCheck, MailWarning,
  MapPin, Radio, ChevronDown, Building2, Plus, RefreshCw, Bell,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type View = "home" | "intake" | "analysis" | "verify" | "complete" | "cases" | "machines" | "knowledge" | "impact" | "history";
type Machine = {
  id: string; asset: string; manufacturer: string; model: string; serial: string;
  control: string; location: string; status: "down" | "attention" | "running"; image: string;
};
type CaseRecord = { id: string; caseNumber: string; machineId: string; status: string; symptom: string; alarmCode: string | null; precedingChange?: string | null; notes?: string | null; openedAt: string | number; updatedAt: string | number; reviewRequestedAt?: string | number | null; managerActionDueAt?: string | number | null; confirmedCause?: string | null; repairSummary?: string | null; partsUsed?: string | null; verificationReadings?: string | null; testCycles?: string | null; safetyDevicesVerified?: boolean; repairType?: string | null; temporaryExpiresAt?: string | number | null; operatingRestrictions?: string | null; followupWork?: string | null; closeoutSubmittedByUserId?: string | null; restartApprovedByUserId?: string | null; closedAt?: string | number | null };
type ManualRecord = { id: string; title: string; manufacturer: string; model: string | null; revision: string | null; serialApplicability: string | null; documentType?: string | null; publicationDate?: string | number | null; effectiveDate?: string | number | null; language?: string | null; revalidationDueAt?: string | number | null; documentOwnerUserId?: string | null; pageCount: number | null; status: string; reviewNotes?: string | null };
type ManualSourceRecord = { id: string; manualId: string; machineId: string; manufacturer: string; model: string; serialNumber: string | null; alarmCode: string | null; sectionTitle: string; pageStart: number; pageEnd: number; sourceSummary: string; safetyNotes: string; approvedAt: string | number; manualTitle?: string; manualRevision?: string | null };
type CaseEventRecord = { id: string; eventType: string; result: string | null; reading: string | null; notes: string | null; payloadJson?: string | null; actorUserId?: string; actorName?: string; actorEmail?: string; createdAt: string | number };
type NotificationRecord = { id: string; caseId: string | null; type: string; title: string; message: string; readAt: string | number | null; createdAt: string | number };
type FeedbackRecord = { id: string; category: string; severity: string; message: string; caseNumber: string | null; contactRequested: boolean; status: string; createdAt: string | number };
type EvidenceRecord = { id: string; kind: string; fileName: string; contentType: string; sizeBytes: number; createdAt: string | number };
type TeamMember = { id: string; role: string; active: boolean; userId: string; email: string; displayName: string };
type Invitation = { id: string; email: string; role: string; status: string; expiresAt?: string | number | null; deliveredAt?: string | number | null };
type Organization = { id: string; name: string; slug: string; status: string; role: string; active: boolean };
type IntakeDraft = { machineId?: string; symptom?: string; alarm?: string; changed?: string; notes?: string; savedAt?: string };
type WorkspacePayload = { user: { id: string; role: string; platformAdmin: boolean }; organization: Organization; organizations: Organization[]; machines: Array<{ id: string; assetNumber: string; manufacturer: string; model: string; serialNumber: string | null; control: string | null; location: string | null; status: string }>; cases: CaseRecord[]; hasMoreCases: boolean; manuals: ManualRecord[]; manualSources: ManualSourceRecord[]; team: TeamMember[]; invitations: Invitation[] };
type Result = "Supports suspected cause" | "Does not support suspected cause" | "Unable to test" | "Unsafe — escalate";
type Role = "technician" | "manager";

const symptoms = ["Will not cycle", "Axis problem", "Spindle problem", "Tool changer problem", "Turret problem", "Electrical / control problem", "Hydraulic problem", "Pneumatic problem", "Lubrication / coolant problem", "Quality / dimensional problem", "Crash or contact event", "Intermittent problem", "Other"];
const activeCaseStatuses = new Set(["open", "diagnosing", "review_requested", "cause_confirmed", "closeout_requested", "escalated"]);
const elapsedLabel = (startedAt: string | number) => { const minutes=Math.max(0,Math.floor((Date.now()-new Date(startedAt).valueOf())/60000)); if(minutes<60)return `${minutes}m`; const hours=Math.floor(minutes/60); const remainder=minutes%60; return hours<24?`${hours}h ${remainder}m`:`${Math.floor(hours/24)}d ${hours%24}h`; };
const caseUrgency = (record: CaseRecord) => record.managerActionDueAt && new Date(record.managerActionDueAt).valueOf() <= Date.now() ? "overdue" : record.reviewRequestedAt ? "waiting" : "normal";
const technicianNav = [
  { id: "home" as const, label: "Home", icon: Home },
  { id: "cases" as const, label: "Active cases", icon: Activity },
  { id: "machines" as const, label: "Machines", icon: Gauge },
  { id: "knowledge" as const, label: "Manuals & repairs", icon: BookOpen },
];
const managerNav = [
  { id: "home" as const, label: "Operations", icon: Home },
  { id: "impact" as const, label: "Results", icon: BarChart3 },
  { id: "cases" as const, label: "Team & cases", icon: Users },
  { id: "knowledge" as const, label: "Manuals", icon: Library },
  { id: "machines" as const, label: "Assets & safety", icon: ShieldCheck },
];

function BrandMark() {
  return <svg className="brand-mark" viewBox="0 0 48 48" role="img" aria-label="FaultCite FC toolpath mark">
    <path className="brand-f" d="M11 37V11h16M11 23h13" />
    <path className="brand-c" d="M39 16c-2.3-3.3-5.8-5-9.8-5-7.4 0-12.7 5.5-12.7 13s5.3 13 12.7 13c4 0 7.5-1.7 9.8-5" />
    <path className="brand-path" d="M30 16h6" />
    <circle className="brand-fault" cx="39" cy="16" r="3.2" />
  </svg>;
}

function Logo() {
  return <div className="logo"><span><BrandMark /></span><div><strong>FAULTCITE</strong><small>CNC Maintenance Control</small></div></div>;
}

function Status({ value }: { value: Machine["status"] }) {
  const text = value === "down" ? "Machine down" : value === "attention" ? "Attention" : "Running";
  return <span className={`status status-${value}`}><i aria-hidden="true" />{text}</span>;
}

function Progress({ step }: { step: 1 | 2 | 3 }) {
  return <ol className="progress" aria-label={`Step ${step} of 3`}>
    {["Capture failure", "Review diagnostic", "Verify repair"].map((label, index) => (
      <li className={index + 1 <= step ? "progress-item active" : "progress-item"} aria-current={index + 1 === step ? "step" : undefined} key={label}>
        <span>{index + 1 < step ? <Check /> : index + 1}</span><b>{label}</b>
      </li>
    ))}
  </ol>;
}

export function TechnicianConsole({ signedInName, signedInEmail, signOutPath }: { signedInName: string; signedInEmail: string; signOutPath: string }) {
  const [view, setView] = useState<View>("home");
  const [role, setRole] = useState<Role>("technician");
  const [menu, setMenu] = useState(false);
  const [machineId, setMachineId] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [symptom, setSymptom] = useState("");
  const [alarm, setAlarm] = useState("");
  const [changed, setChanged] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [intakeSaving, setIntakeSaving] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [resultSaved, setResultSaved] = useState(false);
  const [reading, setReading] = useState("");
  const [suspectedCause, setSuspectedCause] = useState("");
  const [testPerformed, setTestPerformed] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [units, setUnits] = useState("");
  const [lastDiagnosticEventId, setLastDiagnosticEventId] = useState("");
  const [evidenceExceptionReason, setEvidenceExceptionReason] = useState("");
  const [managerReviewConfirmed, setManagerReviewConfirmed] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationError, setNotificationError] = useState("");
  const [notificationSaving, setNotificationSaving] = useState<string | null>(null);
  const [alarmPhoto, setAlarmPhoto] = useState<File | null>(null);
  const [checkNumber, setCheckNumber] = useState(2);
  const [causeConfirmed, setCauseConfirmed] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [online, setOnline] = useState(true);
  const [workspaceRole, setWorkspaceRole] = useState("technician");
  const [currentUserId, setCurrentUserId] = useState("");
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [resultSaving, setResultSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [caseRecords, setCaseRecords] = useState<CaseRecord[]>([]);
  const [hasMoreCases, setHasMoreCases] = useState(false);
  const [olderCasesLoading, setOlderCasesLoading] = useState(false);
  const [manualRecords, setManualRecords] = useState<ManualRecord[]>([]);
  const [manualSources, setManualSources] = useState<ManualSourceRecord[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [caseEvents, setCaseEvents] = useState<CaseEventRecord[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [historyCase, setHistoryCase] = useState<CaseRecord | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(false);
  const menuCloseRef = useRef<HTMLButtonElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const previousView = useRef<View>(view);
  const diagnosticRequestKey = useRef(crypto.randomUUID());
  const historyRequestKey = useRef(0);
  const selectedMachine = useMemo(() => machines.find((m) => m.id === machineId), [machineId, machines]);
  const applicableSources = useMemo(() => manualSources.filter(source => {
    if (source.machineId !== machineId) return false;
    if (!manualRecords.some(manual => manual.id === source.manualId && manual.status === "approved")) return false;
    const requiredAlarm = source.alarmCode?.trim().toLowerCase() || "";
    return !requiredAlarm || requiredAlarm === alarm.trim().toLowerCase();
  }), [alarm, machineId, manualRecords, manualSources]);
  const intakeDraftKey = organization ? `faultcite:intake-draft:${organization.id}` : "";
  const unreadNotifications = notifications.filter(item => !item.readAt).length;

  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true); setNotificationError("");
    try {
      const response = await fetch("/api/notifications", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const payload = await response.json().catch(() => null) as { notifications?: NotificationRecord[]; error?: string } | null;
      if (!response.ok || !payload?.notifications) throw new Error(payload?.error || "Notifications could not be loaded.");
      setNotifications(payload.notifications);
    } catch (failure) { setNotificationError(failure instanceof Error ? failure.message : "Notifications could not be loaded."); }
    finally { setNotificationsLoading(false); }
  }, []);

  async function markNotificationRead(id?: string) {
    if (notificationSaving) return;
    setNotificationSaving(id || "all"); setNotificationError("");
    try {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000), body: JSON.stringify(id ? { id } : { all: true }) });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "The notification status could not be saved.");
      const readAt = Date.now(); setNotifications(current => current.map(item => !id || item.id === id ? { ...item, readAt } : item));
      setAnnouncement(id ? "Notification marked read." : "All notifications marked read.");
    } catch (failure) { setNotificationError(failure instanceof Error && failure.name !== "TimeoutError" ? failure.message : "Notification status was not saved. Check your connection and try again."); }
    finally { setNotificationSaving(null); }
  }

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading(true);
    setWorkspaceError("");
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const payload = await response.json().catch(() => null) as (WorkspacePayload & { error?: string }) | null;
      if (!response.ok || !payload?.organization) throw new Error(payload?.error || "The saved company workspace did not respond.");
      setWorkspaceRole(payload.user.role);
      setCurrentUserId(payload.user.id);
      setPlatformAdmin(payload.user.platformAdmin);
      setOrganization(payload.organization); setOrganizations(payload.organizations || []);
      setMachines(payload.machines.map(machine => ({ id: machine.id, asset: machine.assetNumber, manufacturer: machine.manufacturer, model: machine.model, serial: machine.serialNumber || "Not recorded", control: machine.control || "Not recorded", location: machine.location || "Location not recorded", status: (["down", "attention", "running"].includes(machine.status) ? machine.status : "attention") as Machine["status"], image: `${machine.manufacturer[0] || "C"}${machine.model[0] || "M"}`.toUpperCase() })));
      setCaseRecords(payload.cases);
      setHasMoreCases(Boolean(payload.hasMoreCases));
      setManualRecords(payload.manuals);
      setManualSources(payload.manualSources || []);
      setTeam(payload.team || []); setInvitations(payload.invitations || []);
      void loadNotifications();
    } catch (failure) {
      setWorkspaceError(failure instanceof Error ? failure.message : "The saved company workspace could not be loaded.");
      setMachines([]); setCaseRecords([]); setHasMoreCases(false); setManualRecords([]); setManualSources([]); setTeam([]); setInvitations([]);
    } finally {
      setWorkspaceLoading(false);
    }
  }, [loadNotifications]);

  async function loadOlderCases() {
    if (olderCasesLoading || !hasMoreCases) return;
    const terminal = caseRecords.filter(record => !activeCaseStatuses.has(record.status));
    const before = terminal.length ? Math.min(...terminal.map(record => new Date(record.openedAt).valueOf())) : Date.now();
    setOlderCasesLoading(true); setError("");
    try {
      const response = await fetch(`/api/cases?before=${before}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      const payload = await response.json().catch(() => null) as { cases?: CaseRecord[]; hasMore?: boolean; error?: string } | null;
      if (!response.ok || !payload?.cases) throw new Error(payload?.error || "Older repair history could not be loaded.");
      setCaseRecords(current => [...current, ...payload.cases!.filter(record => !current.some(item => item.id === record.id))]);
      setHasMoreCases(Boolean(payload.hasMore));
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Older repair history could not be loaded."); }
    finally { setOlderCasesLoading(false); }
  }

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    queueMicrotask(() => void loadWorkspace());
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, [loadWorkspace]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible" && navigator.onLine) void loadNotifications(); };
    const timer = window.setInterval(refresh, 60_000); document.addEventListener("visibilitychange", refresh);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", refresh); };
  }, [loadNotifications]);

  useEffect(() => {
    if (!intakeDraftKey || view !== "intake" || activeCaseId) return;
    const draft = { machineId, symptom, alarm, changed, notes, savedAt: new Date().toISOString() };
    const hasContent = Boolean(machineId || symptom || alarm || changed || notes);
    if (hasContent) localStorage.setItem(intakeDraftKey, JSON.stringify(draft));
    else localStorage.removeItem(intakeDraftKey);
  }, [activeCaseId, alarm, changed, intakeDraftKey, machineId, notes, symptom, view]);

  useEffect(() => {
    if (!menu) return;
    const main = mainRef.current;
    const menuButton = menuButtonRef.current;
    const priorInert = main?.inert;
    const priorAriaHidden = main?.getAttribute("aria-hidden") ?? null;
    if (main) { main.inert = true; main.setAttribute("aria-hidden", "true"); }
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setMenu(false); return; }
      if (event.key !== "Tab") return;
      const sidebar = menuCloseRef.current?.closest<HTMLElement>(".sidebar");
      const items = sidebar ? Array.from(sidebar.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(element => element.offsetParent !== null) : [];
      if (!items.length) return event.preventDefault();
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    menuCloseRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", key);
      if (main) { main.inert = Boolean(priorInert); if (priorAriaHidden === null) main.removeAttribute("aria-hidden"); else main.setAttribute("aria-hidden", priorAriaHidden); }
      menuButton?.focus();
    };
  }, [menu]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1020px)");
    const update = () => setCompactNavigation(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (previousView.current !== view) {
      previousView.current = view;
      mainRef.current?.focus();
    }
  }, [view]);

  const canManage = workspaceRole === "owner" || workspaceRole === "manager";
  const workflowActive = ["intake", "analysis", "verify"].includes(view);

  function startCase(id = "") {
    let draft: IntakeDraft | null = null;
    if (!id && intakeDraftKey) {
      try { draft = JSON.parse(localStorage.getItem(intakeDraftKey) || "null") as IntakeDraft | null; } catch { draft = null; }
    }
    setMachineId(id || draft?.machineId || ""); setConfirmed(false); setSymptom(draft?.symptom || ""); setAlarm(draft?.alarm || ""); setChanged(draft?.changed || ""); setNotes(draft?.notes || "");
    setResult(null); setResultSaved(false); setReading(""); setSuspectedCause(""); setTestPerformed(""); setExpectedResult(""); setUnits(""); setLastDiagnosticEventId(""); setError(""); setView("intake");
    setCheckNumber(1); setCauseConfirmed(false); setAlarmPhoto(null); setCaseEvents([]); setEvidence([]); setActiveCaseId(""); setCaseNumber("");
    if (draft) setAnnouncement("Recovered the unsaved machine-down intake draft from this device. Reconfirm the machine before saving.");
  }

  function resumeCase(record: CaseRecord) {
    if (["closed", "canceled"].includes(record.status)) {
      const requestKey = historyRequestKey.current + 1;
      historyRequestKey.current = requestKey;
      setCaseEvents([]); setEvidence([]); setHistoryLoading(true);
      setHistoryCase(record); setMachineId(record.machineId); setActiveCaseId(record.id); setCaseNumber(record.caseNumber); setError(""); setView("history");
      Promise.all([
        fetch(`/api/cases/${record.id}/events`, { cache: "no-store" }).then(response => response.ok ? response.json() : Promise.reject(new Error("timeline"))),
        fetch(`/api/cases/${record.id}/evidence`, { cache: "no-store" }).then(response => response.ok ? response.json() : Promise.reject(new Error("evidence"))),
      ]).then(([timelinePayload, evidencePayload]) => {
        if (historyRequestKey.current !== requestKey) return;
        setCaseEvents(timelinePayload?.events || []);
        setEvidence(evidencePayload?.evidence || []);
      }).catch(() => {
        if (historyRequestKey.current === requestKey) setError("The complete saved case history could not be loaded. Return to cases and try again.");
      }).finally(() => {
        if (historyRequestKey.current === requestKey) setHistoryLoading(false);
      });
      return;
    }
    if (record.status === "escalated") { setError(`${record.caseNumber} is stopped for safety and is waiting for a manager resolution.`); setView("cases"); return; }
    if (record.status === "closeout_requested" && role === "technician") { setError(`${record.caseNumber} is waiting for manager closeout approval. The technician record is preserved.`); setView("cases"); return; }
    setMachineId(record.machineId); setActiveCaseId(record.id); setCaseNumber(record.caseNumber);
    setSymptom(record.symptom); setAlarm(record.alarmCode || "No alarm"); setChanged(record.precedingChange || ""); setNotes(record.notes || ""); setConfirmed(true); setResult(null); setResultSaved(false);
    setCauseConfirmed(["cause_confirmed", "closeout_requested"].includes(record.status)); setView(["cause_confirmed", "closeout_requested"].includes(record.status) ? "verify" : "analysis");
    setCaseEvents([]); setTimelineLoading(true); setTimelineError("");
    fetch(`/api/cases/${record.id}/events`, { cache: "no-store" }).then(async response => {
      if (response.ok) return response.json();
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      throw new Error(payload?.error || "The saved case timeline did not respond.");
    }).then(payload => {
      const events = (payload?.events || []) as CaseEventRecord[];
      setCaseEvents(events);
      const diagnosticEvents = events.filter(item => item.eventType === "diagnostic_result");
      const last = diagnosticEvents.at(-1);
      setCheckNumber(diagnosticEvents.length + 1);
      const returnedAfterUnsafeStop = record.status === "diagnosing" && last?.result === "Unsafe — escalate";
      if (last?.result && !returnedAfterUnsafeStop) {
        let structured: { suspectedCause?: string; testPerformed?: string; expectedResult?: string; units?: string } = {};
        try { structured = JSON.parse(last.payloadJson || "{}") as typeof structured; } catch { structured = {}; }
        setResult(last.result as Result); setReading(last.reading || ""); setSuspectedCause(structured.suspectedCause || ""); setTestPerformed(structured.testPerformed || ""); setExpectedResult(structured.expectedResult || ""); setUnits(structured.units || ""); setLastDiagnosticEventId(last.id); setResultSaved(true);
      } else {
        setResult(null); setReading(""); setSuspectedCause(""); setTestPerformed(""); setExpectedResult(""); setUnits(""); setLastDiagnosticEventId(""); setResultSaved(false);
      }
    }).catch(failure => setTimelineError(failure instanceof Error ? failure.message : "The saved case timeline could not be loaded."))
      .finally(() => setTimelineLoading(false));
    fetch(`/api/cases/${record.id}/evidence`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(payload => setEvidence(payload?.evidence || [])).catch(() => setError("The saved evidence could not be loaded."));
  }

  function retryActiveTimeline() {
    const record = caseRecords.find(item => item.id === activeCaseId);
    if (record) resumeCase(record);
  }

  async function uploadEvidence(file: File, kind: "alarm_screen" | "diagnostic_observation" | "repair_evidence" = "diagnostic_observation") {
    if (!activeCaseId) return;
    const form = new FormData(); form.set("file", file); form.set("kind", kind);
    const upload = await fetch(`/api/cases/${activeCaseId}/evidence`, { method: "POST", body: form });
    if (!upload.ok) throw new Error("The case is saved, but the photo upload failed. Retry it from this case.");
    const payload = await upload.json() as { evidence: EvidenceRecord }; setEvidence(current => [payload.evidence, ...current]); setAlarmPhoto(null);
  }

  async function submitIntake(event: FormEvent) {
    event.preventDefault();
    if (intakeSaving) return;
    if (!selectedMachine) return setError("Select a machine before continuing.");
    if (!confirmed) return setError("Confirm the asset, model, serial number, control, and location.");
    if (!symptom) return setError("Select what the machine is failing to do.");
    if (!alarm.trim()) return setError("Enter the alarm code or type “No alarm.”");
    setError(""); setAnalyzing(true); setIntakeSaving(true);
    try {
      const editing = Boolean(activeCaseId);
      const caseResponse = await fetch(editing ? `/api/cases/${activeCaseId}` : "/api/cases", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ machineId: selectedMachine.id, symptom, alarmCode: alarm, precedingChange: changed, notes }) });
      if (!caseResponse.ok) {
        const payload = await caseResponse.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || "The case could not be saved. Check your connection and try again.");
      }
      const saved = await caseResponse.json() as { case: CaseRecord }; setActiveCaseId(saved.case.id); setCaseNumber(saved.case.caseNumber); setCaseRecords(current => editing ? current.map(item => item.id === saved.case.id ? saved.case : item) : [saved.case, ...current]); setMachines(current => current.map(machine => machine.id === selectedMachine.id ? { ...machine, status: "down" } : machine));
      if (!editing && intakeDraftKey) localStorage.removeItem(intakeDraftKey);
      if (alarmPhoto) { const form = new FormData(); form.set("file", alarmPhoto); form.set("kind", "alarm_screen"); const upload = await fetch(`/api/cases/${saved.case.id}/evidence`, { method: "POST", body: form }); if (upload.ok) { const payload = await upload.json() as { evidence: EvidenceRecord }; setEvidence([payload.evidence]); setAlarmPhoto(null); } else setError("The case is saved, but the photo upload failed. Retry it below."); }
      const timeline = await fetch(`/api/cases/${saved.case.id}/events`, { cache: "no-store" }); if (timeline.ok) setCaseEvents(((await timeline.json()) as {events: CaseEventRecord[]}).events);
      setAnalyzing(false); setView("analysis");
    } catch (failure) {
      setAnalyzing(false); setError(failure instanceof Error ? failure.message : "The case could not be saved.");
    } finally {
      setIntakeSaving(false);
    }
  }

  async function saveResult() {
    if (!result || resultSaving) return;
    if (!activeCaseId) { setError("This case has not been saved."); return; }
    if (!suspectedCause.trim() || !testPerformed.trim() || !expectedResult.trim() || !reading.trim()) { setError("Name the suspected cause and record the test, expected result, and actual observation."); return; }
    setResultSaving(true);
    try {
      const response = await fetch(`/api/cases/${activeCaseId}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result, reading, suspectedCause, testPerformed, expectedResult, units, checkNumber, idempotencyKey: diagnosticRequestKey.current }) });
      if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; setError(payload?.error || "The diagnostic result could not be saved."); return; }
      const saved = await response.json() as { status: string; eventId: string };
      setCaseRecords(current => current.map(item => item.id === activeCaseId ? { ...item, status: saved.status, updatedAt: Date.now() } : item));
      setResultSaved(true); setLastDiagnosticEventId(saved.eventId); setCauseConfirmed(false); setError("");
      diagnosticRequestKey.current = crypto.randomUUID();
      setAnnouncement(`${result} recorded for diagnostic check ${checkNumber}.`);
      const timeline = await fetch(`/api/cases/${activeCaseId}/events`, { cache: "no-store" }); if (timeline.ok) setCaseEvents(((await timeline.json()) as {events: CaseEventRecord[]}).events);
    } catch { setError("The diagnostic result could not reach FaultCite. Check the connection and try again."); }
    finally { setResultSaving(false); }
  }

  function continueDiagnosis() {
    diagnosticRequestKey.current = crypto.randomUUID(); setCheckNumber(n => n + 1); setResult(null); setResultSaved(false); setReading(""); setSuspectedCause(""); setTestPerformed(""); setExpectedResult(""); setUnits(""); setLastDiagnosticEventId("");
  }

  async function confirmCause() {
    if (!activeCaseId || result !== "Supports suspected cause" || !lastDiagnosticEventId || !suspectedCause.trim()) { setError("The latest saved observation must name and support the suspected cause before manager confirmation."); return; }
    if (!evidence.length && evidenceExceptionReason.trim().length < 20) { setError("Attach case evidence or explain in at least 20 characters why file evidence is not applicable."); return; }
    if (!managerReviewConfirmed) { setError("Confirm that you reviewed the observation and supporting evidence or exception."); return; }
    try {
      const response = await fetch(`/api/cases/${activeCaseId}/confirm-cause`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ supportingEventId: lastDiagnosticEventId, evidenceExceptionReason: evidenceExceptionReason.trim() || null, reviewConfirmed: managerReviewConfirmed }) });
      if (!response.ok) { const payload=await response.json().catch(()=>null) as {error?:string}|null; setError(payload?.error || "The cause could not be confirmed."); return; }
      const payload = await response.json() as { confirmedCause?: string };
      const confirmedCause = payload.confirmedCause || suspectedCause;
      setCauseConfirmed(true); setCaseRecords(current => current.map(item => item.id === activeCaseId ? { ...item, status: "cause_confirmed", confirmedCause, managerActionDueAt: null, updatedAt: Date.now() } : item)); setError(""); setAnnouncement("Named cause confirmed by the authenticated manager with evidence review recorded.");
      const timeline = await fetch(`/api/cases/${activeCaseId}/events`, { cache: "no-store" }); if (timeline.ok) setCaseEvents(((await timeline.json()) as {events: CaseEventRecord[]}).events);
    } catch { setError("Cause confirmation could not reach FaultCite. Check the connection and try again."); }
  }

  async function requestReview() {
    if (!activeCaseId) return;
    try {
      const response = await fetch(`/api/cases/${activeCaseId}/request-review`, { method: "POST" });
      if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; setError(payload?.error || "Manager review could not be requested."); return; }
      setCaseRecords(current => current.map(item => item.id === activeCaseId ? { ...item, status: "review_requested", updatedAt: Date.now() } : item)); setAnnouncement("Manager review requested and saved.");
      const timeline = await fetch(`/api/cases/${activeCaseId}/events`, { cache: "no-store" }); if (timeline.ok) setCaseEvents(((await timeline.json()) as {events: CaseEventRecord[]}).events);
    } catch { setError("Manager review could not reach FaultCite. Check the connection and try again."); }
  }

  function openMachine(machineIdToOpen: string) {
    const existingCase = caseRecords.find(record => record.machineId === machineIdToOpen && activeCaseStatuses.has(record.status));
    if (existingCase) resumeCase(existingCase);
    else startCase(machineIdToOpen);
  }

  return <div className="shell">
    <a className="skip-link" href="#faultcite-main">Skip to workspace</a>
    <aside id="primary-sidebar" className={menu ? "sidebar sidebar-open" : "sidebar"} aria-label="Application navigation" aria-hidden={compactNavigation && !menu ? true : undefined} inert={compactNavigation && !menu ? true : undefined}>
      <button ref={menuCloseRef} className="close-menu" onClick={() => setMenu(false)} aria-label="Close navigation"><X /></button>
      <Logo />
      {organization && <CompanySwitcher current={organization} organizations={organizations} canCreate={platformAdmin && role === "manager"} canAdminister={canManage && role === "manager"} disabled={workflowActive} />}
      <div className="role-switch" role="group" aria-label="Choose task mode"><button disabled={workflowActive} aria-pressed={role === "technician"} className={role === "technician" ? "active" : ""} onClick={() => { setRole("technician"); setView("home"); }}><Wrench />Tech tasks</button>{canManage && <button disabled={workflowActive} aria-pressed={role === "manager"} className={role === "manager" ? "active" : ""} onClick={() => { setRole("manager"); setView("home"); }}><UserCog />Manager tasks</button>}</div>
      <nav aria-label="Primary navigation">
        {(role === "technician" ? technicianNav : managerNav).map(({ id, label, icon: Icon }) => { const count = caseRecords.filter(item => role === "manager" ? ["review_requested", "cause_confirmed", "closeout_requested", "escalated"].includes(item.status) : activeCaseStatuses.has(item.status)).length; return <button key={id} disabled={workflowActive} className={view === id ? "nav-active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => { setView(id); setMenu(false); }}><Icon />{label}{id === "cases" && count > 0 && <em>{count}</em>}</button>; })}
      </nav>
      <div className="sidebar-foot">
        <div className={online ? "online" : "online offline"}>{online ? <i /> : <CloudOff />}{online ? "Connected · saved actions are confirmed individually" : "Offline · saving unavailable"}<small>Evidence-first workflow</small></div>
        <div className="profile"><CircleUserRound /><span><strong>{signedInName}</strong><small>{role === "technician" ? "Maintenance technician" : "Manager workspace"}</small></span></div>
        <a className="sign-out" href="/help"><Info />Help & safety</a>
        <a className="sign-out" href={signOutPath}><LogOut />Sign out</a>
      </div>
    </aside>
    {menu && <button className="scrim" onClick={() => setMenu(false)} aria-label="Close navigation" />}
    <main id="faultcite-main" ref={mainRef} tabIndex={-1} aria-label={`${view.replaceAll("_", " ")} screen`}>
      <header className="topbar">
        <button ref={menuButtonRef} className="menu" onClick={() => setMenu(true)} aria-label="Open navigation" aria-expanded={menu} aria-controls="primary-sidebar"><Menu /></button>
        <div className="mobile-logo"><Logo /></div>
        <div className="top-context"><span>{organization?.name || "FaultCite workspace"}</span><small>{role === "technician" ? "Technician mode" : "Manager mode"}</small></div>
        <div className="top-actions">
          <a className="mobile-sign-out" href={signOutPath} aria-label="Sign out"><LogOut /></a>
          <button className="search notification-button" disabled={workflowActive} onClick={() => { setNotificationsOpen(true); void loadNotifications(); }} aria-label={`Notifications${unreadNotifications ? `, ${unreadNotifications} unread` : ""}`} title="Notifications"><Bell />{unreadNotifications > 0 && <em aria-hidden="true">{unreadNotifications > 99 ? "99+" : unreadNotifications}</em>}</button>
          <button className="search" disabled={workflowActive || workspaceLoading} onClick={() => void loadWorkspace()} aria-label="Refresh workspace" title="Refresh workspace"><RefreshCw className={workspaceLoading ? "spinning" : ""} /></button>
          <button className="search" disabled={workflowActive} onClick={() => setSearchOpen(true)} aria-label="Search company machines" title="Search company machines"><Search /></button>
          <button className="down-button" disabled={workflowActive} onClick={() => startCase()}><AlertTriangle />Machine Down</button>
        </div>
      </header>

      {!online && <div className="offline-banner" role="status"><CloudOff />No connection. You can review this screen, but saving is unavailable until service returns.</div>}
      {workspaceError && <WorkspaceRecovery message={workspaceError} online={online} loading={workspaceLoading} retry={loadWorkspace} signedInEmail={signedInEmail} signOutPath={signOutPath} />}
      {!workspaceError && view === "home" && (role === "technician" ? <HomeView signedInName={signedInName} online={online} startCase={startCase} go={setView} machines={machines} cases={caseRecords} loading={workspaceLoading} resumeCase={resumeCase} /> : <ManagerOperations go={setView} machines={machines} cases={caseRecords} manuals={manualRecords} manualSources={manualSources} team={team} workspaceRole={workspaceRole} />)}
      {!workspaceError && view === "intake" && <IntakeView {...{ selectedMachine, machineId, setMachineId, machines, confirmed, setConfirmed, symptom, setSymptom, alarm, setAlarm, changed, setChanged, notes, setNotes, error, submitIntake, alarmPhoto, setAlarmPhoto, online }} saving={intakeSaving} editing={Boolean(activeCaseId)} back={() => setView(activeCaseId ? "analysis" : "home")} />}
      {!workspaceError && view === "analysis" && selectedMachine && <AnalysisView machine={selectedMachine} symptom={symptom} alarm={alarm} sources={applicableSources} analyzing={analyzing} result={result} setResult={(next) => { setResult(next); setError(""); }} resultSaved={resultSaved} resultSaving={resultSaving} reading={reading} setReading={(next) => { setReading(next); setError(""); }} suspectedCause={suspectedCause} setSuspectedCause={setSuspectedCause} testPerformed={testPerformed} setTestPerformed={setTestPerformed} expectedResult={expectedResult} setExpectedResult={setExpectedResult} units={units} setUnits={setUnits} saveResult={saveResult} confirmCause={confirmCause} requestReview={requestReview} canApprove={canManage && role === "manager"} openSource={() => setSourceOpen(true)} back={() => setView("intake")} backToCases={() => setView("cases")} canEditIntake={caseRecords.find(item => item.id === activeCaseId) ? ["open", "diagnosing"].includes(caseRecords.find(item => item.id === activeCaseId)!.status) : true} verify={() => setView("verify")} checkNumber={checkNumber} causeConfirmed={causeConfirmed} continueDiagnosis={continueDiagnosis} caseNumber={caseNumber} error={error} signedInName={signedInName} events={caseEvents} team={team} timelineLoading={timelineLoading} timelineError={timelineError} retryTimeline={retryActiveTimeline} evidence={evidence} evidenceExceptionReason={evidenceExceptionReason} setEvidenceExceptionReason={setEvidenceExceptionReason} managerReviewConfirmed={managerReviewConfirmed} setManagerReviewConfirmed={setManagerReviewConfirmed} retryPhoto={(file) => uploadEvidence(file, "diagnostic_observation")} />}
      {!workspaceError && view === "verify" && selectedMachine && <VerificationView machine={selectedMachine} result={result} caseId={activeCaseId} draft={caseRecords.find(item => item.id === activeCaseId)} confirmedCause={caseRecords.find(item => item.id === activeCaseId)?.confirmedCause || ""} signedInName={signedInName} canApprove={canManage && role === "manager"} evidenceCount={evidence.length} uploadCloseoutEvidence={(file) => uploadEvidence(file, "repair_evidence")} back={() => setView("analysis")} submitted={(closeout) => { const status = closeout.status || "closeout_requested"; setCaseRecords(current => current.map(item => item.id === activeCaseId ? { ...item, status, ...closeout, updatedAt: Date.now() } : item)); setAnnouncement(status === "closed" ? "This case was already closed by a manager. The current record has been refreshed." : "Closeout sent to the manager approval queue."); setView("cases"); }} complete={(closeout) => { const repairType = closeout.repairType || "Permanent"; setCaseRecords(current => current.map(item => item.id === activeCaseId ? { ...item, ...closeout, status: "closed", repairType, updatedAt: Date.now() } : item)); setMachines(current => current.map(item => item.id === machineId ? { ...item, status: repairType === "Temporary" ? "attention" : "running" } : item)); setView("complete"); }} />}
      {!workspaceError && view === "complete" && selectedMachine && <CompleteView machine={selectedMachine} caseNumber={caseNumber} signedInName={signedInName} repairType={caseRecords.find(item => item.id === activeCaseId)?.repairType || "Permanent"} start={() => startCase()} home={() => setView("home")} />}
      {!workspaceError && view === "cases" && <UtilityView title={role === "manager" ? "Review queue & team" : "Cases"} eyebrow={`${caseRecords.filter(item => activeCaseStatuses.has(item.status)).length} ACTIVE`} icon={<Activity />}>{role === "manager" && <><ReviewQueue cases={caseRecords} machines={machines} team={team} open={resumeCase} onResolved={(caseId, status, machineStatus) => { const record = caseRecords.find(item => item.id === caseId); setCaseRecords(current => current.map(item => item.id === caseId ? { ...item, status, updatedAt: Date.now() } : item)); if (record) setMachines(current => current.map(item => item.id === record.machineId ? { ...item, status: machineStatus } : item)); setError(""); setAnnouncement(status === "diagnosing" ? "Escalation resolved. The case is ready for a new technician observation." : "Case canceled without restart authorization."); }} /><TeamPanel team={team} invitations={invitations} currentUserId={currentUserId} workspaceRole={workspaceRole} onTeamChanged={setTeam} onInvitationsChanged={setInvitations} /></>}{error && <div className="error" role="alert"><AlertTriangle />{error}</div>}{caseRecords.length ? <>{caseRecords.map(record => <CaseRow key={record.id} record={record} machine={machines.find(machine => machine.id === record.machineId)} onClick={() => resumeCase(record)} />)}{hasMoreCases && <button className="secondary load-history" type="button" disabled={olderCasesLoading} onClick={() => void loadOlderCases()}>{olderCasesLoading ? "Loading older repairs…" : "Load older repair history"}</button>}</> : <EmptyState title="No cases yet" detail="Start a Machine Down case when an asset needs attention." action="Start Machine Down case" onAction={() => startCase()} />}</UtilityView>}
      {!workspaceError && view === "machines" && <UtilityView title="Machine registry" eyebrow={`${machines.length} ASSETS`} icon={<Gauge />}>{canManage && role === "manager" && <MachineAdmin onSaved={machine => setMachines(current => [...current, machine])} />}{machines.length ? <div className="registry">{machines.map(m => <MachineCard key={m.id} machine={m} onClick={() => openMachine(m.id)} />)}</div> : <EmptyState title="No machines registered" detail={canManage && role === "manager" ? "Use the registration form above to add the first company machine." : canManage ? "Switch to Manager tasks to register the first company machine." : "Ask a manager to add the first company machine."} />}</UtilityView>}
      {!workspaceError && view === "history" && historyCase && <CaseHistory record={historyCase} machine={machines.find(item => item.id === historyCase.machineId)} events={caseEvents} evidence={evidence} loading={historyLoading} error={error} back={() => setView("cases")} />}
      {!workspaceError && view === "knowledge" && <UtilityView title="Company manuals" eyebrow={`${manualRecords.length} DOCUMENTS · ${manualSources.length} APPROVED SOURCES`} icon={<BookOpen />}>{canManage && role === "manager" && <ManualUploadPanel onSaved={manual => setManualRecords(current => [manual, ...current])} />}<KnowledgeList manuals={manualRecords} machines={machines} sources={manualSources} canManage={canManage && role === "manager"} onChanged={setManualRecords} onSourceApproved={source => setManualSources(current => [source, ...current])} /></UtilityView>}
      {!workspaceError && view === "impact" && <ImpactView cases={caseRecords} machines={machines} manuals={manualRecords} team={team} workspaceRole={workspaceRole} />}
    </main>
    {sourceOpen && selectedMachine && <SourceModal close={() => setSourceOpen(false)} machine={selectedMachine} alarmCode={alarm} />}
    {searchOpen && <SearchModal close={() => setSearchOpen(false)} machines={machines} openMachine={(id) => { setSearchOpen(false); openMachine(id); }} />}
    {notificationsOpen && <NotificationsModal notifications={notifications} loading={notificationsLoading} saving={notificationSaving} error={notificationError} close={() => setNotificationsOpen(false)} retry={loadNotifications} markRead={markNotificationRead} openCase={(caseId) => { const record=caseRecords.find(item=>item.id===caseId); if(record){setNotificationsOpen(false);resumeCase(record);} }} />}
    {role === "technician" && !workflowActive && !workspaceError && <MobileNav view={view} go={setView} startCase={startCase} />}
    <div className="sr-only" aria-live="polite">{announcement}</div>
  </div>;
}

function CompanySwitcher({ current, organizations, canCreate, canAdminister, disabled }: { current: Organization; organizations: Organization[]; canCreate: boolean; canAdminister: boolean; disabled: boolean }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function switchCompany(organizationId: string) {
    if (organizationId === current.id || busy) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/organizations", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId }) });
    if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; setBusy(false); return setMessage(payload?.error || "Company could not be opened."); }
    window.location.reload();
  }
  async function createCompany(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/organizations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; setBusy(false); return setMessage(payload?.error || "Company could not be created."); }
    window.location.reload();
  }
  async function renameCompany() { const next=window.prompt("Company name",current.name)?.trim(); if(!next||next===current.name)return;setBusy(true);const response=await fetch("/api/organizations",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"rename",name:next})});if(!response.ok){setBusy(false);return setMessage("Company name could not be changed.");}window.location.reload(); }
  return <section className="company-switcher" aria-label="Company administration">
    <label htmlFor="company-workspace"><Building2 /> Company</label>
    <select id="company-workspace" value={current.id} disabled={busy || disabled} onChange={event => switchCompany(event.target.value)}>
      {organizations.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
    </select>
    {canCreate && <button type="button" disabled={disabled} className="company-add" onClick={() => { setCreating(value => !value); setMessage(""); }}><Plus />{creating ? "Cancel" : "Add company"}</button>}
    {current.role === "owner" && canAdminister && <><button type="button" disabled={disabled} className="company-add" onClick={renameCompany}>Rename company</button><a className="company-export" aria-disabled={disabled} tabIndex={disabled ? -1 : undefined} href={disabled ? undefined : "/api/export"}>Export company data</a></>}
    {creating && <form onSubmit={createCompany}><label htmlFor="new-company-name">New company name</label><input id="new-company-name" required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Example Maintenance Co." /><button type="submit" disabled={busy}>{busy ? "Creating…" : "Create & open"}</button></form>}
    {message && <p role="alert">{message}</p>}
  </section>;
}

function WorkspaceRecovery({ message, online, loading, retry, signedInEmail, signOutPath }: { message: string; online: boolean; loading: boolean; retry: () => Promise<void>; signedInEmail: string; signOutPath: string }) {
  const accessIssue = /invitation-only|no enabled company membership|access to the selected company is disabled/i.test(message);
  if (accessIssue) return <div className="page focused workspace-recovery" role="alert"><div className="recovery-card access-card"><span><LockKeyhole /></span><small>COMPANY ACCESS REQUIRED</small><h1>You are signed in, but no company workspace is available</h1><p>Signed in as <strong>{signedInEmail}</strong>.</p><p>Open the secure link sent by your company manager. The invitation must be addressed to this exact email. If it was sent to another address, switch accounts before opening it again.</p><div className="recovery-actions"><a className="secondary" href={signOutPath}><LogOut />Use a different account</a><button className="primary" type="button" disabled={loading || !online} onClick={() => void retry()}>{loading ? "Checking access…" : online ? "Check access again" : "Waiting for connection"}</button></div></div></div>;
  return <div className="page focused workspace-recovery" role="alert"><div className="recovery-card"><span><AlertTriangle /></span><small>WORKSPACE NOT VERIFIED</small><h1>Do not treat this as an empty maintenance queue</h1><p>{message}</p><p>Browser connection: <strong>{online ? "online" : "offline"}</strong>. FaultCite has not confirmed the database and company records, so machine-down, case, manual, and manager actions are locked.</p><div><button className="primary" type="button" disabled={loading || !online} onClick={() => void retry()}>{loading ? "Checking saved records…" : online ? "Retry workspace check" : "Waiting for connection"}</button></div></div></div>;
}

function HomeView({ signedInName, online, startCase, go, machines, cases, loading, resumeCase }: { signedInName: string; online: boolean; startCase: (id?: string) => void; go: (v: View) => void; machines: Machine[]; cases: CaseRecord[]; loading: boolean; resumeCase: (record: CaseRecord) => void }) {
  const active = [...cases].filter(record => activeCaseStatuses.has(record.status)).sort((a,b) => new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf())[0];
  const activeMachine = active ? machines.find(machine => machine.id === active.machineId) : undefined;
  const activeTitle = active?.status === "escalated" ? "Manager safety decision required" : active?.status === "closeout_requested" ? "Closeout awaiting manager approval" : activeMachine ? `Resume ${activeMachine.asset} diagnosis` : "Active case";
  const waitingForManager = active ? ["escalated", "closeout_requested"].includes(active.status) : false;
  const activeAction = waitingForManager ? "View case status" : "Resume case";
  const priorityMachines = [...machines].filter(machine => machine.status !== "running").sort((a, b) => (a.status === b.status ? a.asset.localeCompare(b.asset) : a.status === "down" ? -1 : 1));
  const openMachine = (machine: Machine) => {
    const existingCase = cases.find(record => record.machineId === machine.id && activeCaseStatuses.has(record.status));
    if (existingCase) resumeCase(existingCase);
    else startCase(machine.id);
  };
  return <div className="page">
    <div className="sample-banner pilot-banner"><ShieldCheck /><span><strong>Safety controls active</strong> Company records are live. Diagnostic recommendations stay locked until an applicable manual page has been reviewed and approved.</span></div>
    <section className="welcome"><div><span className="eyebrow">TECHNICIAN WORKSPACE</span><h1>Welcome back, {signedInName.split(" ")[0]}.</h1><p>Capture the failure, document the evidence, and build a permanent repair record.</p></div><div className={online ? "sync-state" : "sync-state is-offline"}>{online ? <Wifi /> : <CloudOff />}<span><small>CONNECTION</small><strong>{online ? "Online · saves confirmed per action" : "Saving unavailable"}</strong></span></div></section>
    {loading ? <section className="resume-card"><div><span className="eyebrow">LOADING WORKSPACE</span><h2>Checking saved company work…</h2></div></section> : active && activeMachine ? <section className="resume-card"><div><span className="eyebrow red">ACTIVE CASE · {active.status.replaceAll("_", " ").toUpperCase()}</span><h2>{activeTitle}</h2><p>{activeMachine.manufacturer} {activeMachine.model} · {active.alarmCode || "No alarm"} · {active.caseNumber}</p></div><button onClick={() => waitingForManager ? go("cases") : resumeCase(active)}>{activeAction} <ChevronRight /></button></section> : <section className="resume-card"><div><span className="eyebrow">NO ACTIVE CASE</span><h2>Your saved work is clear</h2><p>Start a case when a registered machine needs attention.</p></div></section>}
    <section className="home-action-grid"><button className="home-primary-action" onClick={() => startCase()}><AlertTriangle /><span><small>URGENT ACTION</small><strong>Start Machine Down case</strong><p>Identify the machine and capture the failure.</p></span><ChevronRight /></button><button onClick={() => startCase()}><QrCode /><span><strong>Select machine</strong><small>{machines.length} registered assets</small></span><ChevronRight /></button><button onClick={() => go("cases")}><ClipboardCheck /><span><strong>Open cases</strong><small>{cases.filter(item => activeCaseStatuses.has(item.status)).length} active</small></span><ChevronRight /></button><button onClick={() => go("knowledge")}><BookOpen /><span><strong>Manuals & repairs</strong><small>Company documents and history</small></span><ChevronRight /></button></section>
    <section className="section-heading"><div><span className="eyebrow">PRIORITIZED WORK</span><h2>What needs attention</h2></div><button onClick={() => go("machines")}>View all <ChevronRight /></button></section>
    <div className="machine-list">{priorityMachines.map(machine => <MachineCard key={machine.id} machine={machine} onClick={() => openMachine(machine)} />)}{!loading && !priorityMachines.length && <EmptyState title="No machines need attention" detail="Registered machines marked Down or Attention will appear here." />}</div>
  </div>;
}

function ManagerOperations({ go, machines, cases, manuals, manualSources, team, workspaceRole }: { go: (v: View) => void; machines: Machine[]; cases: CaseRecord[]; manuals: ManualRecord[]; manualSources: ManualSourceRecord[]; team: TeamMember[]; workspaceRole: string }) {
  const open=cases.filter(item=>activeCaseStatuses.has(item.status));
  const verified=manuals.filter(item=>item.status==="approved");
  const awaitingCases=cases.filter(item=>["review_requested","closeout_requested","escalated"].includes(item.status));
  const overdue=awaitingCases.filter(item=>caseUrgency(item)==="overdue").length;
  const activeApprovers=team.filter(item=>item.active&&["owner","manager"].includes(item.role));
  const oldest=open.length?elapsedLabel(Math.min(...open.map(item=>new Date(item.openedAt).valueOf()))):"None";
  const completed=cases.filter(item=>item.status==="closed").length;
  const readiness=[
    {label:"Register pilot machines",done:machines.length>0,detail:machines.length?`${machines.length} machine${machines.length===1?"":"s"} registered`:"Add the first machine and verify its nameplate",view:"machines" as View},
    {label:"Assign an independent approver",done:activeApprovers.length>0,detail:activeApprovers.length?`${activeApprovers.length} active owner/manager ${activeApprovers.length===1?"account":"accounts"}`:"Invite an owner or manager who can review technician work",view:"cases" as View},
    {label:"Approve controlled source pages",done:verified.length>0&&manualSources.length>0,detail:manualSources.length?`${manualSources.length} exact-page source ${manualSources.length===1?"record":"records"} approved`:verified.length?"Manual metadata is approved; exact pages still need review":"Upload a licensed PDF, approve metadata, then approve exact pages",view:"knowledge" as View},
    {label:"Complete a supervised case",done:completed>0,detail:completed?`${completed} closed, read-only ${completed===1?"record":"records"}`:"Run the technician-to-manager workflow before field use",view:"cases" as View},
  ];
  const readyCount=readiness.filter(item=>item.done).length;
  return <div className="page"><div className="sample-banner"><ShieldCheck />These counts come directly from the selected company workspace. Savings and downtime trends appear only after enough verified case history exists.</div><div className="welcome"><div><span className="eyebrow">OPERATIONS OVERVIEW</span><h1>Maintenance operations</h1><p>See current machine risk, team workload, and document readiness.</p></div></div><section className="manager-summary" aria-label="Current operations summary"><article><small>Machines down</small><strong>{machines.filter(m=>m.status==="down").length}</strong><span className="red-text">Oldest incident: {oldest}</span></article><article className={overdue?"metric-overdue":""}><small>Awaiting manager action</small><strong>{awaitingCases.length}</strong><span className={overdue?"red-text":"amber-text"}>{overdue?`${overdue} overdue`:"Reviews, closeouts, escalations"}</span></article><article><small>Open cases</small><strong>{open.length}</strong><span>Saved company cases</span></article><article><small>Approved manuals</small><strong>{verified.length}/{manuals.length}</strong><span>{manuals.length?"Metadata reviewed":"Manual coverage required"}</span></article></section><section className="readiness-card" aria-labelledby="readiness-title"><div className="readiness-head"><div><small className="eyebrow">{workspaceRole==="owner"?"OWNER PILOT CHECKLIST":"PILOT CHECKLIST"}</small><h2 id="readiness-title">{readyCount} of {readiness.length} readiness gates complete</h2><p>Finish these company-controlled setup steps before technicians begin the pilot.</p></div><strong aria-label={`${Math.round(readyCount/readiness.length*100)} percent complete`}>{Math.round(readyCount/readiness.length*100)}%</strong></div><ol>{readiness.map(item=><li key={item.label} className={item.done?"done":""}><span>{item.done?<Check aria-hidden="true"/>:<span aria-hidden="true">{readiness.indexOf(item)+1}</span>}</span><div><strong>{item.label}</strong><small>{item.detail}</small></div><button className="secondary" type="button" onClick={()=>go(item.view)}>{item.done?"Review":"Complete step"}<span className="sr-only">: {item.label}</span></button></li>)}</ol></section><button className="impact-callout" onClick={() => go("impact")}><span><BarChart3 /></span><div><small>OPERATIONS REPORTING</small><strong>Open results and readiness</strong><p>Review completed work, record quality, and rollout readiness from saved company data.</p></div><ChevronRight /></button></div>;
}

function MachineCard({ machine, onClick }: { machine: Machine; onClick: () => void }) {
  return <button className="machine-card" onClick={onClick}><span className="machine-image">{machine.image}</span><div><div className="machine-line"><small>{machine.asset}</small><Status value={machine.status} /></div><h3>{machine.manufacturer} {machine.model}</h3><p>{machine.location} · {machine.control}</p></div><ChevronRight /></button>;
}

type IntakeProps = {
  selectedMachine?: Machine; machines: Machine[]; machineId: string; setMachineId: (v: string) => void; confirmed: boolean; setConfirmed: (v: boolean) => void;
  symptom: string; setSymptom: (v: string) => void; alarm: string; setAlarm: (v: string) => void; changed: string; setChanged: (v: string) => void;
  notes: string; setNotes: (v: string) => void; error: string; submitIntake: (e: FormEvent) => void; back: () => void;
  alarmPhoto: File | null; setAlarmPhoto: (v: File | null) => void; editing: boolean; saving: boolean; online: boolean;
};

function IntakeView(p: IntakeProps) {
  const alarmPhotoRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (p.error) errorRef.current?.focus(); }, [p.error]);
  return <div className="page focused">
    <button className="back" disabled={p.saving} onClick={p.back}><ArrowLeft />{p.editing ? "Cancel intake changes" : "Back to home"}</button>
    <div className="flow-title"><span className="eyebrow red">MACHINE DOWN · STEP 1 OF 3</span><h1>{p.editing ? "Edit the saved intake" : "Capture the failure"}</h1><p>{p.editing ? "Correct the failure details without replacing the case number or evidence." : "Confirm the machine first. Only essential downtime information is required."}</p></div>
    <Progress step={1} />
    <form className="flow-layout" aria-busy={p.saving} onSubmit={p.submitIntake}>
      <section className="form-card">
        <div className="scan-primary unavailable-feature" role="note"><QrCode /><span><strong>Machine tag scanning</strong><small>Tag scanning is not enabled in this release. Select and verify the registered asset below.</small></span></div>
        <div className="field"><label htmlFor="machine">Or select machine <b>Required</b></label><select id="machine" required aria-describedby={p.error ? "intake-error" : undefined} aria-invalid={Boolean(p.error && !p.selectedMachine)} value={p.machineId} disabled={p.editing || p.saving} onChange={e => { p.setMachineId(e.target.value); p.setConfirmed(false); }}><option value="">Choose an asset…</option>{p.machines.map(m => <option value={m.id} key={m.id}>{m.asset} · {m.manufacturer} {m.model}</option>)}</select>{p.editing && <small>Machine identity is locked after the case is created.</small>}{!p.machines.length && <small>No machines are registered. A manager must add one before a case can be opened.</small>}</div>
        {p.selectedMachine && <div className="confirm-machine"><div className="confirm-head"><span className="machine-image large">{p.selectedMachine.image}</span><div><span className="eyebrow">VERIFY ASSET</span><h2>{p.selectedMachine.asset} · {p.selectedMachine.manufacturer} {p.selectedMachine.model}</h2><p>Compare this record with the machine nameplate before continuing.</p></div></div><dl><div><dt>Serial number</dt><dd>{p.selectedMachine.serial}</dd></div><div><dt>CNC control</dt><dd>{p.selectedMachine.control}</dd></div><div><dt>Location</dt><dd>{p.selectedMachine.location}</dd></div><div><dt>Status</dt><dd><Status value={p.selectedMachine.status} /></dd></div></dl><label className={p.confirmed ? "confirm-check checked" : "confirm-check"}><input type="checkbox" checked={p.confirmed} onChange={e => p.setConfirmed(e.target.checked)} /><span><Check /></span>I confirmed the asset, model, serial, control, and location.</label></div>}
        <fieldset aria-required="true" aria-describedby={p.error ? "intake-error" : undefined}><legend>What is the machine failing to do? <b>Required</b></legend><div className="symptoms">{symptoms.map(s => <button type="button" disabled={p.saving} key={s} aria-pressed={p.symptom === s} className={p.symptom === s ? "selected" : ""} onClick={() => p.setSymptom(s)}>{s}{p.symptom === s && <CheckCircle2 />}</button>)}</div></fieldset>
        <div className="two-fields"><div className="field"><label htmlFor="alarm">Alarm code <b>Required</b></label><input id="alarm" required aria-describedby={p.error ? "intake-error" : undefined} aria-invalid={Boolean(p.error && !p.alarm.trim())} value={p.alarm} disabled={p.saving} onChange={e => p.setAlarm(e.target.value)} placeholder="Example: 2041" inputMode="text" autoCapitalize="characters" /></div><button className="secondary" type="button" disabled={p.saving} onClick={() => p.setAlarm("No alarm")}>No alarm</button><input ref={alarmPhotoRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={event => p.setAlarmPhoto(event.target.files?.[0] || null)} aria-label="Take a photo of the alarm screen" /><button className={p.alarmPhoto ? "secondary success" : "secondary"} type="button" disabled={p.saving} onClick={() => alarmPhotoRef.current?.click()}><Camera />{p.alarmPhoto ? "Photo selected · saves with case" : "Capture screen"}</button></div>
        <div className="field"><label htmlFor="changed">What changed immediately before it failed?</label><input id="changed" value={p.changed} onChange={e => p.setChanged(e.target.value)} placeholder="Crash, setup change, outage, maintenance, nothing known…" /></div>
        <div className="field"><label htmlFor="notes">Quick notes <span>Optional</span></label><textarea id="notes" value={p.notes} onChange={e => p.setNotes(e.target.value)} placeholder="What did the operator see or hear?" /><p className="voice unavailable-feature"><Mic />Voice notes are not enabled; typed notes are saved as a local draft on this device until the case is created.</p></div>
        {p.error && <div ref={errorRef} tabIndex={-1} id="intake-error" className="error" role="alert"><AlertTriangle />{p.error}</div>}
      </section>
      <aside className="flow-aside"><div className="safety"><ShieldAlert /><div><strong>Safety comes first</strong><p>Stop if energy state, machine identity, or authorization is uncertain. Follow the employer’s LOTO procedure.</p></div></div><div className="summary-card"><span className="eyebrow">BEFORE YOU CONTINUE</span><ul><li className={p.selectedMachine ? "done" : ""}>Machine selected</li><li className={p.confirmed ? "done" : ""}>Identity confirmed</li><li className={p.symptom ? "done" : ""}>Symptom captured</li><li className={p.alarm ? "done" : ""}>Alarm status recorded</li></ul></div><button className="primary" type="submit" disabled={p.saving || !p.online}>{p.saving ? "Saving case…" : !p.online ? "Waiting for connection" : p.editing ? "Save intake changes" : "Create case & open record"}</button><small className="fine-print">Unsaved intake text is kept only on this device. Photos save after the case reaches the server.</small></aside>
    </form>
  </div>;
}

type AnalysisProps = { machine: Machine; symptom: string; alarm: string; sources: ManualSourceRecord[]; analyzing: boolean; result: Result | null; setResult: (r: Result) => void; resultSaved: boolean; resultSaving: boolean; reading: string; setReading: (v: string) => void; suspectedCause: string; setSuspectedCause: (v: string) => void; testPerformed: string; setTestPerformed: (v: string) => void; expectedResult: string; setExpectedResult: (v: string) => void; units: string; setUnits: (v: string) => void; saveResult: () => Promise<void>; confirmCause: () => Promise<void>; requestReview: () => Promise<void>; canApprove: boolean; openSource: () => void; back: () => void; backToCases: () => void; canEditIntake: boolean; verify: () => void; checkNumber: number; causeConfirmed: boolean; continueDiagnosis: () => void; caseNumber: string; error: string; signedInName: string; events: CaseEventRecord[]; team: TeamMember[]; timelineLoading: boolean; timelineError: string; retryTimeline: () => void; evidence: EvidenceRecord[]; evidenceExceptionReason: string; setEvidenceExceptionReason: (value: string) => void; managerReviewConfirmed: boolean; setManagerReviewConfirmed: (value: boolean) => void; retryPhoto: (file: File) => Promise<void> };

function AnalysisView(p: AnalysisProps) {
  if (p.analyzing) return <div className="page focused"><div className="analyzing"><span><BrandMark /></span><h1>Saving the case</h1><p>Creating the permanent company record.</p></div></div>;
  return <div className="page focused">
    <button className="back" onClick={p.canEditIntake ? p.back : p.backToCases}><ArrowLeft />{p.canEditIntake ? "Edit case intake" : "Back to cases"}</button>
    <div className="case-title"><div><span className="eyebrow red">ACTIVE BREAKDOWN · {p.caseNumber || "SAVED CASE"}</span><h1>{p.machine.asset} · {p.symptom}</h1><p>{p.machine.manufacturer} {p.machine.model} · Alarm {p.alarm}</p></div><Status value="down" /></div>
    <Progress step={2} />
    <div className="machine-strip"><span className="machine-image">{p.machine.image}</span><div className="machine-strip-identity"><small>CONFIRMED MACHINE</small><strong>{p.machine.asset} · {p.machine.manufacturer} {p.machine.model}</strong><p>S/N {p.machine.serial} · {p.machine.control}</p></div><div className="machine-strip-facts"><span><MapPin />{p.machine.location}</span><span><Radio />{p.caseNumber}</span></div><Status value="down" /><span className="sync-pill"><Check /> Saved case</span></div>
    <div className="stop-banner" role="alert"><ShieldAlert /><div><strong>Stop — use the employer-approved safe state and LOTO procedure.</strong><p>Do not bypass interlocks, force outputs, or continue if machine identity or energy state is uncertain.</p></div></div>
    <div className="analysis-layout"><section className="analysis-main">
      <article className="check-card current-check"><div className="check-label"><span>TECHNICIAN OBSERVATION {p.checkNumber}</span><b>SOURCE-GATED MODE</b></div>{p.sources.length ? <div className="approved-guidance"><ShieldCheck /><span><strong>{p.sources.length} approved manual {p.sources.length === 1 ? "source applies" : "sources apply"} to this machine{p.alarm ? " and alarm" : ""}.</strong><small>Review the exact cited pages and safety notes before recording independently authorized work.</small></span><button className="secondary" type="button" onClick={p.openSource}>View approved sources</button></div> : <div className="confidence-warning"><AlertTriangle /><span><strong>No approved, applicable manual page is indexed for this case.</strong><small>FaultCite will not invent a procedure, expected result, likely cause, or citation.</small></span><button className="secondary" type="button" onClick={p.openSource}>Why guidance is withheld</button></div>}<div className="check-name"><span><ClipboardCheck /></span><div><h2>Record only work you are independently authorized and qualified to perform</h2><p>{p.sources.length ? "Use the approved source alongside your employer's safety program. FaultCite records the observation but does not authorize the work." : "Use your employer's safety program and the correct OEM documentation outside FaultCite. This record does not authorize a diagnostic step."}</p></div></div>
        {!p.resultSaved && <><div className="diagnostic-structure"><div className="field"><label htmlFor="suspected-cause">Suspected cause being tested <b>Required</b></label><input id="suspected-cause" value={p.suspectedCause} onChange={e => p.setSuspectedCause(e.target.value)} placeholder="Example: low 24 VDC at the I/O module under load" /></div><div className="field"><label htmlFor="test-performed">Authorized test performed <b>Required</b></label><textarea id="test-performed" value={p.testPerformed} onChange={e => p.setTestPerformed(e.target.value)} placeholder="Describe the approved test or inspection actually performed. Do not record a planned unsafe step." /></div><div className="two-inputs"><div className="field"><label htmlFor="expected-result">Expected result <b>Required</b></label><input id="expected-result" value={p.expectedResult} onChange={e => p.setExpectedResult(e.target.value)} placeholder="Expected value or condition from the approved source" /></div><div className="field"><label htmlFor="units">Units</label><input id="units" value={p.units} onChange={e => p.setUnits(e.target.value)} placeholder="VDC, psi, mm, °F…" /></div></div></div><div className="result-label">What does the actual observation mean for this named cause?</div><div className="result-buttons">{(["Supports suspected cause", "Does not support suspected cause", "Unable to test", "Unsafe — escalate"] as Result[]).map(r => <button type="button" key={r} aria-pressed={p.result === r} className={p.result === r ? "chosen" : ""} onClick={() => p.setResult(r)}>{r}</button>)}</div>{p.result && <div className="result-capture"><div className="field"><label htmlFor="reading">Actual reading or observation <b>Required</b></label><input id="reading" value={p.reading} onChange={e => p.setReading(e.target.value)} placeholder="Record exactly what was observed and how it was measured" /></div><button className="primary" type="button" disabled={p.resultSaving} onClick={p.saveResult}>{p.resultSaving ? "Saving…" : "Save structured observation"}</button></div>}</>}
        {p.resultSaved && <div className={`saved-result result-${p.result?.toLowerCase().replaceAll(" ", "-").replace("—", "")}`}><AlertTriangle /><div><strong>{p.result} recorded for: {p.suspectedCause}</strong><p>{p.testPerformed} · Expected {p.expectedResult}{p.units ? ` ${p.units}` : ""} · Actual {p.reading}{p.units ? ` ${p.units}` : ""} · {p.signedInName}</p></div></div>}
        {p.error && <div className="error" role="alert"><AlertTriangle />{p.error}</div>}
      </article>
      <div className="analysis-summary"><div>{p.sources.length ? <ShieldCheck /> : <ShieldAlert />}{p.sources.length ? "APPROVED SOURCE AVAILABLE" : "GUIDANCE WITHHELD"}</div><h2>{p.sources.length ? "Open and verify the approved OEM pages before recording the observation." : "Applicable reviewed evidence is required before FaultCite can recommend a next check."}</h2><p>{p.sources.length ? "FaultCite shows the approved citation and safety notes without inventing additional instructions." : "This source gate prevents unsupported instructions from entering the maintenance record."}</p></div>
      {p.resultSaved && <article className="next-step"><div><span className="eyebrow">DIAGNOSTIC UPDATED</span><h2>{p.result === "Unsafe — escalate" ? "Work stopped and escalation recorded" : p.causeConfirmed ? "Cause confirmed by an authenticated manager" : "Result saved — a supporting observation does not confirm a cause"}</h2><p>{p.causeConfirmed && p.canApprove ? "A technician must now submit the repair and verification record before manager restart approval." : "The technician, time, reading, and result are now part of the case audit record."}</p></div>{p.causeConfirmed && p.canApprove ? <button className="secondary" onClick={p.backToCases}>Wait for technician closeout</button> : p.causeConfirmed ? <button className="primary" onClick={p.verify}>Verify repair <ChevronRight /></button> : p.result === "Unsafe — escalate" ? <span className="status status-down">Supervisor review required</span> : p.result === "Supports suspected cause" && p.canApprove ? <div className="manager-evidence-review">{!p.evidence.length && <div className="field"><label htmlFor="evidence-exception">Why file evidence is not applicable <b>Required</b></label><textarea id="evidence-exception" value={p.evidenceExceptionReason} onChange={event => p.setEvidenceExceptionReason(event.target.value)} minLength={20} maxLength={500} placeholder="Explain why a photo or file would not add useful evidence for this observation." /></div>}<label className={p.managerReviewConfirmed ? "confirm-check checked" : "confirm-check"}><input type="checkbox" checked={p.managerReviewConfirmed} onChange={event => p.setManagerReviewConfirmed(event.target.checked)} /><span><Check /></span>I reviewed the technician observation and {p.evidence.length ? `${p.evidence.length} attached evidence item${p.evidence.length === 1 ? "" : "s"}` : "the documented evidence exception"}.</label><button className="primary" onClick={p.confirmCause}>Confirm technician conclusion <ShieldCheck /></button></div> : p.result === "Supports suspected cause" ? <button className="primary" onClick={p.requestReview}>Request manager review <ShieldCheck /></button> : <button className="primary" onClick={p.continueDiagnosis}>Record another observation <ChevronRight /></button>}</article>}
    </section><aside className="analysis-aside"><CaseTimeline events={p.events} team={p.team} loading={p.timelineLoading} error={p.timelineError} retry={p.retryTimeline} /><EvidencePanel evidence={p.evidence} retryPhoto={p.retryPhoto} /><div className="prototype"><HardHat /><div><strong>Source-gated safety mode</strong><p>{p.sources.length ? `${p.sources.length} manager-approved source ${p.sources.length === 1 ? "record is" : "records are"} available for review.` : "Guidance remains locked until applicable, reviewed page-level evidence is available."}</p></div></div></aside></div>
  </div>;
}

function CaseTimeline({ events, team, loading, error, retry }: { events: CaseEventRecord[]; team: TeamMember[]; loading: boolean; error: string; retry: () => void }) {
  const [openEvent, setOpenEvent] = useState("");
  const labels: Record<string,string> = { case_opened:"Case opened", diagnostic_result:"Observation recorded", evidence_added:"Evidence saved", review_requested:"Manager review requested", cause_confirmed:"Cause confirmed", case_closed:"Case closed", followup_created:"Follow-up created" };
  return <div className="timeline-card" aria-busy={loading}><h2 className="eyebrow">SAVED CASE TIMELINE</h2>{loading?<p role="status">Loading saved timeline…</p>:error?<div className="timeline-error" role="alert"><strong>Timeline unavailable</strong><p>{error} The case itself remains saved.</p><button className="secondary full" type="button" onClick={retry}>Retry timeline</button></div>:!events.length?<p>No timeline events have been saved for this case yet.</p>:<ol>{events.map(e=>{const detailsId=`event-${e.id}`;const fallbackActor=team.find(member=>member.userId===e.actorUserId);const actorName=e.actorName||fallbackActor?.displayName;const actorEmail=e.actorEmail||fallbackActor?.email;return <li className="done" key={e.id}><i><Check /></i><button type="button" onClick={()=>setOpenEvent(openEvent===e.id?"":e.id)} aria-expanded={openEvent===e.id} aria-controls={detailsId}><span><strong>{labels[e.eventType] || e.eventType.replaceAll("_", " ")}</strong><small>{new Date(e.createdAt).toLocaleString()}{actorName&&actorEmail?` · ${actorName} (${actorEmail})`:" · Authenticated user"}</small></span><ChevronDown className={openEvent===e.id?"rotated":""} /></button>{openEvent===e.id&&<p id={detailsId}>{[e.result,e.reading,e.notes].filter(Boolean).join(" · ") || "Saved event"}</p>}</li>})}</ol>}</div>;
}

function EvidencePanel({ evidence, retryPhoto }: { evidence: EvidenceRecord[]; retryPhoto: (file: File) => Promise<void> }) {
  const input = useRef<HTMLInputElement>(null); const [uploading, setUploading] = useState(false); const [error, setError] = useState("");
  async function selected(file?: File) { if (!file) return; setUploading(true); setError(""); try { await retryPhoto(file); } catch (failure) { setError(failure instanceof Error ? failure.message : "Photo upload failed."); } finally { setUploading(false); } }
  return <div className="timeline-card" aria-busy={uploading}><span className="eyebrow">PRIVATE CASE EVIDENCE</span><input ref={input} hidden type="file" accept="image/*" capture="environment" onChange={event => selected(event.target.files?.[0])} />{evidence.length ? <ol>{evidence.map(item => <li className="done" key={item.id}><i><Camera /></i><a href={`/api/evidence/${item.id}`} target="_blank" rel="noreferrer"><span><strong>{item.fileName}</strong><small>{item.kind.replaceAll("_", " ")} · {Math.max(1, Math.round(item.sizeBytes / 1024))} KB</small></span><ChevronRight /></a></li>)}</ol> : <p>No evidence image is attached yet.</p>}<button className="secondary full" type="button" disabled={uploading} onClick={() => input.current?.click()}><Camera />{uploading ? "Uploading…" : "Add or retry photo"}</button>{error && <p className="red-text" role="alert">{error}</p>}</div>;
}

function VerificationView({ machine, result, caseId, draft, confirmedCause, signedInName, canApprove, evidenceCount, uploadCloseoutEvidence, back: returnToDiagnostic, submitted, complete }: { machine: Machine; result: Result | null; caseId: string; draft?: CaseRecord; confirmedCause: string; signedInName: string; canApprove: boolean; evidenceCount: number; uploadCloseoutEvidence: (file: File) => Promise<void>; back: () => void; submitted: (casePatch: Partial<CaseRecord>) => void; complete: (casePatch: Partial<CaseRecord>) => void }) {
  const [work, setWork] = useState(draft?.repairSummary || ""); const [parts, setParts] = useState(draft?.partsUsed || ""); const [partQty, setPartQty] = useState(""); const [beforeAfter, setBeforeAfter] = useState(draft?.verificationReadings || ""); const [cycles, setCycles] = useState(draft?.testCycles || ""); const [safety, setSafety] = useState(Boolean(draft?.safetyDevicesVerified)); const authorized = signedInName; const [approval, setApproval] = useState(false); const [repairType, setRepairType] = useState(draft?.repairType || "Permanent"); const [followup, setFollowup] = useState(draft?.followupWork || ""); const [expires, setExpires] = useState(draft?.temporaryExpiresAt ? new Date(draft.temporaryExpiresAt).toISOString().slice(0, 10) : ""); const [restrictions, setRestrictions] = useState(draft?.operatingRestrictions || ""); const [review, setReview] = useState(false); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const closeoutPhotoRef = useRef<HTMLInputElement>(null); const [photoUploading, setPhotoUploading] = useState(false);
  const temporaryReady = repairType === "Permanent" || Boolean(followup && expires && restrictions);
  const closeoutRequestKey = useRef(crypto.randomUUID());
  const canSubmit = Boolean(!saving && !photoUploading && caseId && confirmedCause && work && beforeAfter && cycles && safety && temporaryReady && review && (!canApprove || (authorized && approval)));
  const dirty = work !== (draft?.repairSummary || "") || parts !== (draft?.partsUsed || "") || Boolean(partQty) || beforeAfter !== (draft?.verificationReadings || "") || cycles !== (draft?.testCycles || "") || safety !== Boolean(draft?.safetyDevicesVerified) || repairType !== (draft?.repairType || "Permanent") || followup !== (draft?.followupWork || "") || expires !== (draft?.temporaryExpiresAt ? new Date(draft.temporaryExpiresAt).toISOString().slice(0, 10) : "") || restrictions !== (draft?.operatingRestrictions || "") || approval || review;
  function leaveCloseout() { if (dirty && !window.confirm("Discard the unsaved closeout changes and return to diagnosis?")) return; returnToDiagnostic(); }
  const back = leaveCloseout;
  async function submit(e: FormEvent) { e.preventDefault(); if (!canSubmit) { setError("Complete every required closeout item before continuing."); return; } setSaving(true); setError(""); try { const response = await fetch(canApprove ? `/api/cases/${caseId}/close` : `/api/cases/${caseId}/request-closeout`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repairSummary: work, partsUsed: [parts, partQty && `Qty ${partQty}`].filter(Boolean).join(" · "), verificationReadings: beforeAfter, testCycles: cycles, safetyDevicesVerified: safety, approvalConfirmed: canApprove ? approval : false, repairType, temporaryExpiresAt: expires || null, operatingRestrictions: restrictions, followupWork: followup, idempotencyKey: closeoutRequestKey.current }) }); const payload = await response.json().catch(() => null) as { case?: Partial<CaseRecord>; error?: string } | null; if (!response.ok) { setError(payload?.error || "The closeout could not be saved."); return; } const casePatch = payload?.case || { repairSummary: work, partsUsed: [parts, partQty && `Qty ${partQty}`].filter(Boolean).join(" · "), verificationReadings: beforeAfter, testCycles: cycles, safetyDevicesVerified: safety, repairType, temporaryExpiresAt: expires || null, operatingRestrictions: restrictions, followupWork: followup }; if (canApprove) complete(casePatch); else submitted(casePatch); } catch { setError("The closeout could not reach FaultCite. Check the connection and try again."); } finally { setSaving(false); } }
  async function addCloseoutPhoto(file?: File) { if (!file) return; setPhotoUploading(true); setError(""); try { await uploadCloseoutEvidence(file); } catch (failure) { setError(failure instanceof Error ? failure.message : "Closeout photo could not be saved."); } finally { setPhotoUploading(false); } }
  return <div className="page focused"><button className="back" onClick={back}><ArrowLeft />Back to diagnostic</button><div className="flow-title"><span className="eyebrow red">MACHINE DOWN · STEP 3 OF 3</span><h1>{canApprove ? "Review the technician closeout" : "Verify the repair"}</h1><p>{canApprove ? "The submitted technician record is read-only. A different authorized manager or owner records the restart authorization." : "Complete three short sections, then submit the record for manager approval."}</p></div><Progress step={3} /><form className="verify-layout" aria-busy={saving || photoUploading} onSubmit={submit}><section className="form-card closeout-sections"><div className="verified-machine"><CheckCircle2 /><div><small>CASE MACHINE</small><strong>{machine.asset} · {machine.manufacturer} {machine.model}</strong></div><span>{result || "Result pending"}</span></div><fieldset className="closeout-section"><legend><span>1</span>Cause and repair</legend><div className="confirmed-cause"><small>MANAGER-CONFIRMED CAUSE</small><strong>{confirmedCause || "Confirmed cause unavailable — return to diagnostic review"}</strong><p>This permanent value cannot be silently replaced during closeout.</p></div><div className="field"><label htmlFor="work">Work performed <b>Required</b></label><textarea id="work" required readOnly={canApprove} value={work} onChange={e => setWork(e.target.value)} placeholder="Describe the repair or adjustment." /></div><div className="parts-row"><div className="field"><label htmlFor="parts">Part number</label><input id="parts" readOnly={canApprove} value={parts} onChange={e => setParts(e.target.value)} placeholder="Part number or none" /></div><div className="field"><label htmlFor="qty">Quantity</label><input id="qty" inputMode="numeric" readOnly={canApprove} value={partQty} onChange={e => setPartQty(e.target.value)} placeholder="0" /></div></div></fieldset><fieldset className="closeout-section"><legend><span>2</span>Verification test</legend><div className="field"><label htmlFor="readings">Before / after readings <b>Required</b></label><input id="readings" required readOnly={canApprove} value={beforeAfter} onChange={e => setBeforeAfter(e.target.value)} placeholder="Measured value before → after, including units" /></div><div className="field"><label htmlFor="cycles">Successful test cycles <b>Required</b></label><input id="cycles" readOnly={canApprove} value={cycles} onChange={e => setCycles(e.target.value)} placeholder="Example: 5 automatic cycles without alarm" /></div>{!canApprove && <><input ref={closeoutPhotoRef} hidden type="file" accept="image/*" capture="environment" onChange={event => void addCloseoutPhoto(event.target.files?.[0])} /><button type="button" className="secondary" disabled={photoUploading} onClick={() => closeoutPhotoRef.current?.click()}><Camera />{photoUploading ? "Saving closeout photo…" : "Add before / after photo"}</button></>}<small>{evidenceCount} case evidence file{evidenceCount === 1 ? "" : "s"} currently saved.</small></fieldset><fieldset className="closeout-section"><legend><span>3</span>Safety and restart authorization</legend><label className={safety ? "confirm-check checked safety-check" : "confirm-check safety-check"}><input type="checkbox" disabled={canApprove} checked={safety} onChange={e => setSafety(e.target.checked)} /><span><Check /></span>Required guards and safety devices were verified after the repair.</label><div className="two-inputs"><div className="field"><label htmlFor="authorized">Authenticated reviewer <b>Required</b></label><input id="authorized" value={authorized} readOnly /></div><div className="field"><label htmlFor="type">Repair status</label><select id="type" disabled={canApprove} value={repairType} onChange={e => setRepairType(e.target.value)}><option>Permanent</option><option>Temporary</option></select></div></div>{canApprove && <label className={approval ? "confirm-check checked approval-check" : "confirm-check approval-check"}><input type="checkbox" checked={approval} onChange={e => setApproval(e.target.checked)} /><span><LockKeyhole /></span><div><strong>Record human restart authorization</strong><small>The submitter and approver must be different authenticated users. Role, date, and time are saved permanently.</small></div></label>}{repairType === "Temporary" && <div className="temporary-panel"><strong>Temporary repair controls</strong><div className="two-inputs"><div className="field"><label htmlFor="expires">Expires <b>Required</b></label><input id="expires" type="date" readOnly={canApprove} value={expires} onChange={e => setExpires(e.target.value)} /></div><div className="field"><label htmlFor="restrictions">Operating restrictions <b>Required</b></label><input id="restrictions" readOnly={canApprove} value={restrictions} onChange={e => setRestrictions(e.target.value)} placeholder="Limits until permanent repair" /></div></div><div className="field"><label htmlFor="followup">Required follow-up work <b>Required</b></label><textarea id="followup" readOnly={canApprove} value={followup} onChange={e => setFollowup(e.target.value)} placeholder="A follow-up case will be created automatically." /></div></div>}</fieldset><label className={review ? "confirm-check checked review-check" : "confirm-check review-check"}><input type="checkbox" checked={review} onChange={e => setReview(e.target.checked)} /><span><Check /></span>I reviewed this closeout and confirm the record is complete.</label>{error && <div className="error" role="alert"><AlertTriangle />{error}</div>}</section><aside className="flow-aside"><div className="safety"><ShieldAlert /><div><strong>Restart is a human decision</strong><p>FaultCite records a manager’s authorization; it never determines that a machine is safe for production.</p></div></div><div className="summary-card"><span className="eyebrow">CLOSEOUT CHECK</span><ul><li className={confirmedCause ? "done" : ""}>Cause confirmed</li><li className={work ? "done" : ""}>Work documented</li><li className={beforeAfter ? "done" : ""}>Measured verification recorded</li><li className={cycles ? "done" : ""}>Test cycles recorded</li><li className={safety ? "done" : ""}>Safety devices verified</li>{canApprove ? <li className={authorized && approval ? "done" : ""}>Different-user authorization</li> : <li>Manager authorization pending</li>}<li className={temporaryReady ? "done" : ""}>Repair status complete</li><li className={review ? "done" : ""}>Closeout reviewed</li></ul></div><button className="primary" type="submit" disabled={!canSubmit}>{canApprove ? "Record restart authorization & close" : "Submit for manager authorization"} <CheckCircle2 /></button><small className="fine-print">Complete all required items to enable case closure.</small></aside></form></div>;
}

function CompleteView({ machine, caseNumber, signedInName, repairType, start, home }: { machine: Machine; caseNumber: string; signedInName: string; repairType: string; start: () => void; home: () => void }) { const temporary = repairType === "Temporary"; return <div className="page focused"><div className="complete-card"><span><CheckCircle2 /></span><small>CASE {caseNumber || "SAVED"}</small><h1>Repair verified and documented</h1><p>{temporary ? `${machine.asset} has a documented temporary repair and remains in Attention status with operating restrictions and follow-up required.` : `${machine.asset} is recorded as returned to service.`} The complete case history is ready for review and future troubleshooting.</p><dl><div><dt>Status</dt><dd>{temporary ? "Closed · temporary controls active" : "Closed · verified"}</dd></div><div><dt>Closed by</dt><dd>{signedInName}</dd></div><div><dt>Record</dt><dd>Saved with audit history</dd></div></dl><div><button className="secondary" onClick={home}>Return home</button><button className="primary" onClick={start}>Start another case</button></div></div></div>; }

function MobileNav({ view, go, startCase }: { view: View; go: (view: View) => void; startCase: (id?: string) => void }) {
  return <nav className="mobile-nav" aria-label="Mobile technician navigation">
    <button aria-current={view === "home" ? "page" : undefined} className={view === "home" ? "active" : ""} onClick={() => go("home")}><Home /><span>Home</span></button>
    <button aria-current={view === "cases" ? "page" : undefined} className={view === "cases" ? "active" : ""} onClick={() => go("cases")}><Activity /><span>Cases</span></button>
    <button className="mobile-down" onClick={() => startCase()} aria-label="Start Machine Down case"><AlertTriangle /><span>Machine down</span></button>
    <button aria-current={view === "machines" ? "page" : undefined} className={view === "machines" ? "active" : ""} onClick={() => go("machines")}><QrCode /><span>Machines</span></button>
    <button aria-current={view === "knowledge" ? "page" : undefined} className={view === "knowledge" ? "active" : ""} onClick={() => go("knowledge")}><BookOpen /><span>Manuals</span></button>
  </nav>;
}

function TeamPanel({ team, invitations, currentUserId, workspaceRole, onTeamChanged, onInvitationsChanged }: { team: TeamMember[]; invitations: Invitation[]; currentUserId: string; workspaceRole: string; onTeamChanged: (team: TeamMember[]) => void; onInvitationsChanged: (invites: Invitation[]) => void }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState("technician"); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(""); const [inviteLink, setInviteLink] = useState("");
  type InviteResponse = { invitation?: Invitation; acceptUrl?: string; deliveryStatus?: "sent" | "not_configured" | "failed"; deliveryMessage?: string; requiresPrivateSiteAccess?: boolean; error?: string };
  function finishInvitation(payload: InviteResponse, currentInvitations: Invitation[]) {
    if (!payload.invitation) return;
    onInvitationsChanged([payload.invitation, ...currentInvitations.filter(item => item.email !== payload.invitation?.email)]);
    setInviteLink(payload.acceptUrl || "");
    const accessNote = payload.requiresPrivateSiteAccess ? " The site owner must also authorize this address at the hosting layer." : " Sign in to FaultCite with the same invited email to accept it.";
    setMessage(`${payload.deliveryMessage || "Secure invitation saved."}${accessNote}`);
  }
  async function invite(event: FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(""); setInviteLink("");
    try {
      const response = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000), body: JSON.stringify({ email, role }) });
      const payload = await response.json().catch(() => null) as InviteResponse | null;
      if (!response.ok || !payload?.invitation) return setMessage(payload?.error || "Invitation could not be saved.");
      finishInvitation(payload, invitations); setEmail("");
    } catch { setMessage("FaultCite could not be reached. The invitation was not confirmed; try again."); }
    finally { setSaving(false); }
  }
  async function resend(invitation: Invitation) {
    setSaving(true); setMessage(""); setInviteLink("");
    try {
      const response = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000), body: JSON.stringify({ invitationId: invitation.id }) });
      const payload = await response.json().catch(() => null) as InviteResponse | null;
      if (!response.ok || !payload?.invitation) return setMessage(payload?.error || "Invitation could not be resent.");
      finishInvitation(payload, invitations);
    } catch { setMessage("FaultCite could not be reached. The invitation resend was not confirmed."); }
    finally { setSaving(false); }
  }
  async function copyInvitation() {
    try { await navigator.clipboard.writeText(inviteLink); setMessage("Secure invitation link copied. The invited person must sign in to FaultCite with the same verified email address."); }
    catch { setMessage("Copy the secure link from the field above."); }
  }
  async function updateMember(member: TeamMember, nextRole: string, active: boolean) { if (!active && member.active && !window.confirm(`Deactivate ${member.displayName}? They will immediately lose access to this company.`)) return; setSaving(true); setMessage(""); try { const response = await fetch("/api/team", { method: "PATCH", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(15_000), body: JSON.stringify({ membershipId: member.id, role: nextRole, active }) }); const payload = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) return setMessage(payload?.error || "Team member could not be updated."); onTeamChanged(team.map(item => item.id === member.id ? { ...item, role: nextRole, active } : item)); setMessage(`${member.displayName}'s access was updated.`); } catch { setMessage("FaultCite could not be reached. Team access was not confirmed."); } finally { setSaving(false); } }
  async function revoke(id: string) { const invitation = invitations.find(item => item.id === id); if (!window.confirm(`Revoke the pending invitation${invitation ? ` for ${invitation.email}` : ""}? Its link will stop working.`)) return; setSaving(true); setMessage(""); try { const response = await fetch(`/api/team?id=${encodeURIComponent(id)}`, { method: "DELETE", signal: AbortSignal.timeout(15_000) }); const payload = await response.json().catch(() => null) as { error?: string } | null; if (!response.ok) return setMessage(payload?.error || "Invitation could not be revoked."); onInvitationsChanged(invitations.map(item => item.id === id ? { ...item, status: "revoked" } : item)); setMessage("Invitation revoked."); } catch { setMessage("FaultCite could not be reached. The invitation remains pending until confirmed otherwise."); } finally { setSaving(false); } }
  return <section className="form-card team-panel">
    <div className="utility-title"><span><Users /></span><div><small className="eyebrow">ACCESS CONTROL</small><h2>Company team</h2><p>Invite people, assign roles, and suspend access without changing their selected company.</p></div></div>
    <div className="private-access-note"><LockKeyhole /><span><strong>Invitation-gated company access</strong><small>The website sign-in can be reached publicly, but only the exact invited email can join this company workspace. The link is single-use and expires.</small></span></div>
    <form className="two-inputs" onSubmit={invite}><div className="field"><label htmlFor="invite-email">Work email</label><input id="invite-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="technician@company.com" /></div><div className="field"><label htmlFor="invite-role">Role</label><select id="invite-role" value={role} onChange={event => setRole(event.target.value)}><option value="technician">Technician</option>{workspaceRole === "owner" && <option value="manager">Manager / approver</option>}</select>{workspaceRole === "manager" && <small>Managers may invite technicians. An owner must invite another manager.</small>}</div><button className="primary" type="submit" disabled={saving}>{saving ? "Sending…" : "Send invitation"}</button></form>
    {message && <p className="fine-print" role="status">{message}</p>}
    {inviteLink && <div className="invite-link"><input readOnly value={inviteLink} aria-label="Invitation link" /><button type="button" className="secondary" onClick={copyInvitation}>Copy link</button></div>}
    <div className="team-grid">
      {team.map(member => <article key={member.id}><CircleUserRound /><div><strong>{member.displayName}</strong><small>{member.email}</small><div className="member-controls"><select aria-label={`Role for ${member.displayName} (${member.email})`} value={member.role} disabled={saving || member.role === "owner" || workspaceRole === "manager"} onChange={event => updateMember(member, event.target.value, member.active)}><option value="technician">Technician</option><option value="manager">Manager</option><option value="owner">Owner</option></select><button type="button" className="secondary" aria-label={`${member.active ? "Deactivate" : "Reactivate"} ${member.displayName} (${member.email})`} disabled={saving || member.userId === currentUserId || member.role === "owner" || (workspaceRole === "manager" && member.role !== "technician")} onClick={() => updateMember(member, member.role, !member.active)}>{member.active ? "Deactivate" : "Reactivate"}</button></div></div></article>)}
      {invitations.filter(item => item.status === "pending").map(invitation => <article className="invite-card" key={invitation.id}>{invitation.deliveredAt ? <MailCheck /> : <MailWarning />}<div><strong>{invitation.email}</strong><small>Pending · {invitation.role} · {invitation.deliveredAt ? "Accepted by email provider" : "Email submission not confirmed"}</small><div className="member-controls"><button type="button" className="secondary" disabled={saving} onClick={() => resend(invitation)}>Resend</button><button type="button" className="secondary" disabled={saving} onClick={() => revoke(invitation.id)}>Revoke</button></div></div></article>)}
    </div>
  </section>;
}

function ReviewQueue({ cases, machines, team, open, onResolved }: { cases: CaseRecord[]; machines: Machine[]; team: TeamMember[]; open: (record: CaseRecord) => void; onResolved: (caseId: string, status: string, machineStatus: Machine["status"]) => void }) {
  const queue = cases.filter(item => ["review_requested", "cause_confirmed", "closeout_requested", "escalated"].includes(item.status)).sort((a,b) => new Date(a.updatedAt).valueOf() - new Date(b.updatedAt).valueOf());
  const approvers=team.filter(member=>member.active&&["owner","manager"].includes(member.role));
  return <section className="form-card team-panel"><div className="utility-title"><span><ClipboardCheck /></span><div><small className="eyebrow">MANAGER ACTION</small><h2>Review and safety queue</h2><p>Unsafe escalations stay stopped until a manager records a controlled resolution.</p></div></div><div className="queue-accountability" role="status"><div><strong>Responsible approvers</strong><p>{approvers.length?approvers.map(member=>`${member.displayName} (${member.email})`).join(" · "):"No active owner or manager is assigned to this workspace."}</p></div><div><strong>Notification coverage</strong><p>This in-app queue and overdue status are active. Urgent events still require the company&apos;s normal supervisor escalation process.</p></div></div>{queue.length ? queue.map(record => record.status === "escalated" ? <EscalationResolution key={record.id} record={record} machine={machines.find(machine => machine.id === record.machineId)} onResolved={onResolved} /> : <CaseRow key={record.id} record={record} machine={machines.find(machine => machine.id === record.machineId)} onClick={() => open(record)} />) : <EmptyState title="Manager queue is clear" detail="No reviews, closeouts, or safety escalations need action." />}</section>;
}

function EscalationResolution({ record, machine, onResolved }: { record: CaseRecord; machine?: Machine; onResolved: (caseId: string, status: string, machineStatus: Machine["status"]) => void }) {
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const resolutionKey = useRef(crypto.randomUUID());
  async function resolve(action: "return_to_diagnosis" | "cancel_without_restart") {
    if (!notes.trim()) return setMessage("Record the manager’s safety decision before resolving this escalation.");
    if (action === "cancel_without_restart" && !window.confirm(`Cancel ${record.caseNumber} without restart authorization? The machine will remain unavailable for production.`)) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch(`/api/cases/${record.id}/escalation`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, notes, idempotencyKey: resolutionKey.current }) });
      const payload = await response.json().catch(() => null) as { status?: string; machineStatus?: Machine["status"]; error?: string } | null;
      if (!response.ok || !payload?.status || !payload.machineStatus) return setMessage(payload?.error || "The escalation could not be resolved.");
      onResolved(record.id, payload.status, payload.machineStatus);
    } catch { setMessage("FaultCite could not be reached. The case remains escalated."); }
    finally { setSaving(false); }
  }
  return <article className="escalation-card" aria-busy={saving}><div className="escalation-heading"><ShieldAlert /><div><small>UNSAFE — MANAGER DECISION REQUIRED</small><h3>{record.caseNumber} · {machine?.asset || "Unknown asset"}</h3><p>{record.symptom} · {record.alarmCode || "No alarm"}</p></div></div><div className="field"><label htmlFor={`escalation-${record.id}`}>Manager resolution notes <b>Required</b></label><textarea id={`escalation-${record.id}`} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Record the safety decision, next owner, and what must happen before work resumes." /></div><div className="escalation-actions"><button className="secondary" type="button" disabled={saving} onClick={() => resolve("return_to_diagnosis")}>Return for more information</button><button className="secondary danger" type="button" disabled={saving} onClick={() => resolve("cancel_without_restart")}>Cancel case · no restart</button></div>{message && <p className="error" role="alert">{message}</p>}</article>;
}

function MachineAdmin({ onSaved }: { onSaved: (machine: Machine) => void }) {
  const [assetNumber,setAssetNumber]=useState(""); const [manufacturer,setManufacturer]=useState(""); const [model,setModel]=useState(""); const [serialNumber,setSerialNumber]=useState(""); const [control,setControl]=useState(""); const [location,setLocation]=useState(""); const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false);
  async function save(event: FormEvent) { event.preventDefault(); setSaving(true); setMessage(""); try { const response=await fetch("/api/machines",{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(15_000),body:JSON.stringify({assetNumber,manufacturer,model,serialNumber,control,location})}); const payload=await response.json().catch(()=>null) as {machine?:{id:string;assetNumber:string;manufacturer:string;model:string;serialNumber:string|null;control:string|null;location:string|null;status:string};error?:string}|null; if(!response.ok||!payload?.machine)return setMessage(payload?.error||"Machine could not be saved."); const m=payload.machine; onSaved({id:m.id,asset:m.assetNumber,manufacturer:m.manufacturer,model:m.model,serial:m.serialNumber||"Not recorded",control:m.control||"Not recorded",location:m.location||"Location not recorded",status:"running",image:`${m.manufacturer[0]||"C"}${m.model[0]||"M"}`.toUpperCase()}); setAssetNumber("");setManufacturer("");setModel("");setSerialNumber("");setControl("");setLocation("");setMessage("Machine saved to the company registry."); } catch { setMessage("FaultCite could not be reached. The machine was not confirmed as saved."); } finally { setSaving(false); } }
  return <form className="form-card team-panel" onSubmit={save}><div className="utility-title"><span><Gauge /></span><div><small className="eyebrow">MANAGER CONTROL</small><h2>Register a machine</h2><p>Technicians must verify these identity fields against the machine nameplate.</p></div></div><div className="two-inputs"><div className="field"><label htmlFor="asset-number">Asset number</label><input id="asset-number" required value={assetNumber} onChange={e=>setAssetNumber(e.target.value)} /></div><div className="field"><label htmlFor="manufacturer">Manufacturer</label><input id="manufacturer" required value={manufacturer} onChange={e=>setManufacturer(e.target.value)} /></div><div className="field"><label htmlFor="model">Model</label><input id="model" required value={model} onChange={e=>setModel(e.target.value)} /></div><div className="field"><label htmlFor="serial-number">Serial number</label><input id="serial-number" value={serialNumber} onChange={e=>setSerialNumber(e.target.value)} /></div><div className="field"><label htmlFor="control">CNC control</label><input id="control" value={control} onChange={e=>setControl(e.target.value)} /></div><div className="field"><label htmlFor="location">Location</label><input id="location" value={location} onChange={e=>setLocation(e.target.value)} /></div></div><button className="primary" disabled={saving}>{saving?"Saving…":"Add machine"}</button>{message&&<p className="fine-print">{message}</p>}</form>;
}

function CaseHistory({ record, machine, events, evidence, loading, error, back }: { record: CaseRecord; machine?: Machine; events: CaseEventRecord[]; evidence: EvidenceRecord[]; loading: boolean; error: string; back: () => void }) {
  const temporary = record.repairType === "Temporary";
  return <div className="page utility" aria-busy={loading}><button className="back" onClick={back}><ArrowLeft />Back to cases</button><div className="utility-title"><span><FileText /></span><div><small className="eyebrow">READ-ONLY REPAIR HISTORY</small><h1>{record.caseNumber} · {machine?.asset || "Unknown asset"}</h1><p>Closed records cannot be changed.</p></div></div>{temporary && <div className="stop-banner" role="status"><AlertTriangle /><div><strong>Temporary repair controls remain active</strong><p>{record.operatingRestrictions || "Restrictions not recorded"} · Expires {record.temporaryExpiresAt ? new Date(record.temporaryExpiresAt).toLocaleDateString() : "date not recorded"} · Follow-up: {record.followupWork || "not recorded"}</p></div></div>}{loading && <div className="offline-banner" role="status">Loading this case&apos;s permanent history…</div>}{error && <div className="error" role="alert"><AlertTriangle />{error}</div>}<section className="form-card"><dl><div><dt>Machine identity</dt><dd>{machine ? `${machine.asset} · ${machine.manufacturer} ${machine.model} · S/N ${machine.serial}` : "Machine record unavailable"}</dd></div><div><dt>Confirmed cause</dt><dd>{record.confirmedCause || "Not recorded"}</dd></div><div><dt>Repair performed</dt><dd>{record.repairSummary || "Not recorded"}</dd></div><div><dt>Parts used</dt><dd>{record.partsUsed || "None recorded"}</dd></div><div><dt>Verification readings</dt><dd>{record.verificationReadings || "Not recorded"}</dd></div><div><dt>Test cycles</dt><dd>{record.testCycles || "Not recorded"}</dd></div><div><dt>Safety devices</dt><dd>{record.safetyDevicesVerified ? "Verified by closeout submitter" : "Not recorded"}</dd></div><div><dt>Repair status</dt><dd>{record.repairType || "Not recorded"}</dd></div><div><dt>Closed</dt><dd>{record.closedAt ? new Date(record.closedAt).toLocaleString() : "Not recorded"}</dd></div></dl></section><section className="form-card"><h2>Evidence</h2>{!loading && (evidence.length ? evidence.map(item=><p key={item.id}><a href={`/api/evidence/${item.id}`} target="_blank" rel="noreferrer">{item.fileName}</a> · {item.kind.replaceAll("_", " ")} · {Math.ceil(item.sizeBytes/1024)} KB</p>) : <p>No file evidence recorded.</p>)}</section><section className="form-card"><h2>Permanent timeline</h2>{!loading && events.map(item=><p key={item.id}><strong>{item.eventType.replaceAll("_"," ")}</strong> · {new Date(item.createdAt).toLocaleString()} · {item.actorName && item.actorEmail ? `${item.actorName} (${item.actorEmail})` : "Authenticated user"}<br />{item.reading||item.notes||"Saved event"}</p>)}</section></div>;
}

function NotificationsModal({notifications,loading,saving,error,close,retry,markRead,openCase}:{notifications:NotificationRecord[];loading:boolean;saving:string|null;error:string;close:()=>void;retry:()=>void;markRead:(id?:string)=>Promise<void>;openCase:(caseId:string)=>void}) {
  const dialogRef=useDialogFocus(close);
  const unread=notifications.filter(item=>!item.readAt).length;
  return <div className="modal-backdrop" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget)close();}}><section ref={dialogRef} className="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notification-title" aria-busy={loading}><div className="modal-head"><div><small className="eyebrow">SAVED ALERTS</small><h2 id="notification-title">Notifications</h2><p>{unread ? `${unread} unread notification${unread===1?"":"s"}` : "You are caught up."}</p></div><button type="button" onClick={close} aria-label="Close notifications"><X /></button></div>{unread>0&&<button className="secondary notification-read-all" disabled={Boolean(saving)} type="button" onClick={()=>void markRead()}>{saving==="all"?"Saving…":"Mark all as read"}</button>}{error&&<div className="timeline-error" role="alert"><strong>Notifications unavailable</strong><p>{error}</p><button className="secondary" type="button" onClick={retry}>Try again</button></div>}{loading?<p role="status">Loading notifications…</p>:!error&&!notifications.length?<div className="notification-empty"><Bell/><strong>No notifications yet</strong><p>Review requests and closeout approvals assigned to you will appear here.</p></div>:<ol className="notification-list">{notifications.map(item=><li key={item.id} className={item.readAt?"read":"unread"}><div><strong>{item.title}</strong><small>{new Date(item.createdAt).toLocaleString()}</small><p>{item.message}</p>{item.caseId&&<button className="notification-case-link" type="button" onClick={()=>openCase(item.caseId!)}>Open related case <ChevronRight/></button>}</div>{!item.readAt&&<button className="secondary" disabled={Boolean(saving)} type="button" onClick={()=>void markRead(item.id)}>{saving===item.id?"Saving…":"Mark read"}<span className="sr-only">: {item.title}</span></button>}</li>)}</ol>}</section></div>;
}

function UtilityView({ title, eyebrow, icon, children }: { title: string; eyebrow: string; icon: React.ReactNode; children: React.ReactNode }) { return <div className="page utility"><div className="utility-title"><span>{icon}</span><div><small className="eyebrow">{eyebrow}</small><h1>{title}</h1><p>Review company records, approvals, and controlled maintenance knowledge.</p></div></div>{children}</div>; }
function CaseRow({ record, machine, onClick }: { record: CaseRecord; machine?: Machine; onClick: () => void }) { const urgency=caseUrgency(record); const age=elapsedLabel(record.openedAt); const waiting=record.reviewRequestedAt?elapsedLabel(record.reviewRequestedAt):null; const due=record.managerActionDueAt?new Date(record.managerActionDueAt).toLocaleString():null; return <button className={`case-row case-${urgency} ${record.status==="closed"?"case-closed":""}`} aria-label={`${record.caseNumber}, ${machine?.asset||"unknown asset"}, ${record.status.replaceAll("_"," ")}, incident age ${age}${waiting?`, waiting for manager ${waiting}`:""}${due?`, manager action due ${due}`:""}`} onClick={onClick}><span className="case-alert">{record.status==="closed"?<CheckCircle2 />:<AlertTriangle />}</span><div><small>{record.caseNumber} · {record.status.replaceAll("_", " ").toUpperCase()}</small><h2>{machine?.asset || "Unknown asset"} · {record.symptom}</h2><p>{machine ? `${machine.manufacturer} ${machine.model}` : "Machine record unavailable"} · {record.alarmCode || "No alarm"} · Incident age {age}{waiting?` · Manager wait ${waiting}`:""}{due?` · SLA due ${due}`:""}{urgency==="overdue"?" · OVERDUE":""}</p></div><Status value={record.status === "closed" ? "running" : machine?.status || "attention"} /><ChevronRight /></button>; }
function ManualUploadPanel({ onSaved }: { onSaved: (manual: ManualRecord) => void }) {
  const [open,setOpen]=useState(false); const [saving,setSaving]=useState(false); const [message,setMessage]=useState("");
  async function upload(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setMessage("");const target=event.currentTarget;const form=new FormData(target);form.set("rightsConfirmed",form.get("rightsConfirmed")==="on"?"true":"false");try{const file=form.get("file");let response:Response;if(file instanceof File&&file.size>512*1024){const uploadId=crypto.randomUUID();const chunkSize=512*1024;const totalChunks=Math.ceil(file.size/chunkSize);for(let index=0;index<totalChunks;index++){setMessage(`Uploading manual part ${index+1} of ${totalChunks}…`);const chunk=file.slice(index*chunkSize,Math.min(file.size,(index+1)*chunkSize));const chunkResponse=await fetch(`/api/manuals/upload-chunk?uploadId=${encodeURIComponent(uploadId)}&index=${index}&total=${totalChunks}`,{method:"POST",headers:{"content-type":"application/octet-stream"},signal:AbortSignal.timeout(60_000),body:chunk});if(!chunkResponse.ok){const error=await chunkResponse.json().catch(()=>null) as {error?:string}|null;throw new Error(error?.error||`Manual part ${index+1} could not be uploaded.`);}}const metadata=Object.fromEntries([...form.entries()].filter(([key])=>key!=="file"));response=await fetch("/api/manuals/finalize-upload",{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(60_000),body:JSON.stringify({...metadata,rightsConfirmed:metadata.rightsConfirmed==="true",uploadId,totalChunks,fileName:file.name,sizeBytes:file.size})});}else response=await fetch("/api/manuals",{method:"POST",signal:AbortSignal.timeout(60_000),body:form});const payload=await response.json().catch(()=>null) as {manual?:ManualRecord;error?:string}|null;if(!response.ok||!payload?.manual)throw new Error(payload?.error||`Manual upload failed (${response.status}).`);onSaved(payload.manual);target.reset();setOpen(false);setMessage("Manual uploaded for manager review.");}catch(error){setMessage(error instanceof Error&&error.name!=="TimeoutError"?error.message:"The upload timed out before FaultCite confirmed it. Try again.");}finally{setSaving(false);}}
  return <section className="form-card team-panel"><div className="utility-title"><span><Upload /></span><div><small className="eyebrow">CONTROLLED KNOWLEDGE</small><h2>Add a company manual</h2><p>PDFs stay private to this company and cannot guide repairs until reviewed.</p></div></div><button className="secondary" onClick={()=>setOpen(v=>!v)}>{open?"Cancel upload":"Upload licensed PDF"}</button>{open&&<form className="manual-upload" onSubmit={upload}><div className="two-inputs"><div className="field"><label htmlFor="manual-title">Title</label><input id="manual-title" name="title" required /></div><div className="field"><label htmlFor="manual-maker">Manufacturer</label><input id="manual-maker" name="manufacturer" required /></div><div className="field"><label htmlFor="manual-model">Model</label><input id="manual-model" name="model" /></div><div className="field"><label htmlFor="manual-revision">Revision</label><input id="manual-revision" name="revision" /></div><div className="field"><label htmlFor="manual-type">Document type</label><select id="manual-type" name="documentType" required defaultValue=""><option value="" disabled>Select type</option><option>Service manual</option><option>Electrical manual</option><option>Parts manual</option><option>Safety bulletin</option><option>Technical bulletin</option></select></div><div className="field"><label htmlFor="manual-language">Language</label><input id="manual-language" name="language" defaultValue="English" required /></div><div className="field"><label htmlFor="manual-publication">Publication date</label><input id="manual-publication" name="publicationDate" type="date" /></div><div className="field"><label htmlFor="manual-effective">Effective date</label><input id="manual-effective" name="effectiveDate" type="date" /></div><div className="field"><label htmlFor="manual-revalidation">Revalidation due</label><input id="manual-revalidation" name="revalidationDueAt" type="date" required /></div><div className="field"><label htmlFor="manual-serial">Serial applicability</label><input id="manual-serial" name="serialApplicability" placeholder="Exact serial number(s), separated by commas" /></div><div className="field"><label htmlFor="manual-file">PDF file · maximum 50 MB</label><input id="manual-file" name="file" type="file" accept="application/pdf,.pdf" required /></div></div><label className="check"><input name="rightsConfirmed" type="checkbox" required />My company has the right to store and use this document.</label><button className="primary" disabled={saving}>{saving?"Checking and uploading…":"Upload for review"}</button></form>}{message&&<p className="fine-print" role="status">{message}</p>}</section>;
}

function KnowledgeList({ manuals, machines, sources, canManage, onChanged, onSourceApproved }: { manuals: ManualRecord[]; machines: Machine[]; sources: ManualSourceRecord[]; canManage: boolean; onChanged: (manuals: ManualRecord[]) => void; onSourceApproved: (source: ManualSourceRecord) => void }) {
  const [message,setMessage]=useState(""); async function review(manual:ManualRecord,status:string){if(status==="rejected"&&!window.confirm(`Reject ${manual.title}? It will be blocked from diagnostic use.`))return;setMessage("");try{const response=await fetch(`/api/manuals/${manual.id}`,{method:"PATCH",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(15_000),body:JSON.stringify({status,reviewNotes:status==="approved"?"Metadata and usage rights reviewed. Exact pages require a separate manager approval.":"Manual rejected from diagnostic use."})});const payload=await response.json().catch(()=>null) as {manual?:ManualRecord;error?:string}|null;if(!response.ok||!payload?.manual)return setMessage(payload?.error||"Manual could not be updated.");onChanged(manuals.map(item=>item.id===manual.id?payload.manual!:item));setMessage(`Manual marked ${status.replaceAll("_"," ")}.`);}catch{setMessage("FaultCite could not be reached. The manual status was not confirmed.");}}
  if(!manuals.length) return <section className="manual-onboarding" aria-labelledby="manual-onboarding-title"><div className="manual-onboarding-head"><span><BookOpen /></span><div><small className="eyebrow">SOURCE-GATED SETUP</small><h2 id="manual-onboarding-title">Add the first approved manual source</h2><p>FaultCite withholds diagnostic guidance until a manager completes all four controls below.</p></div></div><ol><li><strong>1. Confirm usage rights</strong><span>Use a licensed company PDF that applies to the pilot machine.</span></li><li><strong>2. Upload the PDF</strong><span>Record manufacturer, model, revision, serial applicability, and revalidation date.</span></li><li><strong>3. Approve metadata</strong><span>An owner or manager verifies the document identity and company rights.</span></li><li><strong>4. Approve exact pages</strong><span>Bind reviewed page ranges to the registered machine and optional alarm code.</span></li></ol><p className="manual-onboarding-foot"><ShieldAlert />Until step 4 is complete, technicians may record independently authorized work, but FaultCite will not suggest a diagnostic procedure.</p>{!canManage&&<p className="fine-print">Ask a company owner or manager to complete this setup in Manager mode.</p>}</section>;
  return <><div className="knowledge-list">{manuals.map(manual=>{const citations=sources.filter(source=>source.manualId===manual.id);return <article key={manual.id} className="manual-record"><div className="manual-row"><span><FileText /></span><div><small>{manual.manufacturer.toUpperCase()} · {(manual.model || "ALL MODELS").toUpperCase()}</small><h2>{manual.title}</h2><p>{manual.revision ? `Revision ${manual.revision}` : "Revision not recorded"} · {manual.serialApplicability || "Serial applicability not recorded"} · {manual.pageCount ? `${manual.pageCount} PDF pages verified` : "PDF page count not verified"}</p><p className="manual-state">{manual.status==="approved"?citations.length?`${citations.length} exact source ${citations.length===1?"record":"records"} approved`:"Metadata approved · exact-page review pending":manual.status.replaceAll("_"," ")}</p></div><div className="manual-actions"><a className="secondary" href={`/api/manuals/${manual.id}`} target="_blank" rel="noreferrer">Open PDF</a>{canManage&&manual.status!=="approved"&&<button type="button" className="secondary" onClick={()=>review(manual,"approved")}>Approve metadata</button>}{canManage&&manual.status!=="rejected"&&<button type="button" className="secondary" onClick={()=>review(manual,"rejected")}>Reject</button>}</div></div>{citations.length>0&&<div className="approved-source-list">{citations.map(source=><div key={source.id} className="approved-source"><ShieldCheck /><div><strong>{source.sectionTitle} · {source.pageStart===source.pageEnd?`page ${source.pageStart}`:`pages ${source.pageStart}–${source.pageEnd}`}</strong><p>{machines.find(machine=>machine.id===source.machineId)?.asset || `${source.manufacturer} ${source.model}`} · {source.alarmCode?`Alarm ${source.alarmCode}`:"All alarms for this machine"}</p><small>{source.sourceSummary}</small></div></div>)}</div>}{canManage&&manual.status==="approved"&&<SourceApprovalForm manual={manual} machines={machines} onApproved={onSourceApproved} />}</article>})}</div>{message&&<p className="fine-print" role="status">{message}</p>}</>;
}

function SourceApprovalForm({ manual, machines, onApproved }: { manual: ManualRecord; machines: Machine[]; onApproved: (source: ManualSourceRecord) => void }) {
  const [open,setOpen]=useState(false); const [saving,setSaving]=useState(false); const [message,setMessage]=useState("");
  async function approve(event:FormEvent<HTMLFormElement>){event.preventDefault();setSaving(true);setMessage("");const target=event.currentTarget;const form=new FormData(target);const body={machineId:form.get("machineId"),alarmCode:form.get("alarmCode"),sectionTitle:form.get("sectionTitle"),pageStart:Number(form.get("pageStart")),pageEnd:Number(form.get("pageEnd")),sourceSummary:form.get("sourceSummary"),safetyNotes:form.get("safetyNotes"),approvalConfirmed:form.get("approvalConfirmed")==="on"};try{const response=await fetch(`/api/manuals/${manual.id}/sources`,{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(15_000),body:JSON.stringify(body)});const payload=await response.json().catch(()=>null) as {source?:ManualSourceRecord;error?:string}|null;if(!response.ok||!payload?.source)return setMessage(payload?.error||"The reviewed source could not be approved.");onApproved(payload.source);target.reset();setOpen(false);setMessage("Exact pages approved and locked as an immutable source record.");}catch{setMessage("FaultCite could not be reached. The source approval was not confirmed.");}finally{setSaving(false);}}
  return <div className="source-approval"><button type="button" className="secondary" onClick={()=>{setOpen(value=>!value);setMessage("");}} disabled={!machines.length||!manual.pageCount}>{open?"Cancel page review":!manual.pageCount?"Re-upload to verify page count":machines.length?"Approve exact pages":"Register a machine first"}</button>{open&&<form onSubmit={approve}><div className="two-inputs"><div className="field"><label htmlFor={`source-machine-${manual.id}`}>Exact registered machine</label><select id={`source-machine-${manual.id}`} name="machineId" required defaultValue=""><option value="" disabled>Select machine</option>{machines.map(machine=><option key={machine.id} value={machine.id}>{machine.asset} · {machine.manufacturer} {machine.model} · S/N {machine.serial}</option>)}</select></div><div className="field"><label htmlFor={`source-alarm-${manual.id}`}>Alarm code applicability <span>Optional</span></label><input id={`source-alarm-${manual.id}`} name="alarmCode" maxLength={80} placeholder="Example: 401 SERVO ALARM" /></div><div className="field"><label htmlFor={`source-section-${manual.id}`}>Section or procedure title</label><input id={`source-section-${manual.id}`} name="sectionTitle" required maxLength={180} /></div><div className="field"><label htmlFor={`source-start-${manual.id}`}>First PDF page</label><input id={`source-start-${manual.id}`} name="pageStart" type="number" required min="1" max={manual.pageCount||9999} /></div><div className="field"><label htmlFor={`source-end-${manual.id}`}>Last PDF page</label><input id={`source-end-${manual.id}`} name="pageEnd" type="number" required min="1" max={manual.pageCount||9999} /></div></div><div className="field"><label htmlFor={`source-summary-${manual.id}`}>What these pages establish</label><textarea id={`source-summary-${manual.id}`} name="sourceSummary" required maxLength={1600} placeholder="Summarize the source without adding steps that are not on the reviewed pages." /></div><div className="field"><label htmlFor={`source-safety-${manual.id}`}>Safety notes and limits</label><textarea id={`source-safety-${manual.id}`} name="safetyNotes" required maxLength={1200} placeholder="Record warnings, qualifications, lockout requirements, and when to stop." /></div><label className="check"><input name="approvalConfirmed" type="checkbox" required />I reviewed these exact pages against this registered machine. This approval becomes a permanent audit record and cannot be edited.</label><button className="primary" disabled={saving}>{saving?"Approving source…":"Approve and lock source"}</button></form>}{message&&<p className="fine-print" role="status">{message}</p>}</div>;
}
function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) { return <section className="empty-state"><Info /><div><h2>{title}</h2><p>{detail}</p></div>{action && onAction && <button className="secondary" onClick={onAction}>{action}</button>}</section>; }

function ImpactView({cases,machines,manuals,team,workspaceRole}:{cases:CaseRecord[];machines:Machine[];manuals:ManualRecord[];team:TeamMember[];workspaceRole:string}) {
  const closed=cases.filter(item=>item.status==="closed"); const reviewed=manuals.filter(item=>item.status==="approved"); const activeTeam=team.filter(item=>item.active);
  const outcomes=[{label:"Completed repair records",value:String(closed.length),detail:"Closed, read-only company cases"},{label:"Open cases",value:String(cases.filter(item=>activeCaseStatuses.has(item.status)).length),detail:"Current saved workload"},{label:"Registered machines",value:String(machines.length),detail:"Company asset registry"},{label:"Active team members",value:String(activeTeam.length),detail:"Enabled company memberships"}];
  const awaiting=cases.filter(item=>item.status==="review_requested"); const unsafe=cases.filter(item=>item.status==="escalated").length;
  const quality=[{label:"Manual metadata approved",value:`${reviewed.length}/${manuals.length}`,detail:manuals.length?"Page-level indexing is tracked separately":"Upload and approve licensed manuals",tone:manuals.length&&reviewed.length===manuals.length?"success":"warning"},{label:"Cases awaiting review",value:String(awaiting.length),detail:awaiting.length?"Human manager action required":"Manager queue is clear",tone:awaiting.some(item=>caseUrgency(item)==="overdue")?"danger":awaiting.length?"warning":"success"},{label:"Closed-record protection",value:closed.length?"Active":"Ready",detail:"Closed cases are immutable",tone:closed.length?"success":"neutral"},{label:"Unsafe escalations",value:String(unsafe),detail:unsafe?"Manager safety resolution required":"No active escalations",tone:unsafe?"danger":"success"}];
  return <div className="page utility impact-page"><div className="sample-banner sample-permanent"><Info /><strong>Live company counts</strong> — financial savings and downtime reduction stay hidden until a measured baseline exists.</div><div className="utility-title"><span><BarChart3 /></span><div><small className="eyebrow">OPERATIONS & READINESS</small><h1>Operational results</h1><p>Only values calculated from this company’s saved records appear here.</p></div></div><section className="results-heading"><div><span className="eyebrow">CURRENT RECORDS</span><h2>What has FaultCite captured?</h2></div><span>{closed.length} completed {closed.length===1?"case":"cases"}</span></section><section className="outcome-grid">{outcomes.map(m=><article key={m.label}><small>{m.label}</small><strong>{m.value}</strong><p>{m.detail}</p></article>)}</section><PilotMetrics />{workspaceRole==="owner"&&<BillingPanel />}<FeedbackQueue /><section className="results-heading secondary-heading"><div><span className="eyebrow">READINESS</span><h2>What still needs attention?</h2></div><span>Live workspace status</span></section><section className="quality-grid">{quality.map(m=><article key={m.label} data-tone={m.tone}><div><small>{m.label}</small><strong>{m.value}</strong><p>{m.detail}</p></div>{m.tone==="success"?<CheckCircle2 aria-hidden="true"/>:<AlertTriangle aria-hidden="true"/>}<span className="sr-only">{m.tone==="success"?"Healthy":m.tone==="danger"?"Urgent action required":"Needs attention"}</span></article>)}</section><div className="impact-columns"><section className="scope-card"><span className="eyebrow">REGISTERED SCOPE</span><h2>Company machine coverage</h2><p>Coverage comes only from the machines registered in this workspace.</p><ul>{machines.slice(0,5).map(machine=><li key={machine.id}><Check />{machine.manufacturer} {machine.model} · {machine.asset}</li>)}{!machines.length&&<li>No machines registered yet.</li>}</ul></section><section className="scope-card"><span className="eyebrow">CUSTOMER-CONTROLLED KNOWLEDGE</span><h2>Documents stay inside this company</h2><p>{manuals.length} manual records are stored; {reviewed.length} have approved metadata. Diagnostic citation remains locked until page-level indexing is complete.</p></section></div><section className="pilot-gate"><Users /><div><small>ROLLOUT GATE</small><strong>{closed.length ? "Field evidence is being collected" : "Complete the first supervised case"}</strong><p>Broader rollout requires tester access, backup restoration, contracts, insurance, billing tests, and a supervised field pilot.</p></div></section></div>;
}

type BillingState = { configured: boolean; plan: string; status: string; hasCustomer: boolean; hasSubscription: boolean };
function BillingPanel() {
  const [billing,setBilling]=useState<BillingState|null>(null); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const response=await fetch("/api/billing",{cache:"no-store",signal:AbortSignal.timeout(15_000)});const payload=await response.json().catch(()=>null) as (BillingState&{error?:string})|null;if(!response.ok||!payload)throw new Error(payload?.error||"Billing status could not be loaded.");setBilling(payload);}catch(failure){setError(failure instanceof Error&&failure.name!=="TimeoutError"?failure.message:"Billing status did not respond. Try again.");}finally{setLoading(false);}},[]);
  useEffect(()=>{queueMicrotask(()=>void load());},[load]);
  async function openBilling(action:"checkout"|"portal"){setBusy(true);setError("");try{const response=await fetch("/api/billing",{method:"POST",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(15_000),body:JSON.stringify({action})});const payload=await response.json().catch(()=>null) as {url?:string;error?:string}|null;if(!response.ok||!payload?.url)throw new Error(payload?.error||"The secure billing page could not be opened.");const destination=new URL(payload.url);if(destination.protocol!=="https:"||!(destination.hostname==="stripe.com"||destination.hostname.endsWith(".stripe.com")))throw new Error("The billing provider returned an invalid destination.");window.location.assign(destination.toString());}catch(failure){setError(failure instanceof Error&&failure.name!=="TimeoutError"?failure.message:"The billing provider did not respond. Try again.");setBusy(false);}}
  const subscribed=billing&&["active","trialing"].includes(billing.status);
  return <section className="form-card billing-panel" aria-busy={loading}><div className="utility-title"><span><ShieldCheck/></span><div><small className="eyebrow">OWNER BILLING</small><h2>FaultCite subscription</h2><p>Subscription changes open on Stripe’s secure hosted pages. Card details never pass through FaultCite.</p></div></div>{loading?<p role="status">Checking subscription…</p>:error?<div className="timeline-error" role="alert"><strong>Billing unavailable</strong><p>{error}</p><button className="secondary" type="button" onClick={()=>void load()}>Try again</button></div>:billing&&!billing.configured?<div className="billing-state"><strong>Billing connection awaiting setup</strong><p>The app is safely blocking checkout until the production Stripe price, secret key, and signed webhook are configured.</p></div>:billing?<div className="billing-state"><div><small>PLAN</small><strong>{billing.plan.replaceAll("_"," ")}</strong></div><div><small>STATUS</small><strong>{billing.status.replaceAll("_"," ")}</strong></div><button className="primary" type="button" disabled={busy} onClick={()=>void openBilling(subscribed||billing.hasCustomer?"portal":"checkout")}>{busy?"Opening secure billing…":subscribed||billing.hasCustomer?"Manage subscription":"Start subscription"}</button></div>:null}</section>;
}

function FeedbackQueue() {
  const [items,setItems]=useState<FeedbackRecord[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [saving,setSaving]=useState("");
  const load=useCallback(async()=>{setLoading(true);setError("");try{const response=await fetch("/api/feedback",{cache:"no-store",signal:AbortSignal.timeout(15_000)});const payload=await response.json().catch(()=>null) as {feedback?:FeedbackRecord[];error?:string}|null;if(!response.ok||!payload?.feedback)throw new Error(payload?.error||"Feedback queue could not be loaded.");setItems(payload.feedback);}catch(failure){setError(failure instanceof Error&&failure.name!=="TimeoutError"?failure.message:"Feedback queue did not respond. Try again.");}finally{setLoading(false);}},[]);
  useEffect(()=>{queueMicrotask(()=>void load());},[load]);
  async function update(item:FeedbackRecord,status:"in_progress"|"resolved"){const notes=window.prompt(status==="resolved"?"Resolution note (required)":"Assignment or follow-up note (optional)","");if(notes===null)return;setSaving(item.id);setError("");try{const response=await fetch("/api/feedback",{method:"PATCH",headers:{"content-type":"application/json"},signal:AbortSignal.timeout(15_000),body:JSON.stringify({id:item.id,status,resolutionNotes:notes})});const payload=await response.json().catch(()=>null) as {error?:string}|null;if(!response.ok)throw new Error(payload?.error||"Feedback could not be updated.");if(status==="resolved")setItems(current=>current.filter(record=>record.id!==item.id));else setItems(current=>current.map(record=>record.id===item.id?{...record,status}:record));}catch(failure){setError(failure instanceof Error&&failure.name!=="TimeoutError"?failure.message:"Feedback update was not saved. Try again.");}finally{setSaving("");}}
  return <section className="form-card feedback-queue" aria-busy={loading}><div className="utility-title"><span><ClipboardCheck/></span><div><small className="eyebrow">MANAGER FEEDBACK QUEUE</small><h2>Review and resolve pilot submissions</h2><p>Each update is company-scoped and added to the audit trail.</p></div></div>{error&&<div className="timeline-error" role="alert"><strong>Feedback queue unavailable</strong><p>{error}</p><button className="secondary" onClick={()=>void load()}>Try again</button></div>}{loading?<p role="status">Loading feedback…</p>:!items.length?<EmptyState title="Feedback queue is clear" detail="New pilot feedback and support requests will appear here."/>:<ol>{items.map(item=><li key={item.id} data-severity={item.severity}><div><small>{item.category.replaceAll("_"," ")} · {item.severity} · {new Date(item.createdAt).toLocaleString()}</small><strong>{item.caseNumber?`${item.caseNumber} · `:""}{item.contactRequested?"Contact requested":"No contact requested"}</strong><p>{item.message}</p></div><div><button className="secondary" disabled={Boolean(saving)} onClick={()=>void update(item,"in_progress")}>{saving===item.id?"Saving…":"Start work"}</button><button className="primary" disabled={Boolean(saving)} onClick={()=>void update(item,"resolved")}>Resolve</button></div></li>)}</ol>}</section>;
}

type PilotMetricsPayload = { reviewTimeMinutes: { sampleSize: number; median: number | null; p90: number | null }; repeatTechnicians: number; pilotFeedback: { total: number; open: number; supportRequests: number; urgent: number } };
function PilotMetrics() {
  const [data,setData]=useState<PilotMetricsPayload|null>(null); const [failed,setFailed]=useState(false);
  useEffect(()=>{const controller=new AbortController();fetch("/api/reports/operations",{cache:"no-store",signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error("report");return response.json() as Promise<PilotMetricsPayload>}).then(setData).catch(()=>{if(!controller.signal.aborted)setFailed(true)});return()=>controller.abort();},[]);
  if(failed)return <p className="fine-print" role="status">Pilot measures are temporarily unavailable; saved maintenance records are unaffected.</p>;
  if(!data)return <p className="fine-print" role="status">Calculating pilot measures…</p>;
  const reviewDetail=data.reviewTimeMinutes.sampleSize?`${data.reviewTimeMinutes.sampleSize} completed manager reviews`:"No completed manager reviews yet";
  return <><section className="results-heading secondary-heading"><div><span className="eyebrow">PILOT MEASURES</span><h2>Adoption, response, and support</h2></div><span>Saved records only</span></section><section className="outcome-grid"><article><small>Median manager review</small><strong>{data.reviewTimeMinutes.median===null?"—":`${data.reviewTimeMinutes.median}m`}</strong><p>{reviewDetail}</p></article><article><small>90th percentile review</small><strong>{data.reviewTimeMinutes.p90===null?"—":`${data.reviewTimeMinutes.p90}m`}</strong><p>{reviewDetail}</p></article><article><small>Repeat technicians</small><strong>{data.repeatTechnicians}</strong><p>Technicians who opened more than one case</p></article><article><small>Open pilot feedback</small><strong>{data.pilotFeedback.open}</strong><p>{data.pilotFeedback.supportRequests} support requests · {data.pilotFeedback.urgent} urgent</p></article></section></>;
}

function useDialogFocus(close: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  useEffect(() => { closeRef.current = close; }, [close]);
  useEffect(() => {
    const dialog = dialogRef.current;
    const backdrop = dialog?.closest<HTMLElement>(".modal-backdrop");
    const prior = document.activeElement as HTMLElement | null;
    const siblings = backdrop?.parentElement ? Array.from(backdrop.parentElement.children).filter(item => item !== backdrop) as HTMLElement[] : [];
    const previous = siblings.map(element => ({ element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") }));
    siblings.forEach(element => { element.inert = true; element.setAttribute("aria-hidden", "true"); });
    const focusable = () => dialog ? Array.from(dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(element => element.offsetParent !== null) : [];
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); if (!items.length) return event.preventDefault();
      const first = items[0]; const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", key);
    requestAnimationFrame(() => focusable()[0]?.focus());
    return () => {
      document.removeEventListener("keydown", key);
      previous.forEach(({ element, inert, ariaHidden }) => { element.inert = inert; if (ariaHidden === null) element.removeAttribute("aria-hidden"); else element.setAttribute("aria-hidden", ariaHidden); });
      prior?.focus();
    };
  }, []);
  return dialogRef;
}

function SourceModal({ close, machine, alarmCode }: { close: () => void; machine: Machine; alarmCode: string }) {
  const dialogRef = useDialogFocus(close); const [sources,setSources]=useState<ManualSourceRecord[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  useEffect(()=>{const controller=new AbortController();void (async()=>{try{const response=await fetch(`/api/manual-sources?machineId=${encodeURIComponent(machine.id)}&alarmCode=${encodeURIComponent(alarmCode)}`,{cache:"no-store",signal:controller.signal});const payload=await response.json().catch(()=>null) as {sources?:ManualSourceRecord[];error?:string}|null;if(!response.ok)throw new Error(payload?.error||"Approved sources could not be checked.");setSources(payload?.sources||[]);}catch(failure){if(!controller.signal.aborted)setError(failure instanceof Error?failure.message:"Approved sources could not be checked.");}finally{if(!controller.signal.aborted)setLoading(false);}})();return()=>controller.abort();},[alarmCode,machine.id]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><div ref={dialogRef} className="modal source-modal" role="dialog" aria-modal="true" aria-labelledby="source-modal-title" onMouseDown={e => e.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">REVIEWED OEM EVIDENCE</span><h2 id="source-modal-title">Applicable manual sources</h2></div><button onClick={close} aria-label="Close source status"><X /></button></div>{loading?<div className="manual-page" role="status"><p>Checking approved pages for {machine.asset}…</p></div>:error?<div className="error" role="alert">{error}</div>:sources.length?<div className="source-citations">{sources.map(source=><article key={source.id} className="manual-page"><header>{source.manualTitle || "Approved company manual"}{source.manualRevision?` · Revision ${source.manualRevision}`:""}</header><h3>{source.sectionTitle}</h3><div className="source-meta"><span><FileText />{source.pageStart===source.pageEnd?`Page ${source.pageStart}`:`Pages ${source.pageStart}–${source.pageEnd}`}</span><span><Gauge />{machine.asset} · {source.manufacturer} {source.model}</span>{source.alarmCode&&<span><AlertTriangle />Alarm {source.alarmCode}</span>}</div><p>{source.sourceSummary}</p><p className="manual-warning"><ShieldAlert />{source.safetyNotes}</p><a className="secondary" href={`/api/manuals/${source.manualId}#page=${source.pageStart}`} target="_blank" rel="noreferrer">Open reviewed PDF page</a><footer>Manager-approved source · {new Date(source.approvedAt).toLocaleDateString()}</footer></article>)}</div>:<div className="manual-page"><p>No manager-approved page matches this exact registered machine{alarmCode?` and alarm ${alarmCode}`:""}.</p><p className="manual-warning"><AlertTriangle />FaultCite will not invent a procedure, expected result, likely cause, or citation. Use the correct OEM documentation and your employer&apos;s safety program.</p></div>}<button className="primary full" onClick={close}>Return to case</button></div></div>;
}
function SearchModal({ close, machines, openMachine }: { close: () => void; machines: Machine[]; openMachine: (id: string) => void }) { const [query,setQuery]=useState(""); const dialogRef = useDialogFocus(close); const results=machines.filter(machine=>`${machine.asset} ${machine.manufacturer} ${machine.model} ${machine.location}`.toLowerCase().includes(query.toLowerCase())).slice(0,5); return <div className="modal-backdrop" role="presentation" onMouseDown={close}><div ref={dialogRef} className="modal search-modal" role="dialog" aria-modal="true" aria-labelledby="search-modal-title" onMouseDown={e => e.stopPropagation()}><h2 id="search-modal-title" className="sr-only">Search company machines</h2><div className="search-box"><Search /><input aria-label="Search company machines" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search company machines…" /><button onClick={close} aria-label="Close search"><X /></button></div><small className="eyebrow">{query ? "MATCHING MACHINES" : "REGISTERED MACHINES"}</small>{results.map(machine=><button key={machine.id} className="search-result" onClick={()=>openMachine(machine.id)}><span className="machine-image">{machine.image}</span><div><strong>{machine.asset} · {machine.manufacturer} {machine.model}</strong><p>{machine.location}</p></div><ChevronRight /></button>)}{!results.length&&<EmptyState title="No machine found" detail="Try an asset number, manufacturer, model, or location." />}</div></div>; }
