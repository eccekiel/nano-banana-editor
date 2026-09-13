"use client";

import { useEffect, useState } from "react";

interface LibraryItem { id: string; image: string; prompt: string; createdAt: number; }
type MessageKind = "success" | "error" | "info";
interface StatusMessage { kind: MessageKind; text: string; }

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_LABEL = "4 MB";
const DB_NAME = "sol-image-editor";
const DB_VERSION = 1;
const STORE = "library";

const formatBytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;

function openLibrary(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function readLibrary(): Promise<LibraryItem[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as LibraryItem[]).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}
async function saveToLibrary(item: LibraryItem) {
  const db = await openLibrary();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
async function deleteFromLibrary(id: string) {
  const db = await openLibrary();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function SolMark() { return <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-400 via-teal-500 to-violet-600 text-lg shadow-md">✦</div>; }

export default function Home() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [instructions, setInstructions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [showLibrary, setShowLibrary] = useState(false);

  useEffect(() => { readLibrary().then(setLibrary).catch(console.error); }, []);

  const dataURLtoFile = async (source: string, filename: string) => {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`No se pudo recuperar la imagen (${response.status})`);
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type || "image/png" });
  };
  const addToLibrary = async (image: string, prompt: string) => {
    const item: LibraryItem = { id: crypto.randomUUID(), image, prompt, createdAt: Date.now() };
    await saveToLibrary(item);
    setLibrary(prev => [item, ...prev]);
  };
  const useLibraryImage = async (item: LibraryItem) => {
    try {
      const file = await dataURLtoFile(item.image, `sol_${item.id}.png`);
      setSelectedImage(item.image); setSelectedFile(file); setInstructions(""); setShowLibrary(false);
      setStatusMessage({ kind: "info", text: "Imagen recuperada de tu biblioteca." });
    } catch (error) { console.error(error); setStatusMessage({ kind: "error", text: "No se pudo abrir esa imagen." }); }
  };
  const removeLibraryImage = async (id: string) => { await deleteFromLibrary(id); setLibrary(prev => prev.filter(item => item.id !== id)); };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) { event.target.value = ""; setStatusMessage({ kind: "error", text: `La imagen pesa ${formatBytes(file.size)}. El máximo es ${MAX_IMAGE_LABEL}.` }); return; }
    setStatusMessage(null); setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = async e => { const image = e.target?.result as string; setSelectedImage(image); try { await addToLibrary(image, "Imagen original"); } catch (error) { console.error(error); } };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile || !instructions.trim()) { setStatusMessage({ kind: "error", text: "Elegí una imagen y escribí qué querés cambiar." }); return; }
    if (selectedFile.size > MAX_IMAGE_BYTES) { setStatusMessage({ kind: "error", text: "La imagen supera el límite de 4 MB." }); return; }
    setIsSubmitting(true); setStatusMessage({ kind: "info", text: "Sol está procesando la imagen…" });
    const prompt = instructions.trim();
    try {
      const formData = new FormData(); formData.append("image", selectedFile); formData.append("instructions", prompt);
      const response = await fetch("/api/process-image", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "No se pudo procesar la imagen.");
      if (!result.generatedImage || typeof result.generatedImage !== "string") throw new Error("La IA no devolvió una imagen visible.");
      setSelectedImage(result.generatedImage); setInstructions("");
      await addToLibrary(result.generatedImage, prompt);
      const newFile = await dataURLtoFile(result.generatedImage, `edited_${Date.now()}.png`);
      setSelectedFile(newFile);
      setStatusMessage({ kind: "success", text: "Listo. La nueva versión quedó guardada en tu biblioteca." });
    } catch (error) { console.error(error); setStatusMessage({ kind: "error", text: error instanceof Error ? error.message : "No se pudo completar la edición." }); }
    finally { setIsSubmitting(false); }
  };

  const newImage = () => { setSelectedImage(null); setSelectedFile(null); setInstructions(""); setStatusMessage(null); };

  return <main className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-emerald-50/30 text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-8">
      <div className="flex items-center gap-3"><SolMark /><div><div className="font-bold leading-tight">Sol Image Editor</div><div className="text-xs text-slate-500">Tu estudio de edición con IA</div></div></div>
      <button onClick={() => setShowLibrary(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50">📚 Biblioteca <span className="text-slate-400">{library.length}</span></button>
    </div></header>

    <section className="mx-auto max-w-4xl px-4 pb-4 pt-10 text-center sm:px-8 sm:pt-14">{!selectedImage ? <><p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Sol</p><h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">Editá una imagen como quieras</h1><p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">Subí una foto, indicá el cambio y FLUX hará la edición manteniendo la identidad y la escena.</p></> : <><h1 className="text-3xl font-bold">Tu imagen</h1><p className="mt-2 text-slate-500">Podés seguir editándola tantas veces como quieras.</p></>}</section>

    <section className="mx-auto max-w-4xl px-4 pb-28 sm:px-8"><div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-200/50 sm:p-8">
      {!selectedImage ? <label className="flex h-72 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-emerald-400 hover:bg-emerald-50/30"><div className="text-5xl">🖼️</div><div className="mt-4 text-lg font-semibold">Elegí una imagen</div><div className="mt-1 text-sm text-slate-500">PNG, JPG o GIF · hasta {MAX_IMAGE_LABEL}</div><input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} /></label> : <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl bg-slate-100 p-2"><img src={selectedImage} alt="Imagen seleccionada" className="mx-auto block max-h-[68vh] w-full rounded-xl object-contain" /></div>
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-3"><label htmlFor="instructions" className="block text-sm font-semibold text-slate-700">¿Qué querés cambiar?</label><input id="instructions" value={instructions} onChange={e => setInstructions(e.target.value)} disabled={isSubmitting} placeholder="Ej.: Cambiá el color de la ropa a bordó oscuro, sin modificar nada más." className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
          <div className="flex flex-wrap gap-2 text-xs"><button type="button" onClick={() => setInstructions("Cambiá solamente el color de la ropa a verde esmeralda, manteniendo intactos rostro, cuerpo, pose, fondo e iluminación.")} className="rounded-full bg-emerald-50 px-3 py-2 text-emerald-700">✨ Cambio de color</button><button type="button" onClick={() => setInstructions("Cambiá solamente la ropa por un conjunto elegante y delicado, manteniendo intactos rostro, cuerpo, pose, encuadre, fondo e iluminación.")} className="rounded-full bg-violet-50 px-3 py-2 text-violet-700">👗 Vestuario</button><button type="button" onClick={() => setInstructions("Hacé una variación de pose natural y fotográfica, manteniendo la misma persona, rostro, proporciones, vestuario, fondo e iluminación.")} className="rounded-full bg-sky-50 px-3 py-2 text-sky-700">📸 Pose</button></div>
          {statusMessage && <div className={`rounded-xl p-3 text-sm ${statusMessage.kind === "error" ? "border border-red-200 bg-red-50 text-red-700" : statusMessage.kind === "success" ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-slate-200 bg-slate-50 text-slate-600"}`}>{statusMessage.text}</div>}
          <button type="submit" disabled={isSubmitting || !instructions.trim()} className="w-full rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white shadow-lg transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">{isSubmitting ? "Procesando con FLUX…" : "✨ Editar con Sol"}</button>
        </form><button onClick={newImage} className="mx-auto block text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">Elegir otra imagen</button>
      </div>}
    </div></section>

    {showLibrary && <div className="fixed inset-0 z-50 bg-slate-950/40 p-3 sm:p-8" onClick={() => setShowLibrary(false)}><aside onClick={e => e.stopPropagation()} className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 p-5"><div><h2 className="text-xl font-bold">📚 Biblioteca</h2><p className="text-sm text-slate-500">Tus imágenes quedan guardadas en este dispositivo.</p></div><button onClick={() => setShowLibrary(false)} className="rounded-full bg-slate-100 px-3 py-2">✕</button></div><div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto p-4 sm:grid-cols-3">{library.length === 0 ? <div className="col-span-full py-20 text-center text-slate-500">Todavía no hay imágenes guardadas.</div> : library.map(item => <div key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"><button onClick={() => useLibraryImage(item)} className="block w-full"><img src={item.image} alt={item.prompt} className="aspect-square w-full object-cover" /></button><div className="p-2"><div className="truncate text-xs text-slate-600">{item.prompt}</div><div className="mt-2 flex justify-between gap-2"><button onClick={() => useLibraryImage(item)} className="text-xs font-semibold text-emerald-700">Usar</button><button onClick={() => removeLibraryImage(item.id)} className="text-xs text-red-500">Borrar</button></div></div></div>)}</div></aside></div>}
  </main>;
}
