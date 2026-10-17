"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Mascot from "./Mascot";
import Button from "./ui/Button";
import { api } from "@/lib/api-client";

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
      await api("/api/login", { method: "POST", body: { password }, fallback: "Login failed" });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <form onSubmit={submit} className="card w-full max-w-sm p-8 text-center">
        <div className="mb-4 flex justify-center">
          <Mascot size={88} />
        </div>
        <h1 className="font-display text-xl">TUBEBOX</h1>
        <p className="mb-6 text-sm text-muted">
          members only (that&apos;s you)
        </p>
        <input
          type="password"
          autoFocus
          className="field mb-4 h-10 w-full px-3"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p className="mb-3 text-sm font-semibold text-danger">{error}</p>
        )}
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={!password}
          busy={busy}
          busyLabel="Checking…"
        >
          Let me in
        </Button>
      </form>
    </div>
  );
}
