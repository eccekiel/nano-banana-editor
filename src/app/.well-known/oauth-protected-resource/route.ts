import { NextResponse } from "next/server";
import { authBaseURL, mcpResource } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function metadata() {
  return {
    resource: mcpResource,
    authorization_servers: [authBaseURL],
    scopes_supported: ["openid", "profile", "email", "offline_access", "mcp:edit"],
    bearer_methods_supported: ["header"],
  };
}

export async function GET() {
  return NextResponse.json(metadata(), {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
