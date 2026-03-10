import { type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

/**
 * SSE proxy for task progress.
 *
 * Next.js rewrites buffer responses and don't support real-time SSE streaming.
 * This route validates the Better Auth session server-side (via cookie), exchanges
 * it for a backend JWT internally, and re-streams the backend SSE to the browser.
 * The JWT is never exposed in the URL.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Validate session server-side using the Better Auth cookie.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.session?.token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

  // Exchange Better Auth session token for a backend JWT.
  const tokenRes = await fetch(`${backendUrl}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_token: session.session.token }),
  });

  if (!tokenRes.ok) {
    return new Response("Failed to obtain backend token", { status: 502 });
  }

  const { access_token: jwt } = await tokenRes.json();

  // Connect to the backend SSE endpoint using the JWT in the Authorization header.
  const backendResponse = await fetch(`${backendUrl}/tasks/${id}/progress`, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${jwt}`,
    },
  });

  if (!backendResponse.ok || !backendResponse.body) {
    return new Response(null, { status: backendResponse.status });
  }

  return new Response(backendResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
