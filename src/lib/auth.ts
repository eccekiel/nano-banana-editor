import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
const baseURL = process.env.BETTER_AUTH_URL;
const resource = process.env.MCP_RESOURCE_URL;

if (!databaseUrl) throw new Error("DATABASE_URL is not configured");
if (!baseURL) throw new Error("BETTER_AUTH_URL is not configured");
if (!resource) throw new Error("MCP_RESOURCE_URL is not configured");

const globalForAuth = globalThis as unknown as { solAuthPool?: Pool };
const pool = globalForAuth.solAuthPool ?? new Pool({ connectionString: databaseUrl });
if (process.env.NODE_ENV !== "production") globalForAuth.solAuthPool = pool;

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: pool,
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
  plugins: [
    jwt(),
    mcp({
      loginPage: "/sign-in",
      consentPage: "/consent",
      resource,
      scopes: ["openid", "profile", "email", "offline_access", "mcp:edit"],
    }),
    cimd({
      fetchClientMetadataResource,
      metadataProfile: "mcp-2026-07-28",
    }),
  ],
});
