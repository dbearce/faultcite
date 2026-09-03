import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { memberships, notifications } from "../db/schema";

export async function notifyManagers(input: { organizationId: string; caseId: string; type: string; title: string; message: string; dedupeKey: string }) {
  const db = await getDb();
  const recipients = await db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, input.organizationId), eq(memberships.active, true), inArray(memberships.role, ["owner", "manager"])));
  await Promise.all(recipients.map(({ userId }) => db.insert(notifications).values({ id: crypto.randomUUID(), organizationId: input.organizationId, recipientUserId: userId, caseId: input.caseId, type: input.type, title: input.title, message: input.message, dedupeKey: `${input.dedupeKey}:${userId}` }).onConflictDoNothing()));
}
