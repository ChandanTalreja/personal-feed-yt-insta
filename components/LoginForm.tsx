"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Mascot from "./Mascot";

export default function LoginForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Login failed");
      }
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <form onSubmit={submit} className="nb w-full max-w-sm rounded-xl p-8 text-center">
        <div className="mb-4 flex justify-center">
          <Mascot size={88} />
        </div>
        <h1 className="font-display text-2xl">TUBEBOX</h1>
        <p className="mb-6 text-sm font-semibold text-neutral-600">
          members only (that&apos;s you)
        </p>
        <input
          type="password"
          autoFocus
          className="nb-input mb-4 w-full rounded-lg px-3 py-2"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="mb-3 text-sm font-bold text-[var(--accent)]">{error}</p>
        )}
        <button
          type="submit"
          className="nb-btn w-full rounded-lg px-4 py-2"
          disabled={busy || !password}
        >
          {busy ? "CHECKING…" : "LET ME IN"}
        </button>
      </form>
    </div>
  );
}
