"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export default function ConsentPage() {
  const [clientId, setClientId] = useState("cliente MCP");
  const [scope, setScope] = useState("");
  const [claims, setClaims] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setClientId(params.get("client_id") || "cliente MCP");
    setScope(params.get("scope") || "");
    setClaims(params.get("claims"));
  }, []);

  const requested = useMemo(() => scope.split(/\s+/).filter(Boolean), [scope]);

  async function decide(event: FormEvent, accept: boolean) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          accept,
          scope: accept ? scope : undefined,
          claims: claims ? JSON.parse(claims) : undefined,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || data?.error?.message || "No se pudo procesar el consentimiento.");
      if (data?.url) window.location.assign(data.url);
      else window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error.");
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Autorizar Sol Image Hub</h1>
        <p className="mt-2 text-sm opacity-70">
          ChatGPT solicita permiso para usar las herramientas de edición de imágenes de Sol.
        </p>

        <div className="mt-5 rounded-xl border p-4 text-sm">
          <p><strong>Cliente:</strong> {clientId}</p>
          <p className="mt-3"><strong>Permisos solicitados:</strong></p>
          <ul className="mt-2 list-disc pl-5">
            {requested.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>

        {error && <p className="mt-4 rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</p>}

        <div className="mt-5 flex gap-3">
          <form onSubmit={(e) => decide(e, false)} className="flex-1">
            <button disabled={busy} className="w-full rounded-lg border p-3 disabled:opacity-50">Rechazar</button>
          </form>
          <form onSubmit={(e) => decide(e, true)} className="flex-1">
            <button disabled={busy} className="w-full rounded-lg border p-3 font-medium disabled:opacity-50">Autorizar</button>
          </form>
        </div>
      </div>
    </main>
  );
}
