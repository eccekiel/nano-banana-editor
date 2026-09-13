import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { Pool } from "pg";

function getAppOrigin() {
  const explicit = process.env.BETTER_AUTH_URL?.replace(/\/+$/, "");
  if (explicit) return explicit;

  const host = process.env.VERCEL_ENV === "production"
    ? process.env.VERCEL_PROJECT_PRODUCTION_URL
    : process.env.VERCEL_URL;

  if (host) return `https://${host}`;
  return "http://localhost:3000";
}

export const mcpResource = (
  process.env.MCP_RESOURCE_URL || `${getAppOrigin()}/api/mcp`
).replace(/\/+$/, "");

const databaseUrl = process.env.DATABASE_URL;
const globalForAuth = globalThis as unknown as { solAuthPool?: Pool };
const pool = databaseUrl
  ? (globalForAuth.solAuthPool ?? new Pool({ connectionString: databaseUrl }))
  : undefined;

if (pool && process.env.NODE_ENV !== "production") {
  globalForAuth.solAuthPool = pool;
}

export const auth = betterAuth({
  baseURL: getAppOrigin(),
  secret: process.env.BETTER_AUTH_SECRET,
  ...(pool ? { database: pool } : {}),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  plugins: [
    jwt(),
    mcp({
      loginPage: "/sign-in",
      consentPage: "/consent",
      resource: mcpResource,
      scopes: ["openid", "profile", "email", "offline_access", "mcp:edit"],
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ],
});
