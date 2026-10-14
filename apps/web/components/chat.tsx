"use client";
// E-59 message composer. Shared by client, backer and freelancer inboxes: no wallet code here, ever (rule 1).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import en from "@insuwork/shared/i18n/en.json";
import { sendMessage } from "@/lib/message-actions";
import { Button } from "@/components/ui";

/** Enter sends, Shift+Enter breaks the line. Refreshes the thread every 8 s while the tab is visible. */
// ponytail: polling; switch to Supabase Realtime on `messages` if 8 s feels slow.
export function Composer({ conversation, draft = "" }: { conversation: string; draft?: string }) {
  const t = en.messages;
  const router = useRouter();
  const [text, setText] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const id = setInterval(() => document.visibilityState === "visible" && router.refresh(), 8000);
    return () => clearInterval(id);
  }, [router]);

  const send = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    const r = await sendMessage(conversation, text).catch((e: Error) => ({ error: e.message }));
    setBusy(false);
    if (r.error) return setError(t.error.replace("{error}", r.error));
    setText("");
    setError(undefined);
    router.refresh();
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex flex-col gap-2 border-t-[0.5px] border-line p-3">
      <div className="flex items-end gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={text.includes("\n") ? 5 : 2} maxLength={2000}
          aria-label={t.placeholder} placeholder={t.placeholder}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="min-w-0 flex-1 resize-y rounded-lg border-[0.5px] border-edge bg-canvas px-3 py-2.5 text-[15px] leading-normal text-bright placeholder:text-faint focus:border-muted focus:outline-none" />
        <Button primary submit disabled={busy || !text.trim()}>{busy ? t.sending : t.send}</Button>
      </div>
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </form>
  );
}
