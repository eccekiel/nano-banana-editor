import { requireMcpAuth } from "@better-auth/mcp";
import { auth } from "@/lib/auth";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import Replicate from "replicate";

export const runtime = "nodejs";
export const maxDuration = 300;

const resource = process.env.MCP_RESOURCE_URL;
if (!resource) throw new Error("MCP_RESOURCE_URL is not configured");

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN || "",
  useFileOutput: false,
});

const EDITING_GUARDRAIL = `

Editing rules: Preserve the subject's identity, face, facial structure, body proportions, pose, framing, camera angle, lighting, and background unless the user explicitly asks to change them. Change only the element the user requested. If the request is about clothing, modify only the clothing and do not reinterpret the image as a product photo, mannequin, flat lay, or different person. Keep the result photorealistic and visually consistent with the source image.`;

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

async function getOutputUrl(value: unknown): Promise<string | null> {
  if (isHttpUrl(value)) return value;
  if (value instanceof URL) return value.toString();
  if (!value || typeof value !== "object") return null;
  const candidate = value as { url?: unknown };
  if (candidate.url instanceof URL) return candidate.url.toString();
  if (isHttpUrl(candidate.url)) return candidate.url;
  if (typeof candidate.url === "function") {
    const result = await (candidate.url as () => Promise<unknown> | unknown)();
    if (result instanceof URL) return result.toString();
    if (isHttpUrl(result)) return result;
  }
  return null;
}

async function outputToImageContent(value: unknown) {
  const url = await getOutputUrl(value);
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar el resultado generado (${response.status})`);
  const contentType = response.headers.get("content-type") || "image/png";
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    type: "image" as const,
    data: bytes.toString("base64"),
    mimeType: contentType,
  };
}

const mcpHandler = createMcpHandler((server) => {
  server.registerTool(
    "editor_status",
    {
      title: "Estado de Sol Image Editor",
      description: "Comprueba el estado del puente MCP y qué capacidades están habilitadas.",
      inputSchema: z.object({}),
    },
    async () => ({
      content: [{
        type: "text",
        text: JSON.stringify({
          editor: "Sol Image Editor",
          mcp: "online",
          oauth: "better-auth",
          provider: process.env.REPLICATE_API_TOKEN ? "replicate" : "not_configured",
          model: "black-forest-labs/flux-kontext-pro",
          directEditing: process.env.MCP_EDIT_ENABLED === "true",
        }),
      }],
    }),
  );

  server.registerTool(
    "edit_image_from_url",
    {
      title: "Editar imagen con Sol",
      description: "Edita una imagen remota con FLUX Kontext Pro manteniendo identidad, pose y encuadre salvo que la instrucción pida cambiarlos.",
      inputSchema: z.object({
        image_url: z.string().url().describe("URL HTTPS directa de la imagen de referencia."),
        instructions: z.string().min(1).max(2000).describe("Edición que debe realizarse sobre la imagen."),
      }),
    },
    async ({ image_url, instructions }) => {
      if (process.env.MCP_EDIT_ENABLED !== "true") {
        return {
          content: [{
            type: "text",
            text: "El puente MCP está autenticado, pero la edición directa está protegida. Activá MCP_EDIT_ENABLED=true en Vercel para habilitar las acciones de escritura.",
          }],
        };
      }

      if (!process.env.REPLICATE_API_TOKEN) {
        return { content: [{ type: "text", text: "REPLICATE_API_TOKEN no está configurado." }] };
      }

      const source = await fetch(image_url);
      if (!source.ok) {
        throw new Error(`No se pudo descargar la imagen de referencia (${source.status}).`);
      }

      const sourceType = source.headers.get("content-type") || "image/jpeg";
      const sourceBytes = Buffer.from(await source.arrayBuffer());
      const sourceFile = new File([sourceBytes], "reference-image", { type: sourceType });

      const output = await replicate.run("black-forest-labs/flux-kontext-pro", {
        input: {
          prompt: `${instructions.trim()}${EDITING_GUARDRAIL}`,
          input_image: sourceFile,
          aspect_ratio: "match_input_image",
          output_format: "png",
        },
      });

      const values = Array.isArray(output) ? output : [output];
      for (const value of values) {
        const image = await outputToImageContent(value);
        if (image) {
          return {
            content: [
              { type: "text", text: "Edición realizada con FLUX Kontext Pro." },
              image,
            ],
          };
        }
      }

      return { content: [{ type: "text", text: "Replicate no devolvió una imagen utilizable." }] };
    },
  );
});

const protectedHandler = requireMcpAuth(
  auth,
  (request) => mcpHandler(request),
  {
    resource,
    requiredScopes: ["mcp:edit"],
    challengeScopes: ["mcp:edit"],
  },
);

export const POST = protectedHandler;
