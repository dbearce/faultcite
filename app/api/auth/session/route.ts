import { getAuthUser } from "../../../auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  return Response.json(
    { authenticated: Boolean(user) },
    {
      status: user ? 200 : 401,
      headers: { "cache-control": "private, no-store" },
    },
  );
}
