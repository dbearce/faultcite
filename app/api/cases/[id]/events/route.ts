import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditLogs, caseEvents, cases } from "../../../../../db/schema";
import { apiError, cleanText, isErrorResponse, readJsonObject, requireApiContext } from "../../../../../lib/backend";
const validResults = new Set(["Supports suspected cause", "Does not support suspected cause", "Unable to test", "Unsafe — escalate"]);
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
 const ctx=await requireApiContext(); if(isErrorResponse(ctx)) return ctx; const {id}=await params; const db=await getDb();
 const [record]=await db.select({id:cases.id}).from(cases).where(and(eq(cases.id,id),eq(cases.organizationId,ctx.organizationId))).limit(1);
 if(!record)return apiError("Case not found in your company",404);
 const events=await db.select().from(caseEvents).where(and(eq(caseEvents.caseId,id),eq(caseEvents.organizationId,ctx.organizationId))).orderBy(asc(caseEvents.createdAt)).limit(1000);
 return Response.json({events});
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
 let body: Record<string,unknown>; try { body=await readJsonObject(request); } catch (error) { return apiError(error instanceof Error ? error.message : "Invalid JSON request"); }
 const ctx=await requireApiContext(); if(isErrorResponse(ctx)) return ctx; const {id}=await params;
 let result: string; let idempotencyKey: string; let reading: string;
 try { result=cleanText(body.result,40,true)!; idempotencyKey=cleanText(body.idempotencyKey,100,true)!; reading=cleanText(body.reading,1000,true)!; } catch { return apiError("Result, observation, and request key are required"); }
 if(!validResults.has(result)) return apiError("Invalid diagnostic result"); const db=await getDb(); const [record]=await db.select().from(cases).where(and(eq(cases.id,id),eq(cases.organizationId,ctx.organizationId))).limit(1); if(!record)return apiError("Case not found in your company",404); if(["closed","cause_confirmed","escalated","review_requested"].includes(record.status))return apiError("This case cannot accept additional observations in its current state",409);
 const [existing]=await db.select().from(caseEvents).where(and(eq(caseEvents.organizationId,ctx.organizationId),eq(caseEvents.caseId,id),eq(caseEvents.idempotencyKey,idempotencyKey))).limit(1); if(existing)return Response.json({eventId:existing.id,status:record.status,recordedAt:existing.createdAt,idempotentReplay:true});
 const eventId=crypto.randomUUID(); const auditId=crypto.randomUUID(); const status=result==="Unsafe — escalate"?"escalated":"diagnosing"; const now=new Date();
 try {
  await db.batch([
   db.update(cases).set({status,updatedAt:now}).where(and(eq(cases.id,id),eq(cases.organizationId,ctx.organizationId),eq(cases.status,record.status))),
   db.insert(caseEvents).values({id:eventId,organizationId:ctx.organizationId,caseId:id,actorUserId:ctx.userId,eventType:"diagnostic_result",result,reading,idempotencyKey,payloadJson:JSON.stringify({checkNumber:Number(body.checkNumber)||1})}),
   db.insert(auditLogs).values({id:auditId,organizationId:ctx.organizationId,actorUserId:ctx.userId,action:"case.diagnostic_recorded",entityType:"case",entityId:id,metadataJson:JSON.stringify({result,eventId}),createdAt:now}),
  ]);
 } catch {
  const [replay]=await db.select().from(caseEvents).where(and(eq(caseEvents.organizationId,ctx.organizationId),eq(caseEvents.caseId,id),eq(caseEvents.idempotencyKey,idempotencyKey))).limit(1);
  if(replay)return Response.json({eventId:replay.id,status:record.status,recordedAt:replay.createdAt,idempotentReplay:true});
  return apiError("Case state changed before the observation was saved. Refresh and review it again.",409);
 }
 return Response.json({eventId,status,recordedBy:ctx.displayName,recordedAt:now.toISOString()},{status:201});
}
