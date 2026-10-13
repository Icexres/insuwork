"use client";
// Freelancer forms that need client state. No wallet code here, ever (rule 1).
import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import en from "@insuwork/shared/i18n/en.json";
import { Button, Field, FieldRow, Notice } from "@/components/ui";

/** Prints only the `.print-area` (income statement); see globals.css. */
export function PrintButton({ children }: { children: string }) {
  return <Button onClick={() => window.print()}>{children}</Button>;
}

/** Step 5: MOCK partner KYC → freelancer_ref. Only bank name + last 4 digits are kept (rule 2). */
export function KycForm() {
  const t = en.freelancer.verify;
  const router = useRouter();
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [state, setState] = useState<{ busy?: boolean; error?: string }>({});
  const submit = async () => {
    setState({ busy: true });
    const r = await fetch("/api/mock-partner/kyc", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bankName: bank, accountNumber: account }),
    });
    if (!r.ok) return setState({ error: (await r.json()).error });
    router.refresh();
  };
  return (
    <>
      <Notice title={t.mockTitle}>{t.mockBody}</Notice>
      <FieldRow min="15rem">
        <Field label={t.bank} value={bank} onChange={setBank} placeholder="Nabil Bank" />
        <Field label={t.account} value={account} onChange={setAccount} inputMode="numeric" mono />
      </FieldRow>
      {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
      <div className="flex justify-end"><Button large primary icon="arrow-right" disabled={state.busy} onClick={submit}>{t.submit}</Button></div>
    </>
  );
}

type Msg = { role: string; content: string };

/** T-27 interview chat. Advisory only (rule 9). */
export function TriageChat({ initial, sessionId: initialId, canStart, maxTurns, name }: {
  initial: Msg[]; sessionId: string | null; canStart: boolean; maxTurns: number; name: string;
}) {
  const t = en.freelancer.triage;
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [sessionId, setSessionId] = useState(initialId);
  const [draft, setDraft] = useState("");
  const [state, setState] = useState<{ busy?: boolean; error?: string; done?: boolean }>({});
  const end = useRef<HTMLDivElement>(null);
  const turn = messages.filter((m) => m.role === "user").length;
  const section = t.sectionList[Math.min(t.sectionList.length - 1, Math.floor((turn / maxTurns) * t.sectionList.length))];

  const call = async (path: string, body: object) => {
    setState({ busy: true });
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    if (!r.ok) {
      setState({ error: j.error });
      return null;
    }
    return j;
  };
  const start = async () => {
    const j = await call("/api/triage/start", {});
    if (!j) return;
    setSessionId(j.sessionId);
    setMessages([{ role: "assistant", content: j.message }]);
    setState({});
  };
  const send = async () => {
    const content = draft.trim();
    if (!content || !sessionId) return;
    setMessages((m) => [...m, { role: "user", content }]);
    setDraft("");
    const j = await call("/api/triage/message", { sessionId, content });
    if (!j) return;
    setMessages((m) => [...m, { role: "assistant", content: j.message }]);
    setState({ done: j.done, error: j.flagged ? t.flagged : undefined });
    if (j.done) router.refresh();
    end.current?.scrollIntoView({ behavior: "smooth" });
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!sessionId) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p className="text-sm leading-[1.55] text-muted">{canStart ? t.startBody : t.cannotStart}</p>
        {canStart ? (
          <Button large primary icon="arrow-right" disabled={state.busy} onClick={start}>{t.start}</Button>
        ) : (
          <Link href="/freelancer" className="text-[13px] text-fg underline underline-offset-[3px] hover:text-bright">{en.freelancer.flow.finishProfile}</Link>
        )}
        {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
      </div>
    );
  }
  const progress = Math.min(100, (turn / maxTurns) * 100);
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between gap-3 font-mono text-[11px] text-muted">
          <span>{section.toUpperCase()}</span>
          <span>{`${turn} / ~${maxTurns}`}</span>
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} className="h-[3px] overflow-hidden rounded-sm bg-line">
          <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <div role="log" aria-live="polite" className="-mr-1 flex max-h-[min(58vh,560px)] flex-col gap-3 overflow-y-auto overscroll-contain pr-1">
        {messages.map((m, i) => (
          <div key={i} className={`flex max-w-[88%] flex-col gap-1.5 rounded-[10px] px-4 py-3.5 shadow-[inset_0_0_0_0.5px_theme(colors.line)] ${m.role === "assistant" ? "self-start bg-canvas" : "self-end bg-raised"}`}>
            <span className="font-mono text-[10px] text-faint">{m.role === "assistant" ? t.interviewer.replace("{section}", section.toUpperCase()) : name.toUpperCase()}</span>
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">{m.content}</p>
          </div>
        ))}
        {state.busy && <p className="font-mono text-[11px] text-faint">…</p>}
        <div ref={end} />
      </div>
      {!state.done && (
        <div className="flex flex-col gap-2.5 border-t-[0.5px] border-line pt-3">
          <div onKeyDown={onKey}><Field label={t.answer} value={draft} onChange={setDraft} rows={3} /></div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-faint">{t.hint}</p>
            <Button primary icon="arrow-up" disabled={state.busy || !draft.trim()} onClick={send}>{t.send}</Button>
          </div>
        </div>
      )}
      {state.done && (
        <Notice tone="positive" title={t.doneTitle}>
          {t.doneBody}{" "}
          <Link href="/freelancer" className="text-accent hover:underline">{en.freelancer.flow.addResponse}</Link>
        </Notice>
      )}
      {state.error && <p role="alert" className="text-xs text-danger">{state.error}</p>}
    </>
  );
}
