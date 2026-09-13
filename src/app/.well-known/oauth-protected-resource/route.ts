import { NextResponse } from "next/server";

export const runtime = "nodejs";

function metadata() {
  const resource = process.env.MCP_RESOURCE_URL;
  const authorizationServer = process.env.BETTER_AUTH_URL;
  if (!resource || !authorizationServer) {
    throw new Error("MCP_RESOURCE_URL and BETTER_AUTH_URL are required");
  }

  return {
    resource,
    authorization_servers: [authorizationServer],
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
