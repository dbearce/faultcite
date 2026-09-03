import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { getDb } from "../../../db";
import { cases, notifications } from "../../../db/schema";
import { apiError, isErrorResponse, requireApiContext } from "../../../lib/backend";

export async function GET() {
  const ctx=await requireApiContext(); if(isErrorResponse(ctx))return ctx; const db=await getDb();
  if (["owner","manager"].includes(ctx.role)) {
    const overdue = await db.select({id:cases.id,caseNumber:cases.caseNumber,status:cases.status,managerActionDueAt:cases.managerActionDueAt}).from(cases).where(and(eq(cases.organizationId,ctx.organizationId),inArray(cases.status,["review_requested","closeout_requested"]),lte(cases.managerActionDueAt,new Date())));
    await Promise.all(overdue.map(record => db.insert(notifications).values({id:crypto.randomUUID(),organizationId:ctx.organizationId,recipientUserId:ctx.userId,caseId:record.id,type:"manager_action_overdue",title:`${record.caseNumber} is overdue`,message:record.status==="closeout_requested"?"Restart approval is past the company review SLA.":"Cause review is past the company review SLA.",dedupeKey:`manager-action-overdue:${record.id}:${record.managerActionDueAt?.valueOf()||0}`}).onConflictDoNothing()));
  }
  const rows=await db.select().from(notifications).where(and(eq(notifications.organizationId,ctx.organizationId),eq(notifications.recipientUserId,ctx.userId))).orderBy(desc(notifications.createdAt)).limit(50); return Response.json({notifications:rows,unreadCount:rows.filter(row=>!row.readAt).length});
}
export async function PATCH(request:Request){const ctx=await requireApiContext();if(isErrorResponse(ctx))return ctx;let body:{id?:string;all?:boolean};try{body=await request.json()}catch{return apiError("Invalid JSON request")};const db=await getDb(),now=new Date();if(body.all===true){await db.update(notifications).set({readAt:now}).where(and(eq(notifications.organizationId,ctx.organizationId),eq(notifications.recipientUserId,ctx.userId),isNull(notifications.readAt)));return Response.json({ok:true});}if(!body.id)return apiError("Notification id required");await db.update(notifications).set({readAt:now}).where(and(eq(notifications.id,body.id),eq(notifications.organizationId,ctx.organizationId),eq(notifications.recipientUserId,ctx.userId)));return Response.json({ok:true});}
