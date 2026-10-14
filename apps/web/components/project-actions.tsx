"use client";
// E-59 assistant buttons on a project page: draft the milestone plan, rank candidates. Advisory only (rule 9).
import { useState } from "react";
import { useRouter } from "next/navigation";
import en from "@insuwork/shared/i18n/en.json";
import { Button } from "@/components/ui";

export function AssistButton({ project, step, children, primary }: { project: string; step: "plan" | "match"; children: string; primary?: boolean }) {
  const t = en.client.projects;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async () => {
    setBusy(true);
    setError(undefined);
    const r = await fetch(`/api/projects/${step}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ project }) });
    if (!r.ok) setError(t.failed.replace("{error}", (await r.json().catch(() => ({}))).error ?? r.statusText));
    else router.refresh();
    setBusy(false);
  };
  return (
    <div className="flex flex-col items-start gap-2">
      <Button primary={primary} disabled={busy} onClick={run}>{busy ? t.working : children}</Button>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
