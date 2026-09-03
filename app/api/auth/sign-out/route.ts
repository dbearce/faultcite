import { createClerkClient } from "@clerk/backend";
import { cookies } from "next/headers";
import { getAuthUser, isStandaloneRuntime, safeRelativeReturnPath } from "../../../auth";
import { getRequestEnv } from "../../../../lib/request-env";

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (origin !== requestUrl.origin) return Response.json({ error: "Cross-site sign-out was rejected" }, { status: 403 });
  let returnTo = "/";
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData(); returnTo = safeRelativeReturnPath(String(form.get("return_to") || "/"));
  }
  if (await isStandaloneRuntime()) {
    const identity = await getAuthUser();
    const env = getRequestEnv();
    if (identity?.sessionId && env.CLERK_SECRET_KEY) {
      await createClerkClient({ secretKey: env.CLERK_SECRET_KEY }).sessions.revokeSession(identity.sessionId).catch(() => undefined);
    }
  }
  const cookieStore = await cookies();
  cookieStore.delete("__session");
  const signIn = new URL(`/sign-in?return_to=${encodeURIComponent(returnTo)}`, requestUrl.origin);
  return Response.redirect(signIn, 303);
}
