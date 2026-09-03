import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [consoleSource, eventsRoute, notificationsRoute] = await Promise.all([
  read("app/technician-console.tsx"),
  read("app/api/cases/[id]/events/route.ts"),
  read("app/api/notifications/route.ts"),
]);

test("notification center loads saved alerts and supports read-one and read-all", () => {
  assert.match(consoleSource, /fetch\("\/api\/notifications", \{ cache: "no-store"/);
  assert.match(consoleSource, /body: JSON\.stringify\(id \? \{ id \} : \{ all: true \}\)/);
  assert.match(consoleSource, /aria-label={`Notifications\$\{unreadNotifications/);
  assert.match(consoleSource, /Mark all as read/);
  assert.match(consoleSource, /Mark read/);
  assert.match(notificationsRoute, /eq\(notifications\.recipientUserId,ctx\.userId\)/);
});

test("case timeline returns tenant-scoped actor identity for every role", () => {
  assert.match(eventsRoute, /innerJoin\(users,eq\(caseEvents\.actorUserId,users\.id\)\)/);
  assert.match(eventsRoute, /eq\(caseEvents\.organizationId,ctx\.organizationId\)/);
  assert.match(eventsRoute, /actorName:users\.displayName/);
  assert.match(eventsRoute, /actorEmail:users\.email/);
  assert.match(consoleSource, /e\.actorName\|\|fallbackActor\?\.displayName/);
  assert.match(consoleSource, /item\.actorName && item\.actorEmail/);
});
