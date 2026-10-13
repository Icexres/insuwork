"use client";
// Freelancer forms that need client state. No wallet code here, ever (rule 1).
import { useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import en from "@insuwork/shared/i18n/en.json";
import { Button, Eyebrow, Field, Notice } from "@/components/ui";

/** Prints only the `.print-area` (income statement); see globals.css. */
export function PrintButton({ children }: { children: string }) {
  return <Button primary onClick={() => window.print()}>{children}</Button>;
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
      <div className="flex flex-wrap gap-4">
        <Field label={t.bank} value={bank} onChange={setBank} placeholder="Nabil Bank" />
        <Field label={t.account} value={account} onChange={setAccount} inputMode="numeric" />
      </div>
      <div><Button primary icon="arrow-right" disabled={state.busy} onClick={submit}>{t.submit}</Button></div>
      {state.error && <p role="alert" className="text-[13px] text-muted">{state.error}</p>}
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
      <>
        <p className="text-[13px] text-muted">{canStart ? t.startBody : t.cannotStart}</p>
        {canStart && <div><Button primary icon="arrow-right" disabled={state.busy} onClick={start}>{t.start}</Button></div>}
        {state.error && <p role="alert" className="text-[13px] text-muted">{state.error}</p>}
      </>
    );
  }
  return (
    <>
      <div className="h-[3px] w-full bg-line">
        <div className="h-full bg-fg" style={{ width: `${Math.min(100, (turn / maxTurns) * 100)}%` }} />
      </div>
      <Eyebrow>{`${section} · ${turn} / ~${maxTurns}`}</Eyebrow>
      {messages.map((m, i) => (
        <div key={i} className={`flex flex-col gap-2 rounded-md border-[0.5px] border-line p-[18px] ${m.role === "assistant" ? "bg-surface" : "bg-raised"}`}>
          <Eyebrow>{m.role === "assistant" ? t.interviewer.replace("{section}", section.toUpperCase()) : name.toUpperCase()}</Eyebrow>
          <p className="whitespace-pre-wrap text-sm leading-normal text-fg">{m.content}</p>
        </div>
      ))}
      <div ref={end} />
      {!state.done && (
        <>
          <div onKeyDown={onKey}><Field label={t.answer} value={draft} onChange={setDraft} rows={3} /></div>
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-muted">{t.hint}</p>
            <Button primary icon="arrow-up" disabled={state.busy || !draft.trim()} onClick={send}>{t.send}</Button>
          </div>
        </>
      )}
      {state.done && <Notice title={t.doneTitle}>{t.doneBody}</Notice>}
      {state.error && <p role="alert" className="text-[13px] text-muted">{state.error}</p>}
    </>
  );
}
