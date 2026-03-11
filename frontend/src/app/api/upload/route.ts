import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Upload proxy for video files.
 *
 * Next.js rewrites buffer large request bodies and cause ECONNRESET errors
 * for big file uploads. This route streams the multipart form data directly
 * to the backend without buffering.
 */
export async function POST(request: NextRequest) {
  const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
  const contentType = request.headers.get("content-type");

  const backendResponse = await fetch(`${backendUrl}/upload`, {
    method: "POST",
    headers: contentType ? { "content-type": contentType } : {},
    body: request.body,
    // @ts-ignore – required for request body streaming in Node.js fetch
    duplex: "half",
  });

  const data = await backendResponse.json();
  return Response.json(data, { status: backendResponse.status });
}
