import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const backendUrl = process.env.BACKEND_URL || "http://127.0.0.1:8000";
  const apiToken = process.env.ADMIN_API_TOKEN || "";
  const targetUrl = new URL("/api/v1/monitoring/live", backendUrl);
  targetUrl.search = request.nextUrl.search;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${apiToken}`,
      },
      cache: "no-store",
      signal: request.signal,
    });

    if (!response.ok || !response.body) {
      return NextResponse.json(
        { error: `Live market stream failed: HTTP ${response.status}` },
        { status: response.status || 502 },
      );
    }

    return new Response(response.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error("[Live Market Stream Proxy]", error);
    return NextResponse.json(
      { error: "Failed to connect to live market stream" },
      { status: 502 },
    );
  }
}
