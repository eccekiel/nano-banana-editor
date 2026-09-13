"use client";

import { FormEvent, useEffect, useState } from "react";

export default function SignInPage() {
  const [callbackURL, setCallbackURL] = useState("/");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setCallbackURL(params.get("callbackURL") || params.get("redirectTo") || "/");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const endpoint = mode === "signin" ? "/api/auth/sign-in/email" : "/api/auth/sign-up/email";
    const body = mode === "signin"
      ? { email, password, callbackURL }
      : { email, password, name, callbackURL };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.message || data?.error?.message || "No se pudo iniciar sesión.");

      window.location.assign(data?.url || callbackURL || "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ocurrió un error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-2xl border p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-semibold">Sol Image Hub</h1>
          <p className="mt-1 text-sm opacity-70">Autorización segura para conectar ChatGPT con Sol.</p>
        </div>

        {mode === "signup" && (
          <label className="block text-sm">
            Nombre
            <input className="mt-1 w-full rounded-lg border p-3" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
        )}

        <label className="block text-sm">
          Email
          <input className="mt-1 w-full rounded-lg border p-3" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>

        <label className="block text-sm">
          Contraseña
          <input className="mt-1 w-full rounded-lg border p-3" type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error && <p className="rounded-lg border border-red-300 p-3 text-sm text-red-700">{error}</p>}

        <button disabled={busy} className="w-full rounded-lg border p-3 font-medium disabled:opacity-50">
          {busy ? "Procesando…" : mode === "signin" ? "Entrar" : "Crear cuenta"}
        </button>

        <button
          type="button"
          className="w-full text-sm underline"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Crear una cuenta nueva" : "Ya tengo una cuenta"}
        </button>
      </form>
    </main>
  );
}
