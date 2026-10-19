"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/** "Start from any picture": pick a photo, painting or screenshot and it becomes a new world. */
export function UploadButton() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [listed, setListed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    const form = new FormData();
    form.set("image", file);
    if (listed) form.set("public", "on");
    const res = await fetch("/api/worlds", { method: "POST", body: form }).catch(() => null);
    const data = await res?.json().catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      setError(data?.error ?? "Upload failed. Try again.");
      return;
    }
    router.push(`/w/${data.worldId}`);
  }

  return (
    <div className="rounded-3xl bg-white/[0.06] p-4 ring-1 ring-white/10">
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-glow py-4 text-base font-semibold text-ink active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? "Uploading…" : "Start from any picture"}
      </button>
      <label className="mt-3 flex items-center gap-2 text-sm text-paper/70">
        <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} className="h-4 w-4 accent-[#ffd98a]" />
        List it on the home page for others
      </label>
      <p className="mt-2 text-xs text-paper/45">A photo, a painting, a screenshot. It becomes the first scene of a new world with its own link. Costs 1 credit.</p>
      {error && <p className="mt-2 text-sm text-red-200">{error}</p>}
    </div>
  );
}
