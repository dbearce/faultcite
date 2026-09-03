import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvents, cases, users } from "../../../../../db/schema";
import { apiError, canModifyCase, cleanText, isErrorResponse, requireApiContext } from "../../../../../lib/backend";
const validResults = new Set(["Supports suspected cause", "Does not support suspected cause", "Unable to test", "Unsafe — escalate"]);
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
 const ctx=await requireApiContext(); if(isErrorResponse(ctx)) return ctx; const {id}=await params; const db=await getDb();
 const [record]=await db.select({id:cases.id}).from(cases).where(and(eq(cases.id,id),eq(cases.organizationId,ctx.organizationId))).limit(1);
 if(!record)return apiError("Case not found in your company",404);
 const events=await db.select({
  id:caseEvents.id,organizationId:caseEvents.organizationId,caseId:caseEvents.caseId,
  actorUserId:caseEvents.actorUserId,eventType:caseEvents.eventType,result:caseEvents.result,
  reading:caseEvents.reading,notes:caseEvents.notes,payloadJson:caseEvents.payloadJson,
  idempotencyKey:caseEvents.idempotencyKey,createdAt:caseEvents.createdAt,
  actorName:users.displayName,actorEmail:users.email,
 }).from(caseEvents).innerJoin(users,eq(caseEvents.actorUserId,users.id)).where(and(eq(caseEvents.caseId,id),eq(caseEvents.organizationId,ctx.organizationId))).orderBy(asc(caseEvents.createdAt));
 if (!events.length) return apiError("The saved case timeline is unavailable. Contact support before continuing this case.", 409);
 return Response.json({events,eventCount:events.length},{headers:{"cache-control":"private, no-store"}});
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
 let body: Record<string,unknown>; try { body=await request.json() as Record<string,unknown>; } catch { return apiError("Invalid JSON request"); }
 const ctx=await requireApiContext(); if(isErrorResponse(ctx)) return ctx; const {id}=await params;
 let result: string; let idempotencyKey: string; let reading: string; let suspectedCause: string; let testPerformed: string; let expectedResult: string;
 try { result=cleanText(body.result,40,true)!; idempotencyKey=cleanText(body.idempotencyKey,100,true)!; reading=cleanText(body.reading,1000,true)!; suspectedCause=cleanText(body.suspectedCause,500,true)!; testPerformed=cleanText(body.testPerformed,1000,true)!; expectedResult=cleanText(body.expectedResult,1000,true)!; } catch { return apiError("Suspected cause, test performed, expected result, actual observation, result, and request key are required"); }
 if(!validResults.has(result)) return apiError("Invalid diagnostic result"); const db=await getDb(); const [record]=await db.select().from(cases).where(and(eq(cases.id,id),eq(cases.organizationId,ctx.organizationId))).limit(1); if(!record)return apiError("Case not found in your company",404); if(!canModifyCase(ctx,record))return apiError("This case is assigned to another technician",403); if(["closed","cause_confirmed","escalated","review_requested"].includes(record.status))return apiError("This case cannot accept additional observations in its current state",409);
 const [existing]=await db.select().from(caseEvents).where(and(eq(caseEvents.organizationId,ctx.organizationId),eq(caseEvents.caseId,id),eq(caseEvents.idempotencyKey,idempotencyKey))).limit(1); if(existing)return Response.json({eventId:existing.id,status:record.status,recordedAt:existing.createdAt,idempotentReplay:true});
 const eventId=crypto.randomUUID(); const auditId=crypto.randomUUID(); const status=result==="Unsafe — escalate"?"escalated":"diagnosing"; const now=new Date();
 try {
  await db.batch([
   db.update(cases).set({status,updatedAt:now}).where(and(eq(cases.id,id),eq(cases.organizationId,ctx.organizationId),eq(cases.status,record.status))),
   db.insert(caseEvents).values({id:eventId,organizationId:ctx.organizationId,caseId:id,actorUserId:ctx.userId,eventType:"diagnostic_result",result,reading,idempotencyKey,payloadJson:JSON.stringify({checkNumber:Number(body.checkNumber)||1,suspectedCause,testPerformed,expectedResult,units:cleanText(body.units,80)})}),
   db.insert(auditLogs).values({id:auditId,organizationId:ctx.organizationId,actorUserId:ctx.userId,action:"case.diagnostic_recorded",entityType:"case",entityId:id,metadataJson:JSON.stringify({result,eventId,suspectedCause}),createdAt:now}),
  ]);
 } catch {
  const [replay]=await db.select().from(caseEvents).where(and(eq(caseEvents.organizationId,ctx.organizationId),eq(caseEvents.caseId,id),eq(caseEvents.idempotencyKey,idempotencyKey))).limit(1);
  if(replay){const [current]=await db.select({status:cases.status}).from(cases).where(and(eq(cases.id,id),eq(cases.organizationId,ctx.organizationId))).limit(1);return Response.json({eventId:replay.id,status:current?.status||record.status,recordedAt:replay.createdAt,idempotentReplay:true});}
  return apiError("Case state changed before the observation was saved. Refresh and review it again.",409);
 }
 return Response.json({eventId,status,recordedBy:ctx.displayName,recordedAt:now.toISOString()},{status:201});
}
