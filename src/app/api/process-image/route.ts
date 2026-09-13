import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { GeminiSafetyBlockError, mapGeminiError } from '@/lib/gemini-errors';

const genAI = new GoogleGenAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || ''
});

export const runtime = 'nodejs';
export const maxDuration = 300;

const EDITING_GUARDRAIL = `\n\nEditing rules: Preserve the subject's identity, face, facial structure, body proportions, pose, framing, camera angle, lighting, and background unless the user explicitly asks to change them. Change only the element the user requested. If the request is about clothing, modify only the clothing and do not reinterpret the image as a product photo, mannequin, flat lay, or different person. Keep the result photorealistic and visually consistent with the source image.`;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const instructions = formData.get('instructions') as string;

    if (!file) return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    if (!instructions) return NextResponse.json({ error: 'No instructions provided' }, { status: 400 });
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json({ error: 'Google API key not configured' }, { status: 500 });
    }

    const imageBytes = await file.arrayBuffer();
    const imageSize = imageBytes.byteLength;
    const base64Data = Buffer.from(imageBytes).toString('base64');
    const finalInstructions = `${instructions.trim()}${EDITING_GUARDRAIL}`;

    console.log('User prompt:', instructions);
    console.log('Image size (bytes):', imageSize);
    console.log('Image name:', file.name);
    console.log('Image type:', file.type);
    console.log('Calling Nano Banana API...');

    const response = await genAI.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{
        parts: [
          { text: finalInstructions },
          { inlineData: { mimeType: file.type, data: base64Data } }
        ]
      }]
    });

    let generatedImageData: string | null = null;
    let responseText: string | null = null;

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.text) responseText = part.text;
      else if (part.inlineData) generatedImageData = part.inlineData.data ?? null;
    }

    const blockReason = response.promptFeedback?.blockReason;
    const finishReason = response.candidates?.[0]?.finishReason;
    const SAFETY_FINISH_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII']);
    if (!generatedImageData && (blockReason || (finishReason && SAFETY_FINISH_REASONS.has(finishReason)))) {
      throw new GeminiSafetyBlockError(String(blockReason ?? finishReason));
    }

    return NextResponse.json({
      success: true,
      message: 'Image processed successfully by Nano Banana',
      originalImageSize: imageSize,
      instructions,
      responseText,
      generatedImage: generatedImageData ? `data:image/png;base64,${generatedImageData}` : null
    });
  } catch (error) {
    console.error('Error processing with Nano Banana:', error);
    const { status, message, kind, retryDelaySeconds } = mapGeminiError(error);
    return NextResponse.json(
      { error: message, errorKind: kind, retryDelaySeconds },
      { status }
    );
  }
}
