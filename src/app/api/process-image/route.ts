import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN || '' });
export const runtime = 'nodejs';
export const maxDuration = 300;

const EDITING_GUARDRAIL = `\n\nEditing rules: Preserve the subject's identity, face, facial structure, body proportions, pose, framing, camera angle, lighting, and background unless the user explicitly asks to change them. Change only the element the user requested. If the request is about clothing, modify only the clothing and do not reinterpret the image as a product photo, mannequin, flat lay, or different person. Keep the result photorealistic and visually consistent with the source image.`;

function isSensitiveContentError(message: string) {
  return /flagged as sensitive|sensitive content|E005|input or output was flagged/i.test(message);
}

async function getOutputUrl(value: unknown): Promise<string | null> {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (value instanceof URL) return value.toString();
  if (!value || typeof value !== 'object') return null;

  const candidate = value as { url?: unknown };
  if (candidate.url instanceof URL) return candidate.url.toString();
  if (typeof candidate.url === 'string' && /^https?:\/\//i.test(candidate.url)) return candidate.url;
  if (typeof candidate.url === 'function') {
    const result = await (candidate.url as () => Promise<unknown> | unknown)();
    if (result instanceof URL) return result.toString();
    if (typeof result === 'string' && /^https?:\/\//i.test(result)) return result;
  }

  return null;
}

async function outputToDataUrl(value: unknown): Promise<string | null> {
  const url = await getOutputUrl(value);
  if (!url) return null;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo descargar el resultado generado (${response.status})`);
  const contentType = response.headers.get('content-type') || 'image/png';
  const buffer = Buffer.from(await response.arrayBuffer());
  return `data:${contentType};base64,${buffer.toString('base64')}`;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');
    const instructions = formData.get('instructions');
    if (!(file instanceof File)) return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    if (typeof instructions !== 'string' || !instructions.trim()) return NextResponse.json({ error: 'No instructions provided' }, { status: 400 });
    if (!process.env.REPLICATE_API_TOKEN) return NextResponse.json({ error: 'Replicate API token not configured' }, { status: 500 });

    const imageSize = file.size;
    const finalInstructions = `${instructions.trim()}${EDITING_GUARDRAIL}`;
    console.log('User prompt:', instructions);
    console.log('Image size (bytes):', imageSize);
    console.log('Calling FLUX Kontext Pro via Replicate...');

    const output = await replicate.run('black-forest-labs/flux-kontext-pro', {
      input: { prompt: finalInstructions, input_image: file, aspect_ratio: 'match_input_image', output_format: 'png' }
    });

    const values = Array.isArray(output) ? output : [output];
    let generatedImage: string | null = null;
    for (const value of values) {
      generatedImage = await outputToDataUrl(value);
      if (generatedImage) break;
    }
    if (!generatedImage) {
      console.error('Replicate output had no recognized image URL. Output type:', typeof output, 'Output:', output);
      return NextResponse.json({ error: 'Replicate returned no usable image' }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: 'Image processed successfully by FLUX Kontext Pro', originalImageSize: imageSize, instructions, responseText: null, generatedImage });
  } catch (error) {
    console.error('Error processing with Replicate:', error);
    const message = error instanceof Error ? error.message : 'Unknown Replicate error';
    if (isSensitiveContentError(message)) return NextResponse.json({ error: 'Replicate bloqueó esta imagen o el resultado por su filtro de contenido sensible. Probá con otra imagen o una edición menos sensible.', errorKind: 'SENSITIVE_CONTENT' }, { status: 422 });
    const status = /401|unauthorized|authentication|token/i.test(message) ? 401 : 500;
    return NextResponse.json({ error: message, errorKind: status === 401 ? 'AUTHENTICATION' : 'PROVIDER_ERROR' }, { status });
  }
}
