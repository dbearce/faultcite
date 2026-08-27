type ManualApiSource = {
  id: string;
  title: string;
  manufacturer: string;
  model?: string | null;
  revision?: string | null;
  serialApplicability?: string | null;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  rightsConfirmed: boolean;
  createdAt?: Date;
  updatedAt?: Date;
};

type EvidenceApiSource = {
  id: string;
  caseId: string;
  kind: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  createdAt?: Date;
};

type InvitationApiSource = {
  id: string;
  email: string;
  role: string;
  status: string;
  acceptedAt?: Date | null;
  expiresAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
};

type CaseApiSource = {
  id: string; caseNumber: string; machineId: string; status: string; symptom: string;
  alarmCode?: string | null; precedingChange?: string | null; notes?: string | null;
  confirmedCause?: string | null; repairSummary?: string | null; repairType?: string | null;
  partsUsed?: string | null; verificationReadings?: string | null; testCycles?: string | null;
  safetyDevicesVerified?: boolean; temporaryExpiresAt?: Date | null;
  operatingRestrictions?: string | null; followupWork?: string | null;
  openedAt?: Date; closedAt?: Date | null; createdAt?: Date; updatedAt?: Date;
};

// Explicit allowlists keep storage keys, tenant IDs, and internal actor IDs
// server-side even if database rows gain new columns later.
export function manualApiView(row: ManualApiSource) {
  return {
    id: row.id,
    title: row.title,
    manufacturer: row.manufacturer,
    model: row.model ?? null,
    revision: row.revision ?? null,
    serialApplicability: row.serialApplicability ?? null,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    status: row.status,
    rightsConfirmed: row.rightsConfirmed,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function evidenceApiView(row: EvidenceApiSource) {
  return {
    id: row.id,
    caseId: row.caseId,
    kind: row.kind,
    fileName: row.fileName,
    contentType: row.contentType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
  };
}

export function invitationApiView(row: InvitationApiSource) {
  const status = row.status === "pending" && (!row.expiresAt || row.expiresAt <= new Date()) ? "expired" : row.status;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    status,
    acceptedAt: row.acceptedAt ?? null,
    expiresAt: row.expiresAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function caseApiView(row: CaseApiSource) {
  return {
    id: row.id, caseNumber: row.caseNumber, machineId: row.machineId, status: row.status,
    symptom: row.symptom, alarmCode: row.alarmCode ?? null,
    precedingChange: row.precedingChange ?? null, notes: row.notes ?? null,
    confirmedCause: row.confirmedCause ?? null, repairSummary: row.repairSummary ?? null,
    repairType: row.repairType ?? null, partsUsed: row.partsUsed ?? null,
    verificationReadings: row.verificationReadings ?? null, testCycles: row.testCycles ?? null,
    safetyDevicesVerified: row.safetyDevicesVerified ?? false,
    temporaryExpiresAt: row.temporaryExpiresAt ?? null,
    operatingRestrictions: row.operatingRestrictions ?? null,
    followupWork: row.followupWork ?? null, openedAt: row.openedAt,
    closedAt: row.closedAt ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt,
  };
}
