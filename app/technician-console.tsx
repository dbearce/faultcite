"use client";

import "./impact.css";

import {
  Activity, AlertTriangle, ArrowLeft, BookOpen, Camera, Check, CheckCircle2,
  ChevronRight, CircleUserRound, ClipboardCheck, FileText, Gauge,
  HardHat, Home, Info, LockKeyhole, Menu, Mic, QrCode, Search, ShieldAlert,
  Upload, Wifi, X, BarChart3, Users, Wrench,
  ShieldCheck, Library, UserCog, CloudOff,
  MapPin, Radio, ChevronDown,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { LegalLinks } from "./legal-links";

type View = "home" | "intake" | "analysis" | "verify" | "complete" | "cases" | "machines" | "knowledge" | "impact" | "history";
type Machine = {
  id: string; asset: string; manufacturer: string; model: string; serial: string;
  control: string; location: string; status: "down" | "attention" | "running"; image: string;
};
type CaseRecord = { id: string; caseNumber: string; machineId: string; status: string; symptom: string; alarmCode: string | null; openedAt: string | number; updatedAt: string | number; confirmedCause?: string | null; repairSummary?: string | null; partsUsed?: string | null; verificationReadings?: string | null; testCycles?: string | null; repairType?: string | null; closedAt?: string | number | null };
type ManualRecord = { id: string; title: string; manufacturer: string; model: string | null; revision: string | null; serialApplicability: string | null; status: string };
type CaseEventRecord = { id: string; eventType: string; result: string | null; reading: string | null; notes: string | null; createdAt: string | number };
type EvidenceRecord = { id: string; kind: string; fileName: string; contentType: string; sizeBytes: number; createdAt: string | number };
type TeamMember = { id: string; role: string; active: boolean; userId: string; email: string; displayName: string };
type Invitation = { id: string; email: string; role: string; status: string; expiresAt?: string | number | null };
type CompanyWorkspace = { id: string; name: string; role: string };
type WorkspacePayload = { user: { role: string }; organization: { id: string; name: string }; workspaces: CompanyWorkspace[]; machines: Array<{ id: string; assetNumber: string; manufacturer: string; model: string; serialNumber: string | null; control: string | null; location: string | null; status: string }>; cases: CaseRecord[]; manuals: ManualRecord[]; team: TeamMember[]; invitations: Invitation[] };
type Result = "Supports suspected cause" | "Does not support suspected cause" | "Unable to test" | "Unsafe — escalate";
type Role = "technician" | "manager";

const symptoms = ["Will not cycle", "Axis problem", "Spindle problem", "Tool changer problem", "Turret problem", "Hydraulic problem", "Intermittent problem", "Crash"];
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
  return <div className="logo"><span><BrandMark /></span><div><strong>FAULTCITE</strong><small>Technician Console</small></div></div>;
}

function Status({ value }: { value: Machine["status"] }) {
  const text = value === "down" ? "Machine down" : value === "attention" ? "Attention" : "Running";
  return <span className={`status status-${value}`}><i />{text}</span>;
}

function Progress({ step }: { step: 1 | 2 | 3 }) {
  return <div className="progress" aria-label={`Step ${step} of 3`}>
    {["Capture failure", "Review diagnostic", "Verify repair"].map((label, index) => (
      <div className={index + 1 <= step ? "progress-item active" : "progress-item"} key={label}>
        <span>{index + 1 < step ? <Check /> : index + 1}</span><b>{label}</b>
      </div>
    ))}
  </div>;
}

export function TechnicianConsole({ signedInName, version, environment }: { signedInName: string; version: string; environment: string }) {
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
  const [result, setResult] = useState<Result | null>(null);
  const [resultSaved, setResultSaved] = useState(false);
  const [reading, setReading] = useState("");
  const [sourceOpen, setSourceOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [alarmPhoto, setAlarmPhoto] = useState<File | null>(null);
  const [checkNumber, setCheckNumber] = useState(2);
  const [causeConfirmed, setCauseConfirmed] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState("");
  const [caseNumber, setCaseNumber] = useState("");
  const [online, setOnline] = useState(true);
  const [workspaceRole, setWorkspaceRole] = useState("technician");
  const [resultSaving, setResultSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [caseRecords, setCaseRecords] = useState<CaseRecord[]>([]);
  const [manualRecords, setManualRecords] = useState<ManualRecord[]>([]);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [caseEvents, setCaseEvents] = useState<CaseEventRecord[]>([]);
  const [evidence, setEvidence] = useState<EvidenceRecord[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [workspaces, setWorkspaces] = useState<CompanyWorkspace[]>([]);
  const [switchingWorkspace, setSwitchingWorkspace] = useState(false);
  const [historyCase, setHistoryCase] = useState<CaseRecord | null>(null);
  const [completedRepairType, setCompletedRepairType] = useState<"Permanent" | "Temporary">("Permanent");
  const diagnosticRequestKey = useRef(crypto.randomUUID());
  const mainRef = useRef<HTMLElement>(null);
  const selectedMachine = useMemo(() => machines.find((m) => m.id === machineId), [machineId, machines]);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);
    fetch("/api/bootstrap", { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then((payload: WorkspacePayload | null) => {
        if (!payload) throw new Error("Workspace unavailable");
        setWorkspaceRole(payload.user.role);
        if (payload.user.role === "owner" || payload.user.role === "manager") setRole("manager");
        setOrganizationId(payload.organization.id);
        setWorkspaces(payload.workspaces || []);
        setMachines(payload.machines.map(machine => ({ id: machine.id, asset: machine.assetNumber, manufacturer: machine.manufacturer, model: machine.model, serial: machine.serialNumber || "Not recorded", control: machine.control || "Not recorded", location: machine.location || "Location not recorded", status: (["down", "attention", "running"].includes(machine.status) ? machine.status : "attention") as Machine["status"], image: `${machine.manufacturer[0] || "C"}${machine.model[0] || "M"}`.toUpperCase() })));
        setCaseRecords(payload.cases);
        setManualRecords(payload.manuals);
        setTeam(payload.team || []); setInvitations(payload.invitations || []);
      })
      .catch(() => setWorkspaceError("Your company workspace could not be loaded. Refresh to try again."))
      .finally(() => setWorkspaceLoading(false));
    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  const canManage = workspaceRole === "owner" || workspaceRole === "manager";

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view, role]);

  async function switchWorkspace(nextOrganizationId: string) {
    if (!nextOrganizationId || nextOrganizationId === organizationId || switchingWorkspace) return;
    if (!online) { setWorkspaceError("Reconnect before changing company workspaces."); return; }
    setSwitchingWorkspace(true); setWorkspaceError("");
    const response = await fetch("/api/bootstrap", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ organizationId: nextOrganizationId }) });
    if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; setWorkspaceError(payload?.error || "Company workspace could not be changed."); setSwitchingWorkspace(false); return; }
    window.location.reload();
  }

  function startCase(id = "") {
    const active = id ? caseRecords.find(record => record.machineId === id && !["closed", "escalated"].includes(record.status)) : undefined;
    if (active) { resumeCase(active); return; }
    setMachineId(id); setConfirmed(false); setSymptom(""); setAlarm(""); setChanged(""); setNotes("");
    setResult(null); setResultSaved(false); setReading(""); setError(""); setView("intake");
    setCheckNumber(1); setCauseConfirmed(false); setAlarmPhoto(null); setCaseEvents([]); setEvidence([]); setActiveCaseId(""); setCaseNumber("");
  }

  function resumeCase(record: CaseRecord) {
    if (record.status === "closed") {
      setHistoryCase(record); setMachineId(record.machineId); setActiveCaseId(record.id); setCaseNumber(record.caseNumber); setError(""); setView("history");
      fetch(`/api/cases/${record.id}/events`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(payload => setCaseEvents(payload?.events || [])).catch(() => setError("The saved case timeline could not be loaded."));
      fetch(`/api/cases/${record.id}/evidence`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(payload => setEvidence(payload?.evidence || [])).catch(() => setError("The saved evidence could not be loaded."));
      return;
    }
    if (record.status === "escalated") { setError(`${record.caseNumber} is escalated and remains available for manager review.`); setView("cases"); return; }
    setMachineId(record.machineId); setActiveCaseId(record.id); setCaseNumber(record.caseNumber);
    setSymptom(record.symptom); setAlarm(record.alarmCode || "No alarm"); setResult(null); setResultSaved(false);
    setCauseConfirmed(record.status === "cause_confirmed"); setView(record.status === "cause_confirmed" ? "verify" : "analysis");
    fetch(`/api/cases/${record.id}/events`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(payload => { const events = (payload?.events || []) as CaseEventRecord[]; setCaseEvents(events); const last = [...events].reverse().find(item => item.eventType === "diagnostic_result"); if (last?.result) { setResult(last.result as Result); setReading(last.reading || ""); setResultSaved(true); } }).catch(() => setError("The saved case timeline could not be loaded."));
    fetch(`/api/cases/${record.id}/evidence`, { cache: "no-store" }).then(response => response.ok ? response.json() : null).then(payload => setEvidence(payload?.evidence || [])).catch(() => setError("The saved evidence could not be loaded."));
  }

  async function uploadEvidence(file: File) {
    if (!activeCaseId) return;
    if (!online) throw new Error("Reconnect before uploading evidence.");
    const form = new FormData(); form.set("file", file); form.set("kind", "alarm_screen");
    const upload = await fetch(`/api/cases/${activeCaseId}/evidence`, { method: "POST", body: form });
    if (!upload.ok) throw new Error("The case is saved, but the photo upload failed. Retry it from this case.");
    const payload = await upload.json() as { evidence: EvidenceRecord }; setEvidence(current => [payload.evidence, ...current]); setAlarmPhoto(null);
  }

  async function submitIntake(event: FormEvent) {
    event.preventDefault();
    if (!selectedMachine) return setError("Select a machine before continuing.");
    if (!confirmed) return setError("Confirm the asset, model, serial number, control, and location.");
    if (!symptom) return setError("Select what the machine is failing to do.");
    if (!alarm.trim()) return setError("Enter the alarm code or type “No alarm.”");
    if (!online) return setError("Reconnect before creating the case.");
    setError(""); setAnalyzing(true);
    try {
      const caseResponse = await fetch("/api/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ machineId: selectedMachine.id, symptom, alarmCode: alarm, precedingChange: changed, notes }) });
      if (!caseResponse.ok) throw new Error("The case could not be saved. Check your connection and try again.");
      const saved = await caseResponse.json() as { case: CaseRecord }; setActiveCaseId(saved.case.id); setCaseNumber(saved.case.caseNumber); setCaseRecords(current => [saved.case, ...current]); setMachines(current => current.map(machine => machine.id === selectedMachine.id ? { ...machine, status: "down" } : machine));
      if (alarmPhoto) { const form = new FormData(); form.set("file", alarmPhoto); form.set("kind", "alarm_screen"); const upload = await fetch(`/api/cases/${saved.case.id}/evidence`, { method: "POST", body: form }); if (upload.ok) { const payload = await upload.json() as { evidence: EvidenceRecord }; setEvidence([payload.evidence]); setAlarmPhoto(null); } else setError("The case is saved, but the photo upload failed. Retry it below."); }
      const timeline = await fetch(`/api/cases/${saved.case.id}/events`, { cache: "no-store" }); if (timeline.ok) setCaseEvents(((await timeline.json()) as {events: CaseEventRecord[]}).events);
      setAnalyzing(false); setView("analysis");
    } catch (failure) {
      setAnalyzing(false); setError(failure instanceof Error ? failure.message : "The case could not be saved.");
    }
  }

  async function saveResult() {
    if (!result || resultSaving) return;
    if (!activeCaseId) { setError("This case has not been saved."); return; }
    if (!online) { setError("Reconnect before saving the observation."); return; }
    setResultSaving(true);
    try {
      const response = await fetch(`/api/cases/${activeCaseId}/events`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ result, reading, checkNumber, idempotencyKey: diagnosticRequestKey.current }) });
      if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; setError(payload?.error || "The diagnostic result could not be saved."); return; }
      const payload = await response.json() as { status?: string };
      setResultSaved(true); setCauseConfirmed(false); setError("");
      if (payload.status) setCaseRecords(current => current.map(item => item.id === activeCaseId ? { ...item, status: payload.status!, updatedAt: Date.now() } : item));
      diagnosticRequestKey.current = crypto.randomUUID();
      setAnnouncement(`${result} recorded for diagnostic check ${checkNumber}.`);
      const timeline = await fetch(`/api/cases/${activeCaseId}/events`, { cache: "no-store" }); if (timeline.ok) setCaseEvents(((await timeline.json()) as {events: CaseEventRecord[]}).events);
    } finally { setResultSaving(false); }
  }

  function continueDiagnosis() {
    diagnosticRequestKey.current = crypto.randomUUID(); setCheckNumber(n => Math.min(n + 1, 5)); setResult(null); setResultSaved(false); setReading("");
  }

  async function confirmCause() {
    if (!activeCaseId || result !== "Supports suspected cause" || !reading.trim()) { setError("Record an observation supporting the suspected cause before manager confirmation."); return; }
    if (!online) { setError("Reconnect before confirming the cause."); return; }
    const response = await fetch(`/api/cases/${activeCaseId}/confirm-cause`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: reading }) });
    if (!response.ok) { const payload=await response.json().catch(()=>null) as {error?:string}|null; setError(payload?.error || "The cause could not be confirmed."); return; }
    setCauseConfirmed(true); setError(""); setAnnouncement("Cause confirmed by the authenticated manager.");
    const timeline = await fetch(`/api/cases/${activeCaseId}/events`, { cache: "no-store" }); if (timeline.ok) setCaseEvents(((await timeline.json()) as {events: CaseEventRecord[]}).events);
  }

  async function requestReview() {
    if (!activeCaseId) return;
    if (!online) { setError("Reconnect before requesting manager review."); return; }
    const response = await fetch(`/api/cases/${activeCaseId}/request-review`, { method: "POST" });
    if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; setError(payload?.error || "Manager review could not be requested."); return; }
    setCaseRecords(current => current.map(item => item.id === activeCaseId ? { ...item, status: "review_requested", updatedAt: Date.now() } : item)); setAnnouncement("Manager review requested and saved.");
    const timeline = await fetch(`/api/cases/${activeCaseId}/events`, { cache: "no-store" }); if (timeline.ok) setCaseEvents(((await timeline.json()) as {events: CaseEventRecord[]}).events);
  }

  return <div className="shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <aside className={menu ? "sidebar sidebar-open" : "sidebar"}>
      <button className="close-menu" onClick={() => setMenu(false)} aria-label="Close navigation"><X /></button>
      <Logo />
      <div className="role-switch" aria-label="Choose workspace"><button className={role === "technician" ? "active" : ""} onClick={() => { setRole("technician"); setView("home"); }}><Wrench />Tech</button>{canManage && <button className={role === "manager" ? "active" : ""} onClick={() => { setRole("manager"); setView("impact"); }}><UserCog />Manager</button>}</div>
      <nav aria-label="Primary navigation">
        {(role === "technician" ? technicianNav : managerNav).map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? "nav-active" : ""} onClick={() => { setView(id); setMenu(false); }}><Icon />{label}{id === "cases" && caseRecords.filter(item => role === "manager" ? item.status === "review_requested" : item.status !== "closed").length > 0 && <em>{caseRecords.filter(item => role === "manager" ? item.status === "review_requested" : item.status !== "closed").length}</em>}</button>)}
      </nav>
      <div className="sidebar-foot">
        <div className={online ? "online" : "online offline"}>{online ? <i /> : <CloudOff />}{online ? "Connected · saved actions are confirmed individually" : "Offline · saving unavailable"}<small>Controlled pilot</small></div>
        <div className="profile"><CircleUserRound /><span><strong>{signedInName}</strong><small>{role === "technician" ? "Maintenance technician" : "Manager workspace"}</small><small>v{version} · {environment}</small></span></div>
      </div>
    </aside>
    {menu && <button className="scrim" onClick={() => setMenu(false)} aria-label="Close navigation" />}
    <main id="main-content" ref={mainRef} tabIndex={-1}>
      <header className="topbar">
        <button className="menu" onClick={() => setMenu(true)} aria-label="Open navigation"><Menu /></button>
        <div className="mobile-logo"><Logo /></div>
        <div className="top-actions">
          {workspaces.length > 1 && <label className="workspace-picker"><span className="sr-only">Company workspace</span><select aria-label="Company workspace" value={organizationId} disabled={switchingWorkspace || !online} onChange={event => switchWorkspace(event.target.value)}>{workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.role}</option>)}</select><ChevronDown /></label>}
          <button className="search" onClick={() => setSearchOpen(true)} aria-label="Search"><Search /></button>
          <button className="down-button" onClick={() => startCase()}><AlertTriangle />Machine Down</button>
        </div>
      </header>

      {!online && <div className="offline-banner" role="status"><CloudOff />No connection. You can review this screen, but saving is unavailable until service returns.</div>}
      {workspaceError && <div className="offline-banner" role="alert"><AlertTriangle />{workspaceError}<button type="button" onClick={() => window.location.reload()}>Retry</button></div>}
      {view === "home" && (workspaceLoading ? <WorkspaceLoading /> : role === "technician" ? <HomeView signedInName={signedInName} online={online} startCase={startCase} go={setView} machines={machines} cases={caseRecords} loading={false} resumeCase={resumeCase} /> : <ManagerOperations go={setView} machines={machines} cases={caseRecords} manuals={manualRecords} />)}
      {view === "intake" && <IntakeView {...{ selectedMachine, machineId, setMachineId, machines, confirmed, setConfirmed, symptom, setSymptom, alarm, setAlarm, changed, setChanged, notes, setNotes, error, submitIntake, alarmPhoto, setAlarmPhoto }} back={() => setView("home")} />}
      {view === "analysis" && selectedMachine && <AnalysisView machine={selectedMachine} symptom={symptom} alarm={alarm} analyzing={analyzing} result={result} setResult={setResult} resultSaved={resultSaved} resultSaving={resultSaving} reading={reading} setReading={setReading} saveResult={saveResult} confirmCause={confirmCause} requestReview={requestReview} canApprove={canManage} online={online} openSource={() => setSourceOpen(true)} back={() => setView("cases")} verify={() => setView("verify")} checkNumber={checkNumber} causeConfirmed={causeConfirmed} continueDiagnosis={continueDiagnosis} caseNumber={caseNumber} error={error} signedInName={signedInName} events={caseEvents} evidence={evidence} retryPhoto={uploadEvidence} />}
      {view === "verify" && selectedMachine && <VerificationView machine={selectedMachine} result={result} caseId={activeCaseId} signedInName={signedInName} canApprove={canManage} online={online} back={() => setView("analysis")} complete={(repairType) => { setCompletedRepairType(repairType === "Temporary" ? "Temporary" : "Permanent"); setCaseRecords(current => current.map(item => item.id === activeCaseId ? { ...item, status: "closed", repairType, updatedAt: Date.now() } : item)); setMachines(current => current.map(item => item.id === machineId ? { ...item, status: repairType === "Temporary" ? "attention" : "running" } : item)); setView("complete"); }} />}
      {view === "complete" && selectedMachine && <CompleteView machine={selectedMachine} caseNumber={caseNumber} signedInName={signedInName} repairType={completedRepairType} start={() => startCase()} home={() => setView("home")} />}
      {view === "cases" && <UtilityView title={role === "manager" ? "Review queue & team" : "Cases"} eyebrow={`${caseRecords.filter(item => item.status !== "closed").length} ACTIVE`} icon={<Activity />}>{role === "manager" && <><ReviewQueue cases={caseRecords} machines={machines} open={resumeCase} /><TeamPanel team={team} invitations={invitations} online={online} onInvited={invite => setInvitations(current => [invite, ...current.filter(item => item.email !== invite.email)])} /></>}{error && <div className="error"><AlertTriangle />{error}</div>}{caseRecords.length ? caseRecords.map(record => <CaseRow key={record.id} record={record} machine={machines.find(machine => machine.id === record.machineId)} onClick={() => resumeCase(record)} />) : <EmptyState title="No cases yet" detail="Start a Machine Down case when an asset needs attention." action="Start Machine Down case" onAction={() => startCase()} />}</UtilityView>}
      {view === "machines" && <UtilityView title="Machine registry" eyebrow={`${machines.length} ASSETS`} icon={<Gauge />}>{canManage && <MachineAdmin online={online} onSaved={machine => setMachines(current => [...current, machine])} />}{machines.length ? <div className="registry">{machines.map(m => <MachineCard key={m.id} machine={m} onClick={() => startCase(m.id)} />)}</div> : <EmptyState title="No machines registered" detail={canManage ? "Add company machines before technicians begin a case." : "Ask a manager to add the first company machine."} />}</UtilityView>}
      {view === "history" && historyCase && <CaseHistory record={historyCase} machine={machines.find(item => item.id === historyCase.machineId)} events={caseEvents} evidence={evidence} back={() => setView("cases")} />}
      {view === "knowledge" && <UtilityView title="Company manuals" eyebrow={`${manualRecords.length} DOCUMENTS`} icon={<BookOpen />}><KnowledgeList manuals={manualRecords} /></UtilityView>}
      {view === "impact" && <ImpactView />}
      <LegalLinks version={version} environment={environment} />
    </main>
    {sourceOpen && <SourceModal close={() => setSourceOpen(false)} />}
    {searchOpen && <SearchModal close={() => setSearchOpen(false)} machines={machines} openMachine={(id) => { setSearchOpen(false); startCase(id); }} />}
    {role === "technician" && <MobileNav view={view} go={setView} startCase={startCase} />}
    <div className="sr-only" aria-live="polite">{announcement}</div>
  </div>;
}

function HomeView({ signedInName, online, startCase, go, machines, cases, loading, resumeCase }: { signedInName: string; online: boolean; startCase: (id?: string) => void; go: (v: View) => void; machines: Machine[]; cases: CaseRecord[]; loading: boolean; resumeCase: (record: CaseRecord) => void }) {
  const active = [...cases].filter(record => !["closed", "escalated"].includes(record.status)).sort((a,b) => new Date(b.updatedAt).valueOf() - new Date(a.updatedAt).valueOf())[0];
  const activeMachine = active ? machines.find(machine => machine.id === active.machineId) : undefined;
  return <div className="page">
    <div className="sample-banner pilot-banner" role="note"><Info /><span><strong>Controlled pilot</strong> Company records are live. Diagnostic guidance appears only when an applicable manual page is reviewed.</span></div>
    <section className="welcome"><div><span className="eyebrow">TECHNICIAN WORKSPACE</span><h1>Good afternoon, {signedInName.split(" ")[0]}.</h1><p>Build a safe, permanent repair record.</p></div><div className={online ? "sync-state" : "sync-state is-offline"}>{online ? <Wifi /> : <CloudOff />}<span><small>CONNECTION</small><strong>{online ? "Online · saves confirmed per action" : "Saving unavailable"}</strong></span></div></section>
    {loading ? <section className="resume-card"><div><span className="eyebrow">LOADING WORKSPACE</span><h2>Checking saved company work…</h2></div></section> : active && activeMachine ? <section className="resume-card"><div><span className="eyebrow red">ACTIVE CASE · {active.status.replaceAll("_", " ").toUpperCase()}</span><h2>Resume {activeMachine.asset} diagnosis</h2><p>{activeMachine.manufacturer} {activeMachine.model} · {active.alarmCode || "No alarm"} · {active.caseNumber}</p></div><button onClick={() => resumeCase(active)}>Resume case <ChevronRight /></button></section> : <section className="resume-card"><div><span className="eyebrow">NO ACTIVE CASE</span><h2>Your saved work is clear</h2><p>Start a case when a registered machine needs attention.</p></div></section>}
    <section className="home-action-grid"><button className="home-primary-action" onClick={() => startCase()}><AlertTriangle /><span><small>URGENT ACTION</small><strong>Start Machine Down case</strong><p>Identify the machine and capture the failure.</p></span><ChevronRight /></button><button onClick={() => startCase()}><QrCode /><span><strong>Select machine</strong><small>{machines.length} registered assets</small></span><ChevronRight /></button><button onClick={() => go("cases")}><ClipboardCheck /><span><strong>Open cases</strong><small>{cases.filter(item => item.status !== "closed").length} active</small></span><ChevronRight /></button><button onClick={() => go("knowledge")}><BookOpen /><span><strong>Manuals & repairs</strong><small>Company documents and history</small></span><ChevronRight /></button></section>
    <section className="section-heading"><div><span className="eyebrow">PRIORITIZED WORK</span><h2>What needs attention</h2></div><button onClick={() => go("machines")}>View all <ChevronRight /></button></section>
    <div className="machine-list">{machines.filter(m => m.status !== "running").map(m => <MachineCard key={m.id} machine={m} onClick={() => startCase(m.id)} />)}{!loading && !machines.some(m => m.status !== "running") && <EmptyState title="No machines need attention" detail="Registered machines marked Down or Attention will appear here." />}</div>
  </div>;
}

function ManagerOperations({ go, machines, cases, manuals }: { go: (v: View) => void; machines: Machine[]; cases: CaseRecord[]; manuals: ManualRecord[] }) { const open=cases.filter(item=>item.status!=="closed"); const verified=manuals.filter(item=>item.status==="approved"); return <div className="page"><div className="welcome manager-welcome"><div><span className="eyebrow">OPERATIONS OVERVIEW</span><h1>Maintenance operations</h1><p>Current saved assets, cases, and document readiness.</p></div><a className="secondary export-action" href="/api/export" download><FileText />Export company records</a></div><section className="manager-summary" aria-label="Current operations summary"><article><small>Machines down</small><strong>{machines.filter(m=>m.status==="down").length}</strong><span className="red-text">Saved asset status</span></article><article><small>Open cases</small><strong>{open.length}</strong><span>Saved company cases</span></article><article><small>Needs attention</small><strong>{machines.filter(m=>m.status==="attention").length}</strong><span className="amber-text">Temporary or follow-up work</span></article><article><small>Approved manuals</small><strong>{verified.length}/{manuals.length}</strong><span>Company document library</span></article></section><button className="impact-callout" onClick={() => go("impact")}><span><BarChart3 /></span><div><small>PILOT MEASUREMENT</small><strong>Set up Results tracking</strong><p>Review what will be measured after enough completed cases establish a baseline.</p></div><ChevronRight /></button></div>; }

function WorkspaceLoading() { return <div className="page" role="status" aria-live="polite"><section className="loading-state"><span className="loading-spinner" aria-hidden="true" /><div><span className="eyebrow">LOADING WORKSPACE</span><h1>Preparing company records…</h1><p>Checking machines, cases, team access, and manuals.</p></div></section></div>; }

function MachineCard({ machine, onClick }: { machine: Machine; onClick: () => void }) {
  return <button className="machine-card" onClick={onClick}><span className="machine-image">{machine.image}</span><div><div className="machine-line"><small>{machine.asset}</small><Status value={machine.status} /></div><h3>{machine.manufacturer} {machine.model}</h3><p>{machine.location} · {machine.control}</p></div><ChevronRight /></button>;
}

type IntakeProps = {
  selectedMachine?: Machine; machines: Machine[]; machineId: string; setMachineId: (v: string) => void; confirmed: boolean; setConfirmed: (v: boolean) => void;
  symptom: string; setSymptom: (v: string) => void; alarm: string; setAlarm: (v: string) => void; changed: string; setChanged: (v: string) => void;
  notes: string; setNotes: (v: string) => void; error: string; submitIntake: (e: FormEvent) => void; back: () => void;
  alarmPhoto: File | null; setAlarmPhoto: (v: File | null) => void;
};

function IntakeView(p: IntakeProps) {
  const alarmPhotoRef = useRef<HTMLInputElement>(null);
  return <div className="page focused">
    <button className="back" onClick={p.back}><ArrowLeft />Back to home</button>
    <div className="flow-title"><span className="eyebrow red">MACHINE DOWN · STEP 1 OF 3</span><h1>Capture the failure</h1><p>Confirm the machine first. Only essential downtime information is required.</p></div>
    <Progress step={1} />
    <form className="flow-layout" onSubmit={p.submitIntake}>
      <section className="form-card">
        <button className="scan-primary" type="button" disabled title="Machine-tag scanning is not enabled in this controlled pilot"><QrCode /><span><strong>Scan machine tag</strong><small>Not available in this controlled pilot</small></span><ChevronRight /></button>
        <div className="field"><label htmlFor="machine">Or select machine <b>Required</b></label><select id="machine" value={p.machineId} onChange={e => { p.setMachineId(e.target.value); p.setConfirmed(false); }}><option value="">Choose an asset…</option>{p.machines.map(m => <option value={m.id} key={m.id}>{m.asset} · {m.manufacturer} {m.model}</option>)}</select>{!p.machines.length && <small>No machines are registered. A manager must add one before a case can be opened.</small>}</div>
        {p.selectedMachine && <div className="confirm-machine"><div className="confirm-head"><span className="machine-image large">{p.selectedMachine.image}</span><div><span className="eyebrow">VERIFY ASSET</span><h2>{p.selectedMachine.asset} · {p.selectedMachine.manufacturer} {p.selectedMachine.model}</h2><p>Compare this record with the machine nameplate before continuing.</p></div></div><dl><div><dt>Serial number</dt><dd>{p.selectedMachine.serial}</dd></div><div><dt>CNC control</dt><dd>{p.selectedMachine.control}</dd></div><div><dt>Location</dt><dd>{p.selectedMachine.location}</dd></div><div><dt>Status</dt><dd><Status value={p.selectedMachine.status} /></dd></div></dl><label className={p.confirmed ? "confirm-check checked" : "confirm-check"}><input type="checkbox" checked={p.confirmed} onChange={e => p.setConfirmed(e.target.checked)} /><span><Check /></span>I confirmed the asset, model, serial, control, and location.</label></div>}
        <fieldset><legend>What is the machine failing to do? <b>Required</b></legend><div className="symptoms">{symptoms.map(s => <button type="button" key={s} className={p.symptom === s ? "selected" : ""} onClick={() => p.setSymptom(s)}>{s}{p.symptom === s && <CheckCircle2 />}</button>)}</div></fieldset>
        <div className="two-fields"><div className="field"><label htmlFor="alarm">Alarm code <b>Required</b></label><input id="alarm" value={p.alarm} onChange={e => p.setAlarm(e.target.value)} placeholder="Example: 2041" inputMode="text" autoCapitalize="characters" /></div><button className="secondary" type="button" onClick={() => p.setAlarm("No alarm")}>No alarm</button><input ref={alarmPhotoRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={event => p.setAlarmPhoto(event.target.files?.[0] || null)} aria-label="Take a photo of the alarm screen" /><button className={p.alarmPhoto ? "secondary success" : "secondary"} type="button" onClick={() => alarmPhotoRef.current?.click()}><Camera />{p.alarmPhoto ? "Photo selected · saves with case" : "Capture screen"}</button></div>
        <div className="field"><label htmlFor="changed">What changed immediately before it failed?</label><input id="changed" value={p.changed} onChange={e => p.setChanged(e.target.value)} placeholder="Crash, setup change, outage, maintenance, nothing known…" /></div>
        <div className="field"><label htmlFor="notes">Quick notes <span>Optional</span></label><textarea id="notes" value={p.notes} onChange={e => p.setNotes(e.target.value)} placeholder="What did the operator see or hear?" /><button className="voice" type="button" disabled title="Voice notes are not enabled in this controlled pilot"><Mic />Voice notes coming after pilot validation</button></div>
        {p.error && <div className="error"><AlertTriangle />{p.error}</div>}
      </section>
      <aside className="flow-aside"><div className="safety"><ShieldAlert /><div><strong>Safety comes first</strong><p>Stop if energy state, machine identity, or authorization is uncertain. Follow the employer’s LOTO procedure.</p></div></div><div className="summary-card"><span className="eyebrow">BEFORE YOU CONTINUE</span><ul><li className={p.selectedMachine ? "done" : ""}>Machine selected</li><li className={p.confirmed ? "done" : ""}>Identity confirmed</li><li className={p.symptom ? "done" : ""}>Symptom captured</li><li className={p.alarm ? "done" : ""}>Alarm status recorded</li></ul></div><button className="primary" type="submit">Create case & open record</button><small className="fine-print">A qualified technician must verify every observation.</small></aside>
    </form>
  </div>;
}

type AnalysisProps = { machine: Machine; symptom: string; alarm: string; analyzing: boolean; result: Result | null; setResult: (r: Result) => void; resultSaved: boolean; resultSaving: boolean; reading: string; setReading: (v: string) => void; saveResult: () => Promise<void>; confirmCause: () => Promise<void>; requestReview: () => Promise<void>; canApprove: boolean; online: boolean; openSource: () => void; back: () => void; verify: () => void; checkNumber: number; causeConfirmed: boolean; continueDiagnosis: () => void; caseNumber: string; error: string; signedInName: string; events: CaseEventRecord[]; evidence: EvidenceRecord[]; retryPhoto: (file: File) => Promise<void> };

function AnalysisView(p: AnalysisProps) {
  if (p.analyzing) return <div className="page focused"><div className="analyzing"><span><BrandMark /></span><h1>Saving the case</h1><p>Creating the saved company repair record.</p></div></div>;
  return <div className="page focused">
    <button className="back" onClick={p.back}><ArrowLeft />Back to saved cases</button>
    <div className="case-title"><div><span className="eyebrow red">ACTIVE BREAKDOWN · {p.caseNumber || "SAVED CASE"}</span><h1>{p.machine.asset} · {p.symptom}</h1><p>{p.machine.manufacturer} {p.machine.model} · Alarm {p.alarm}</p></div><Status value="down" /></div>
    <Progress step={2} />
    <div className="machine-strip"><span className="machine-image">{p.machine.image}</span><div className="machine-strip-identity"><small>CONFIRMED MACHINE</small><strong>{p.machine.asset} · {p.machine.manufacturer} {p.machine.model}</strong><p>S/N {p.machine.serial} · {p.machine.control}</p></div><div className="machine-strip-facts"><span><MapPin />{p.machine.location}</span><span><Radio />{p.caseNumber}</span></div><Status value="down" /><span className="sync-pill"><Check /> Saved case</span></div>
    <div className="stop-banner" role="note" aria-label="Required safety boundary"><ShieldAlert /><div><strong>Use the employer-approved safe state and LOTO procedure.</strong><p>Stop if machine identity, authorization, or energy state is uncertain. Never bypass interlocks or force outputs.</p></div></div>
    <div className="analysis-layout"><section className="analysis-main">
      <article className="check-card current-check"><div className="check-label"><span>TECHNICIAN OBSERVATION {p.checkNumber}</span><b>CITE-OR-REFUSE PILOT MODE</b></div><div className="confidence-warning"><AlertTriangle /><span><strong>No approved, applicable manual page is indexed for this case.</strong><small>FaultCite will not invent a procedure, expected result, likely cause, or citation.</small></span></div><div className="check-name"><span><ClipboardCheck /></span><div><h2>Record only work you are independently authorized and qualified to perform</h2><p>Use your employer&apos;s safety program and the correct OEM documentation outside FaultCite. This record does not authorize a diagnostic step.</p></div></div>
        {!p.resultSaved && <><div className="result-label">Record what the observation means for the suspected cause</div><div className="result-buttons">{(["Supports suspected cause", "Does not support suspected cause", "Unable to test", "Unsafe — escalate"] as Result[]).map(r => <button type="button" key={r} className={p.result === r ? "chosen" : ""} onClick={() => p.setResult(r)}>{r}</button>)}</div>{p.result && <div className="result-capture"><div className="field"><label htmlFor="reading">Reading or observation <b>Required for manager review</b></label><input id="reading" value={p.reading} onChange={e => p.setReading(e.target.value)} placeholder="Record exactly what you observed and how it was measured" /></div><button className="primary" type="button" disabled={p.resultSaving} onClick={p.saveResult}>{p.resultSaving ? "Saving…" : "Save observation"}</button></div>}</>}
        {p.resultSaved && <div className={`saved-result result-${p.result?.toLowerCase().replaceAll(" ", "-").replace("—", "")}`}><AlertTriangle /><div><strong>{p.result} recorded</strong><p>{p.reading || "No additional reading entered."} · {p.signedInName} · Saved now</p></div></div>}
      </article>
      <div className="analysis-summary"><div><ShieldAlert />GUIDANCE WITHHELD</div><h2>Applicable reviewed evidence is required before FaultCite can recommend a next check.</h2><p>This is the intended safe-refusal behavior for the controlled pilot.</p></div>
      {p.resultSaved && <article className="next-step"><div><span className="eyebrow">DIAGNOSTIC UPDATED</span><h2>{p.result === "Unsafe — escalate" ? "Work stopped and escalation recorded" : p.causeConfirmed ? "Cause confirmed by an authenticated manager" : "Result saved — a supporting observation does not confirm a cause"}</h2><p>The technician, time, reading, and result are now part of the case audit record.</p></div>{p.causeConfirmed ? <button className="primary" onClick={p.verify}>Verify repair <ChevronRight /></button> : p.result === "Unsafe — escalate" ? <span className="status status-down">Supervisor review required</span> : p.result === "Supports suspected cause" && p.canApprove ? <button className="primary" onClick={p.confirmCause}>Manager confirm technician conclusion <ShieldCheck /></button> : p.result === "Supports suspected cause" ? <button className="primary" onClick={p.requestReview}>Request manager review <ShieldCheck /></button> : <button className="primary" onClick={p.continueDiagnosis}>Record another observation <ChevronRight /></button>}</article>}
    </section><aside className="analysis-aside"><CaseTimeline events={p.events} /><EvidencePanel evidence={p.evidence} retryPhoto={p.retryPhoto} online={p.online} /><div className="prototype"><HardHat /><div><strong>Controlled pilot safety mode</strong><p>Guidance remains locked until applicable, reviewed page-level evidence is available.</p></div></div></aside></div>
  </div>;
}

function CaseTimeline({ events }: { events: CaseEventRecord[] }) {
  const [openEvent, setOpenEvent] = useState("");
  const labels: Record<string,string> = { case_opened:"Case opened", diagnostic_result:"Observation recorded", evidence_added:"Evidence saved", review_requested:"Manager review requested", cause_confirmed:"Cause confirmed", case_closed:"Case closed", followup_created:"Follow-up created" };
  return <div className="timeline-card"><span className="eyebrow">SAVED CASE TIMELINE</span>{!events.length ? <p>No saved events could be loaded.</p> : <ol>{events.map(e=><li className="done" key={e.id}><i><Check /></i><button type="button" onClick={()=>setOpenEvent(openEvent===e.id?"":e.id)} aria-expanded={openEvent===e.id}><span><strong>{labels[e.eventType] || e.eventType.replaceAll("_", " ")}</strong><small>{new Date(e.createdAt).toLocaleString()}</small></span><ChevronDown className={openEvent===e.id?"rotated":""} /></button>{openEvent===e.id&&<p>{[e.result,e.reading,e.notes].filter(Boolean).join(" · ") || "Saved event"}</p>}</li>)}</ol>}</div>;
}

function EvidencePanel({ evidence, retryPhoto, online }: { evidence: EvidenceRecord[]; retryPhoto: (file: File) => Promise<void>; online: boolean }) {
  const input = useRef<HTMLInputElement>(null); const [uploading, setUploading] = useState(false); const [error, setError] = useState("");
  async function selected(file?: File) { if (!file) return; setUploading(true); setError(""); try { await retryPhoto(file); } catch (failure) { setError(failure instanceof Error ? failure.message : "Photo upload failed."); } finally { setUploading(false); } }
  return <div className="timeline-card"><span className="eyebrow">PRIVATE CASE EVIDENCE</span><input ref={input} hidden type="file" accept="image/*" capture="environment" onChange={event => selected(event.target.files?.[0])} />{evidence.length ? <ol>{evidence.map(item => <li className="done" key={item.id}><i><Camera /></i><a href={`/api/evidence/${item.id}`} target="_blank" rel="noreferrer"><span><strong>{item.fileName}</strong><small>{item.kind.replaceAll("_", " ")} · {Math.max(1, Math.round(item.sizeBytes / 1024))} KB</small></span><ChevronRight /></a></li>)}</ol> : <p>No evidence image is attached yet.</p>}<button className="secondary full" type="button" disabled={uploading || !online} onClick={() => input.current?.click()}><Camera />{uploading ? "Uploading…" : online ? "Add or retry photo" : "Reconnect to add photo"}</button>{error && <p className="red-text">{error}</p>}</div>;
}

function VerificationView({ machine, result, caseId, signedInName, canApprove, online, back, complete }: { machine: Machine; result: Result | null; caseId: string; signedInName: string; canApprove: boolean; online: boolean; back: () => void; complete: (repairType: string) => void }) {
  const [cause, setCause] = useState(""); const [work, setWork] = useState(""); const [parts, setParts] = useState(""); const [partQty, setPartQty] = useState(""); const [beforeAfter, setBeforeAfter] = useState(""); const [cycles, setCycles] = useState(""); const [safety, setSafety] = useState(false); const authorized = signedInName; const [approval, setApproval] = useState(false); const [repairType, setRepairType] = useState("Permanent"); const [followup, setFollowup] = useState(""); const [expires, setExpires] = useState(""); const [restrictions, setRestrictions] = useState(""); const [review, setReview] = useState(false); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  const temporaryReady = repairType === "Permanent" || Boolean(followup && expires && restrictions);
  const closeoutRequestKey = useRef(crypto.randomUUID());
  const canClose = Boolean(!saving && online && canApprove && caseId && cause && work && cycles && safety && authorized && approval && temporaryReady && review);
  async function submit(e: FormEvent) { e.preventDefault(); if (!online) { setError("Reconnect before closing the case."); return; } if (!canClose) { setError("Complete every required closeout and approval item before closing this case."); return; } setSaving(true); setError(""); const response = await fetch(`/api/cases/${caseId}/close`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmedCause: cause, repairSummary: work, partsUsed: [parts, partQty && `Qty ${partQty}`].filter(Boolean).join(" · "), verificationReadings: beforeAfter, testCycles: cycles, safetyDevicesVerified: safety, approvalConfirmed: approval, repairType, temporaryExpiresAt: expires || null, operatingRestrictions: restrictions, followupWork: followup, idempotencyKey: closeoutRequestKey.current }) }); setSaving(false); if (!response.ok) { const payload = await response.json().catch(() => null) as { error?: string } | null; setError(payload?.error || "The closeout could not be saved."); return; } complete(repairType); }
  return <div className="page focused"><button className="back" onClick={back}><ArrowLeft />Back to diagnostic</button><div className="flow-title"><span className="eyebrow red">MACHINE DOWN · STEP 3 OF 3</span><h1>Verify the repair</h1><p>Complete three short sections, then review and close the case.</p></div><Progress step={3} /><form className="verify-layout" onSubmit={submit}><section className="form-card closeout-sections"><div className="verified-machine"><CheckCircle2 /><div><small>CASE MACHINE</small><strong>{machine.asset} · {machine.manufacturer} {machine.model}</strong></div><span>{result || "Result pending"}</span></div><fieldset className="closeout-section"><legend><span>1</span>Cause and repair</legend><div className="field"><label htmlFor="cause">Confirmed cause <b>Required</b></label><textarea id="cause" value={cause} onChange={e => setCause(e.target.value)} placeholder="What evidence confirmed the cause?" /></div><div className="field"><label htmlFor="work">Work performed <b>Required</b></label><textarea id="work" value={work} onChange={e => setWork(e.target.value)} placeholder="Describe the repair or adjustment." /></div><div className="parts-row"><div className="field"><label htmlFor="parts">Part number</label><input id="parts" value={parts} onChange={e => setParts(e.target.value)} placeholder="Part number or none" /></div><div className="field"><label htmlFor="qty">Quantity</label><input id="qty" value={partQty} onChange={e => setPartQty(e.target.value)} placeholder="0" /></div></div></fieldset><fieldset className="closeout-section"><legend><span>2</span>Verification test</legend><div className="field"><label htmlFor="readings">Before / after readings</label><input id="readings" value={beforeAfter} onChange={e => setBeforeAfter(e.target.value)} placeholder="Before → after" /></div><div className="field"><label htmlFor="cycles">Successful test cycles <b>Required</b></label><input id="cycles" value={cycles} onChange={e => setCycles(e.target.value)} placeholder="Example: 5 automatic cycles without alarm" /></div><button type="button" className="secondary" disabled title="Closeout photo upload is not enabled in this pilot"><Camera />Closeout photos coming after pilot</button></fieldset><fieldset className="closeout-section"><legend><span>3</span>Safety and restart approval</legend><label className={safety ? "confirm-check checked safety-check" : "confirm-check safety-check"}><input type="checkbox" checked={safety} onChange={e => setSafety(e.target.checked)} /><span><Check /></span>Required guards and safety devices were verified after the repair.</label><div className="two-inputs"><div className="field"><label htmlFor="authorized">Authorized approver <b>Required</b></label><input id="authorized" value={authorized} readOnly /></div><div className="field"><label htmlFor="type">Repair status</label><select id="type" value={repairType} onChange={e => setRepairType(e.target.value)}><option>Permanent</option><option>Temporary</option></select></div></div><label className={approval ? "confirm-check checked approval-check" : "confirm-check approval-check"}><input type="checkbox" checked={approval} onChange={e => setApproval(e.target.checked)} /><span><LockKeyhole /></span><div><strong>Record authenticated approval</strong><small>Signed-in approver, role, date, and time will be saved permanently.</small></div></label>{repairType === "Temporary" && <div className="temporary-panel"><strong>Temporary repair controls</strong><div className="two-inputs"><div className="field"><label htmlFor="expires">Expires <b>Required</b></label><input id="expires" type="date" value={expires} onChange={e => setExpires(e.target.value)} /></div><div className="field"><label htmlFor="restrictions">Operating restrictions <b>Required</b></label><input id="restrictions" value={restrictions} onChange={e => setRestrictions(e.target.value)} placeholder="Limits until permanent repair" /></div></div><div className="field"><label htmlFor="followup">Required follow-up work <b>Required</b></label><textarea id="followup" value={followup} onChange={e => setFollowup(e.target.value)} placeholder="A follow-up case will be created automatically." /></div></div>}</fieldset><label className={review ? "confirm-check checked review-check" : "confirm-check review-check"}><input type="checkbox" checked={review} onChange={e => setReview(e.target.checked)} /><span><Check /></span>I reviewed this closeout and confirm the record is complete.</label>{error && <div className="error"><AlertTriangle />{error}</div>}</section><aside className="flow-aside"><div className="safety"><ShieldAlert /><div><strong>Restart is a human decision</strong><p>FaultCite records authorization. It does not approve a machine for production.</p></div></div><div className="summary-card"><span className="eyebrow">CLOSEOUT CHECK</span><ul><li className={cause ? "done" : ""}>Cause confirmed</li><li className={work ? "done" : ""}>Work documented</li><li className={cycles ? "done" : ""}>Test cycles recorded</li><li className={safety ? "done" : ""}>Safety devices verified</li><li className={authorized && approval ? "done" : ""}>Authenticated approval</li><li className={temporaryReady ? "done" : ""}>Repair status complete</li><li className={review ? "done" : ""}>Closeout reviewed</li></ul></div><button className="primary" type="submit" disabled={!canClose}>Close verified case <CheckCircle2 /></button><small className="fine-print">Complete all required items to enable case closure.</small></aside></form></div>;
}

function CompleteView({ machine, caseNumber, signedInName, repairType, start, home }: { machine: Machine; caseNumber: string; signedInName: string; repairType: "Permanent" | "Temporary"; start: () => void; home: () => void }) { const temporary = repairType === "Temporary"; return <div className="page focused"><div className="complete-card"><span><CheckCircle2 /></span><small>CASE {caseNumber || "SAVED"}</small><h1>{temporary ? "Temporary repair documented" : "Repair verified and documented"}</h1><p>{temporary ? `${machine.asset} remains marked Attention. Follow the saved restrictions and complete the permanent-repair follow-up.` : `${machine.asset} is recorded as returned to service. The complete case history is ready for review and future troubleshooting.`}</p><dl><div><dt>Status</dt><dd>{temporary ? "Closed · temporary · attention required" : "Closed · verified"}</dd></div><div><dt>Closed by</dt><dd>{signedInName}</dd></div><div><dt>Record</dt><dd>Saved with audit history</dd></div></dl><div><button className="secondary" onClick={home}>Return home</button><button className="primary" onClick={start}>Start another case</button></div></div></div>; }

function MobileNav({ view, go, startCase }: { view: View; go: (view: View) => void; startCase: (id?: string) => void }) {
  return <nav className="mobile-nav" aria-label="Mobile technician navigation">
    <button className={view === "home" ? "active" : ""} onClick={() => go("home")}><Home /><span>Home</span></button>
    <button className={view === "cases" ? "active" : ""} onClick={() => go("cases")}><Activity /><span>Cases</span></button>
    <button className="mobile-down" onClick={() => startCase()} aria-label="Start Machine Down case"><AlertTriangle /><span>Machine down</span></button>
    <button className={view === "machines" ? "active" : ""} onClick={() => go("machines")}><QrCode /><span>Machines</span></button>
    <button className={view === "knowledge" ? "active" : ""} onClick={() => go("knowledge")}><BookOpen /><span>Manuals</span></button>
  </nav>;
}

function TeamPanel({ team, invitations, online, onInvited }: { team: TeamMember[]; invitations: Invitation[]; online: boolean; onInvited: (invite: Invitation) => void }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState("technician"); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  async function invite(event: FormEvent) { event.preventDefault(); if (!online) { setMessage("Reconnect before sending an invitation."); return; } setSaving(true); setMessage(""); const response = await fetch("/api/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, role }) }); const payload = await response.json().catch(() => null) as { invitation?: Invitation; emailSent?: boolean; emailError?: string | null; error?: string } | null; setSaving(false); if (!response.ok || !payload?.invitation) return setMessage(payload?.error || "Invitation could not be saved."); onInvited(payload.invitation); setEmail(""); setMessage(payload.emailSent ? "Invitation saved and email sent." : `Invitation saved, but email was not sent${payload.emailError ? `: ${payload.emailError}` : "."}`); }
  return <section className="form-card team-panel"><div className="utility-title"><span><Users /></span><div><small className="eyebrow">PILOT ACCESS</small><h2>Company team</h2><p>Invite technicians and managers into this shared workspace.</p></div></div><form className="two-inputs" onSubmit={invite}><div className="field"><label htmlFor="invite-email">Work email</label><input id="invite-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="technician@company.com" /></div><div className="field"><label htmlFor="invite-role">Role</label><select id="invite-role" value={role} onChange={event => setRole(event.target.value)}><option value="technician">Technician</option><option value="manager">Manager / approver</option></select></div><button className="primary" type="submit" disabled={saving || !online}>{saving ? "Saving…" : online ? "Invite to pilot" : "Reconnect to invite"}</button></form>{message && <p className="fine-print">{message}</p>}<div className="team-grid">{team.map(member => <article key={member.id}><CircleUserRound /><div><strong>{member.displayName}</strong><small>{member.email} · {member.role}{member.active ? "" : " · inactive"}</small></div></article>)}{invitations.filter(item => item.status === "pending" || item.status === "expired").map(invite => <article key={invite.id}><Upload /><div><strong>{invite.email}</strong><small>{invite.status === "expired" ? "Expired — invite again" : "Pending (7 days)"} · {invite.role}</small></div></article>)}</div></section>;
}

function ReviewQueue({ cases, machines, open }: { cases: CaseRecord[]; machines: Machine[]; open: (record: CaseRecord) => void }) {
  const queue = cases.filter(item => item.status === "review_requested").sort((a,b) => new Date(a.updatedAt).valueOf() - new Date(b.updatedAt).valueOf());
  return <section className="form-card team-panel"><div className="utility-title"><span><ClipboardCheck /></span><div><small className="eyebrow">MANAGER ACTION</small><h2>Restart review queue</h2><p>Oldest technician requests appear first. Open a case to review its observations and evidence.</p></div></div>{queue.length ? queue.map(record => <CaseRow key={record.id} record={record} machine={machines.find(machine => machine.id === record.machineId)} onClick={() => open(record)} />) : <p className="fine-print">No cases are waiting for manager review.</p>}</section>;
}

function MachineAdmin({ online, onSaved }: { online: boolean; onSaved: (machine: Machine) => void }) {
  const [assetNumber,setAssetNumber]=useState(""); const [manufacturer,setManufacturer]=useState(""); const [model,setModel]=useState(""); const [serialNumber,setSerialNumber]=useState(""); const [control,setControl]=useState(""); const [location,setLocation]=useState(""); const [message,setMessage]=useState(""); const [saving,setSaving]=useState(false);
  async function save(event: FormEvent) { event.preventDefault(); if (!online) { setMessage("Reconnect before adding a machine."); return; } setSaving(true); setMessage(""); const response=await fetch("/api/machines",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({assetNumber,manufacturer,model,serialNumber,control,location})}); const payload=await response.json().catch(()=>null) as {machine?:{id:string;assetNumber:string;manufacturer:string;model:string;serialNumber:string|null;control:string|null;location:string|null;status:string};error?:string}|null; setSaving(false); if(!response.ok||!payload?.machine)return setMessage(payload?.error||"Machine could not be saved."); const m=payload.machine; onSaved({id:m.id,asset:m.assetNumber,manufacturer:m.manufacturer,model:m.model,serial:m.serialNumber||"Not recorded",control:m.control||"Not recorded",location:m.location||"Location not recorded",status:"running",image:`${m.manufacturer[0]||"C"}${m.model[0]||"M"}`.toUpperCase()}); setAssetNumber("");setManufacturer("");setModel("");setSerialNumber("");setControl("");setLocation("");setMessage("Machine saved to the company registry."); }
  return <form className="form-card team-panel" onSubmit={save}><div className="utility-title"><span><Gauge /></span><div><small className="eyebrow">MANAGER CONTROL</small><h2>Register a machine</h2><p>Technicians must verify these identity fields against the machine nameplate.</p></div></div><div className="two-inputs"><div className="field"><label htmlFor="asset-number">Asset number</label><input id="asset-number" required value={assetNumber} onChange={e=>setAssetNumber(e.target.value)} /></div><div className="field"><label htmlFor="manufacturer">Manufacturer</label><input id="manufacturer" required value={manufacturer} onChange={e=>setManufacturer(e.target.value)} /></div><div className="field"><label htmlFor="model">Model</label><input id="model" required value={model} onChange={e=>setModel(e.target.value)} /></div><div className="field"><label htmlFor="serial-number">Serial number</label><input id="serial-number" value={serialNumber} onChange={e=>setSerialNumber(e.target.value)} /></div><div className="field"><label htmlFor="control">CNC control</label><input id="control" value={control} onChange={e=>setControl(e.target.value)} /></div><div className="field"><label htmlFor="location">Location</label><input id="location" value={location} onChange={e=>setLocation(e.target.value)} /></div></div><button className="primary" disabled={saving || !online}>{saving ? "Saving…" : online ? "Add machine" : "Reconnect to add machine"}</button>{message&&<p className="fine-print">{message}</p>}</form>;
}

function CaseHistory({ record, machine, events, evidence, back }: { record: CaseRecord; machine?: Machine; events: CaseEventRecord[]; evidence: EvidenceRecord[]; back: () => void }) {
  return <div className="page utility"><button className="back" onClick={back}><ArrowLeft />Back to cases</button><div className="utility-title"><span><FileText /></span><div><small className="eyebrow">READ-ONLY REPAIR HISTORY</small><h1>{record.caseNumber} · {machine?.asset || "Unknown asset"}</h1><p>Closed records cannot be changed through the application.</p></div></div><section className="form-card"><dl><div><dt>Confirmed cause</dt><dd>{record.confirmedCause || "Not recorded"}</dd></div><div><dt>Repair performed</dt><dd>{record.repairSummary || "Not recorded"}</dd></div><div><dt>Parts used</dt><dd>{record.partsUsed || "None recorded"}</dd></div><div><dt>Verification readings</dt><dd>{record.verificationReadings || "Not recorded"}</dd></div><div><dt>Test cycles</dt><dd>{record.testCycles || "Not recorded"}</dd></div><div><dt>Repair status</dt><dd>{record.repairType || "Not recorded"}</dd></div></dl></section><section className="form-card"><h2>Evidence</h2>{evidence.length ? evidence.map(item=><p key={item.id}><a href={`/api/evidence/${item.id}`} target="_blank" rel="noreferrer">{item.fileName}</a> · {Math.ceil(item.sizeBytes/1024)} KB</p>) : <p>No file evidence recorded.</p>}</section><section className="form-card"><h2>Saved timeline</h2>{events.map(item=><p key={item.id}><strong>{item.eventType.replaceAll("_"," ")}</strong> · {new Date(item.createdAt).toLocaleString()}<br />{item.reading||item.notes||"Saved event"}</p>)}</section></div>;
}

function UtilityView({ title, eyebrow, icon, children }: { title: string; eyebrow: string; icon: React.ReactNode; children: React.ReactNode }) { return <div className="page utility"><div className="utility-title"><span>{icon}</span><div><small className="eyebrow">{eyebrow}</small><h1>{title}</h1><p>Review pilot records and verified company knowledge.</p></div></div>{children}</div>; }
function CaseRow({ record, machine, onClick }: { record: CaseRecord; machine?: Machine; onClick: () => void }) { return <button className="case-row" onClick={onClick}><span className="case-alert"><AlertTriangle /></span><div><small>{record.caseNumber} · {record.status.replaceAll("_", " ").toUpperCase()}</small><h2>{machine?.asset || "Unknown asset"} · {record.symptom}</h2><p>{machine ? `${machine.manufacturer} ${machine.model}` : "Machine record unavailable"} · {record.alarmCode || "No alarm"}</p></div><Status value={record.status === "closed" ? "running" : machine?.status || "attention"} /><ChevronRight /></button>; }
function KnowledgeList({ manuals }: { manuals: ManualRecord[] }) { if(!manuals.length) return <EmptyState title="No company manuals" detail="A manager can upload a licensed PDF manual. It will remain unavailable for diagnosis until reviewed and indexed." />; return <div className="knowledge-list">{manuals.map(manual=><a key={manual.id} href={`/api/manuals/${manual.id}`} target="_blank" rel="noreferrer"><span><FileText /></span><div><small>{manual.manufacturer.toUpperCase()} · {(manual.model || "ALL MODELS").toUpperCase()}</small><h2>{manual.title}</h2><p>{manual.revision ? `Revision ${manual.revision}` : "Revision not recorded"} · {manual.serialApplicability || "Serial applicability not recorded"}</p></div><b>{manual.status.replaceAll("_", " ")}</b><ChevronRight /></a>)}</div>; }
function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) { return <section className="empty-state"><Info /><div><h2>{title}</h2><p>{detail}</p></div>{action && onAction && <button className="secondary" onClick={onAction}>{action}</button>}</section>; }

function ImpactView() {
  const measures = [{label:"Downtime duration",detail:"Compare case open and close timestamps."},{label:"Diagnostic cycle time",detail:"Measure time from intake to manager-confirmed cause."},{label:"Repeat failures",detail:"Track a machine returning with the same symptom within 30 days."},{label:"Technician participation",detail:"Count invited technicians who complete at least one case."}];
  return <div className="page utility impact-page"><div className="utility-title"><span><BarChart3 /></span><div><small className="eyebrow">CONTROLLED PILOT</small><h1>Results measurement</h1><p>Results will appear only after enough real company cases establish a defensible baseline.</p></div></div>
    <EmptyState title="No verified pilot results yet" detail="FaultCite will not display example numbers as if they were company performance. Complete and review real pilot cases first." />
    <section className="results-heading"><div><span className="eyebrow">MEASUREMENT PLAN</span><h2>What the pilot will measure</h2></div></section><section className="measure-plan">{measures.map((measure,index)=><article key={measure.label}><span>{index+1}</span><div><h3>{measure.label}</h3><p>{measure.detail}</p></div></article>)}</section>
    <div className="impact-columns"><section className="scope-card"><span className="eyebrow">RELEASE GATE</span><h2>When results become meaningful</h2><p>Use a manager-approved baseline, a defined measurement period, and enough completed cases to avoid misleading conclusions.</p><ul><li><Check />Use only saved company case data</li><li><Check />Document baseline dates and assumptions</li><li><Check />Separate measured results from technician estimates</li></ul></section><section className="scope-card"><span className="eyebrow">SAFETY GUARDRAIL</span><h2>Operational metrics never override safe work</h2><p>Downtime targets cannot authorize bypassing safeguards, skipping LOTO, or returning a machine to production. Those decisions remain with qualified personnel.</p></section></div>
  </div>;
}

function AccessibleDialog({ close, label, className, children }: { close: () => void; label: string; className: string; children: React.ReactNode }) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{ const previous=document.activeElement as HTMLElement|null; const dialog=ref.current; dialog?.querySelector<HTMLElement>("input,button,a[href],select,textarea")?.focus(); function keys(event:KeyboardEvent){ if(event.key==="Escape"){event.preventDefault();close();return;} if(event.key!=="Tab"||!dialog)return; const items=[...dialog.querySelectorAll<HTMLElement>("input,button,a[href],select,textarea,[tabindex]:not([tabindex='-1'])")].filter(item=>!item.hasAttribute("disabled")); if(!items.length)return; const first=items[0],last=items[items.length-1]; if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();} } document.addEventListener("keydown",keys); return()=>{document.removeEventListener("keydown",keys);previous?.focus();};},[close]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={close}><div ref={ref} className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label} onMouseDown={event=>event.stopPropagation()}>{children}</div></div>;
}
function SourceModal({ close }: { close: () => void }) { return <AccessibleDialog close={close} label="Manual status" className="source-modal"><div className="modal-head"><div><span className="eyebrow">SOURCE NOT AVAILABLE</span><h2>Reviewed page-level evidence is required</h2></div><button onClick={close} aria-label="Close source"><X /></button></div><div className="manual-page"><p>FaultCite has a manual record, but this pilot build has not extracted, reviewed, and approved an applicable page for this machine.</p><p className="manual-warning"><AlertTriangle />No diagnostic instruction or citation will be shown until that evidence exists.</p></div><button className="primary full" onClick={close}>Return</button></AccessibleDialog>; }
function SearchModal({ close, machines, openMachine }: { close: () => void; machines: Machine[]; openMachine: (id: string) => void }) { const [query,setQuery]=useState(""); const results=machines.filter(machine=>`${machine.asset} ${machine.manufacturer} ${machine.model} ${machine.location}`.toLowerCase().includes(query.toLowerCase())).slice(0,5); return <AccessibleDialog close={close} label="Search company machines" className="search-modal"><div className="search-box"><Search /><label className="sr-only" htmlFor="machine-search">Search company machines</label><input id="machine-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Asset, maker, model, or location…" /><button onClick={close} aria-label="Close search"><X /></button></div><small className="eyebrow" aria-live="polite">{query ? `${results.length} MATCHING MACHINES` : "REGISTERED MACHINES"}</small>{results.map(machine=><button key={machine.id} className="search-result" onClick={()=>openMachine(machine.id)}><span className="machine-image">{machine.image}</span><div><strong>{machine.asset} · {machine.manufacturer} {machine.model}</strong><p>{machine.location}</p></div><ChevronRight /></button>)}{!results.length&&<EmptyState title="No machine found" detail="Try an asset number, manufacturer, model, or location." />}</AccessibleDialog>; }
