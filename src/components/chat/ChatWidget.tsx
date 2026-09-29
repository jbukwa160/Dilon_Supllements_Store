"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, LoaderCircle, MessageCircle, SendHorizontal, X } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import type { PublicChatConfig } from "@/lib/settings-types";
import { stripLang } from "@/lib/links";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { LogoMark } from "@/components/layout/Logo";
import { MessageText, formatChatTime } from "./MessageText";

// The chat bubble (bottom right) and its panel (full screen on phones, a 380 px card from `sm`). Polls /api/chat every
// 3 s while open and every 20 s while closed once this browser has a conversation (for the unread badge); pauses in
// background tabs. Pages with a sticky bar at the bottom (e.g. the product page on phones) can lift the bubble with
// the CSS variable --chat-offset (e.g. `--chat-offset: 4.5rem` on <html> while the bar is shown).

type Message = { id: number; sender: "visitor" | "admin"; body: string; createdAt: string; failed?: boolean };
type PollResponse = { online: boolean; conversation: boolean; messages: Message[]; unread: number; hasContact?: boolean };
/** Success: { message: Message, … }; failure: { error: code, message: text in the visitor's language }. */
type SendResponse = { message?: Message | string; error?: string; fresh?: boolean; hasContact?: boolean };

const STARTED_KEY = "sp_chat_started"; // this browser has a conversation, so check for replies
const MAX = 1000;
const BOTTOM = "calc(max(1rem, env(safe-area-inset-bottom)) + var(--chat-offset, 0px))";
/**
 * Cart and checkout (and the order confirmation): the main buttons ("Поръчай", "Поръчка със задължение за плащане")
 * span the full width on phones / tablets and fill the right-hand summary column on desktop, which reaches the
 * bubble's corner on screens narrower than ~1416 px. On these pages the bubble is therefore only shown on wide
 * screens (≥ 1440 px) — or when a reply is waiting, so it is never missed.
 */
const CHECKOUT_PAGE = /^\/(kolichka|porachka)(\/|$)/;

const storage = {
  get(k: string) {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      localStorage.setItem(k, v);
    } catch {}
  },
};

async function readJson<T extends object>(r: Response): Promise<Partial<T>> {
  return (await r.json().catch(() => ({}))) as Partial<T>;
}

export function ChatWidget({ config }: { config: PublicChatConfig }) {
  const lang = useLang();
  const t = useDict().chat;
  const pathname = usePublicPathname();
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [online, setOnline] = useState(false);
  const [unread, setUnread] = useState(0);
  const [hasContact, setHasContact] = useState(true);
  // "Не сега" only lasts while the chat stays open: after it is opened again (or a new chat starts) and the visitor
  // writes, the phone / e-mail question comes back until they leave one.
  const [wroteNow, setWroteNow] = useState(false);
  const [skippedNow, setSkippedNow] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastId = useRef(0);
  const tempId = useRef(0); // negative ids for messages still being sent
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bubbleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Read after mount: localStorage isn't available while the page is rendered on the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStarted(storage.get(STARTED_KEY) === "1");
  }, []);

  const openChat = () => {
    setWroteNow(false);
    setSkippedNow(false);
    setOpen(true);
  };
  const closeChat = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => bubbleRef.current?.focus());
  }, []);

  const merge = useCallback((incoming: Message[]) => {
    if (!incoming.length) return;
    setMessages((cur) => {
      const known = new Set(cur.map((m) => m.id));
      const add = incoming.filter((m) => !known.has(m.id));
      return add.length ? [...cur, ...add] : cur;
    });
    lastId.current = Math.max(lastId.current, ...incoming.map((m) => m.id));
  }, []);

  const poll = useCallback(
    async (read: boolean) => {
      try {
        const r = await fetch(`/api/chat?lang=${lang}&after=${lastId.current}${read ? "&read=1" : ""}`, { cache: "no-store" });
        if (!r.ok) return;
        const d = (await r.json()) as PollResponse;
        setOnline(d.online);
        setUnread(read ? 0 : d.unread);
        if (typeof d.hasContact === "boolean") setHasContact(d.hasContact);
        if (d.conversation) merge(d.messages);
      } catch {
        // Offline for a moment: the next tick tries again.
      }
    },
    [merge, lang],
  );

  // Open: every 3 s. Closed with a conversation: every 20 s (for the unread badge). Paused in background tabs.
  useEffect(() => {
    if (!open && !started) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) await poll(open);
      if (!stopped) timer = setTimeout(tick, open ? 3000 : 20000);
    };
    tick();
    const onVisible = () => {
      if (!document.hidden) poll(open);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [open, started, poll]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [open, messages.length, hasContact]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChat();
    };
    document.addEventListener("keydown", onKey);
    // On phones the chat covers the page; keep the page from scrolling behind it.
    const small = window.matchMedia("(max-width: 639px)").matches;
    if (small) document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      if (small) document.documentElement.style.overflow = "";
    };
  }, [open, closeChat]);

  const send = async (raw: string) => {
    const body = raw.trim().slice(0, MAX);
    if (!body || sending) return;
    setSending(true);
    setError(null);
    const temp: Message = { id: --tempId.current, sender: "visitor", body, createdAt: new Date().toISOString() };
    setMessages((m) => [...m, temp]);
    setText("");
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, page: pathname, lang }),
      });
      const d = await readJson<SendResponse>(r);
      const saved = typeof d.message === "object" && d.message ? (d.message as Message) : null;
      if (!r.ok || !saved) throw new Error(typeof d.message === "string" ? d.message : t.sendFailed);
      setMessages((m) => m.map((x) => (x.id === temp.id ? saved : x)));
      lastId.current = Math.max(lastId.current, saved.id);
      if (typeof d.hasContact === "boolean") setHasContact(d.hasContact);
      if (d.fresh) setSkippedNow(false); // a new (or re-opened) conversation asks again
      setWroteNow(true);
      if (!started) {
        storage.set(STARTED_KEY, "1");
        setStarted(true);
      }
    } catch (e) {
      setMessages((m) => m.map((x) => (x.id === temp.id ? { ...x, failed: true } : x)));
      setError(e instanceof Error && e.message ? e.message : t.sendFailed);
      setText(body);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const showContact = config.askContact && wroteNow && !hasContact && !skippedNow;
  const tuckAway = CHECKOUT_PAGE.test(stripLang(pathname).path) && !open && !unread;
  const preview = !open && unread > 0 ? [...messages].reverse().find((m) => m.sender === "admin") : undefined;

  return (
    <>
      {preview ? (
        <button
          type="button"
          onClick={openChat}
          className="fixed right-4 z-40 max-w-[260px] animate-fade-in rounded-lg rounded-br-sm border border-line bg-surface px-4 py-3 text-left text-sm shadow-[var(--shadow-lift)] sm:right-6"
          style={{ bottom: `calc(${BOTTOM} + 4.5rem)` }}
        >
          <span className="block text-xs font-bold text-primary">{t.newReply}</span>
          <span className="line-clamp-2 font-medium">{preview.body}</span>
        </button>
      ) : null}

      <button
        ref={bubbleRef}
        type="button"
        onClick={() => (open ? closeChat() : openChat())}
        aria-expanded={open}
        aria-controls={open ? "sp-chat-panel" : undefined}
        aria-label={open ? t.close : unread ? fmt(t.openUnread, { n: unread }) : t.open}
        className={clsx(
          "fixed right-4 z-40 grid h-14 w-14 place-items-center rounded-pill bg-primary text-white shadow-[var(--shadow-overlay)] transition hover:scale-105 hover:bg-primary-700 motion-reduce:hover:scale-100 sm:right-6",
          open && "max-sm:hidden",
          tuckAway && "max-[1439px]:hidden",
        )}
        style={{ bottom: BOTTOM }}
      >
        {open ? <X className="h-6 w-6" aria-hidden /> : <MessageCircle className="h-7 w-7" aria-hidden />}
        {!open && unread ? (
          <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-pill border-2 border-surface bg-accent px-1 text-xs font-bold text-ink" aria-hidden>
            {unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id="sp-chat-panel"
          role="dialog"
          aria-label={config.title}
          className="fixed inset-0 z-[45] flex animate-fade-in flex-col bg-surface sm:inset-auto sm:right-6 sm:bottom-[calc(var(--chat-bottom)+5rem)] sm:h-[min(620px,calc(100dvh-8rem))] sm:w-[380px] sm:overflow-hidden sm:rounded-xl sm:border sm:border-line sm:shadow-[var(--shadow-overlay)]"
          style={{ "--chat-bottom": BOTTOM } as React.CSSProperties}
        >
          <header className="on-dark flex items-center gap-3 bg-ink px-4 py-3.5 text-white">
            <span className="relative">
              <LogoMark className="h-10 w-10" />
              <span className={clsx("absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-pill border-2 border-ink", online ? "bg-accent" : "bg-muted")} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold leading-tight">{config.title}</span>
              <span className="block text-xs font-medium text-white/70">{online ? t.online : t.offline}</span>
            </span>
            <button type="button" onClick={closeChat} className="grid h-10 w-10 place-items-center rounded-pill hover:bg-white/10" aria-label={t.close}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-canvas px-4 py-4" aria-live="polite" aria-relevant="additions">
            {config.greeting ? <Bubble sender="admin">{config.greeting}</Bubble> : null}
            {!online && config.offlineText ? <p className="px-2 text-center text-xs font-medium text-muted">{config.offlineText}</p> : null}
            {messages.map((m) => (
              <Bubble key={m.id} sender={m.sender} time={m.id > 0 ? formatChatTime(m.createdAt, lang) : undefined} failed={m.failed} failedLabel={t.notSent}>
                <MessageText text={m.body} lang={lang} />
              </Bubble>
            ))}
            {!messages.length && config.quickQuestions.length ? (
              <div className="flex flex-col items-end gap-2 pt-2" role="group" aria-label={t.quickQuestions}>
                {config.quickQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    disabled={sending}
                    className="rounded-lg border-[1.5px] border-primary/35 bg-surface px-3.5 py-2 text-left text-sm font-semibold text-primary-700 transition hover:bg-primary-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            ) : null}
            {showContact ? <ContactCard onSaved={() => setHasContact(true)} onSkip={() => setSkippedNow(true)} /> : null}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
            className="border-t border-line bg-surface p-3"
            style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
          >
            {error ? (
              <p className="mb-2 text-sm font-semibold text-sale" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(text);
                  }
                }}
                rows={1}
                maxLength={MAX}
                placeholder={t.placeholder}
                aria-label={t.messageLabel}
                className="field max-h-32 min-h-11 flex-1 resize-none !rounded-lg !py-2.5 [field-sizing:content]"
                autoFocus
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-pill bg-primary text-white transition hover:bg-primary-700 disabled:opacity-40"
                aria-label={t.send}
              >
                {sending ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden /> : <SendHorizontal className="h-5 w-5" aria-hidden />}
              </button>
            </div>
            {text.length > MAX - 100 ? <p className="mt-1 text-right text-xs text-muted">{fmt(t.charsLeft, { n: MAX - text.length })}</p> : null}
          </form>
        </div>
      ) : null}
    </>
  );
}

function Bubble({ sender, time, failed, failedLabel, children }: { sender: "visitor" | "admin"; time?: string; failed?: boolean; failedLabel?: string; children: React.ReactNode }) {
  const mine = sender === "visitor";
  return (
    <div className={clsx("flex flex-col", mine ? "items-end" : "items-start")}>
      <div
        className={clsx(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3.5 py-2 text-[0.95rem] leading-snug",
          mine ? "rounded-br-sm bg-primary text-white" : "rounded-bl-sm border border-line bg-surface text-ink",
          failed && "opacity-60",
        )}
      >
        {children}
      </div>
      {failed ? (
        <span className="mt-0.5 text-[0.7rem] font-bold text-sale">{failedLabel}</span>
      ) : time ? (
        <span className="mt-0.5 px-1 text-[0.7rem] text-muted">{time}</span>
      ) : null}
    </div>
  );
}

function ContactCard({ onSaved, onSkip }: { onSaved: () => void; onSkip: () => void }) {
  const lang = useLang();
  const t = useDict().chat;
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const save = async () => {
    if (!contact.trim()) {
      setError(t.errors.contactRequired);
      return;
    }
    setPending(true);
    setError(null);
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "contact", name, contact, lang }),
      });
      const d = await readJson<{ ok: boolean; error: string; message: string }>(r);
      if (!r.ok) throw new Error(typeof d.message === "string" ? d.message : t.errors.generic);
      setDone(true);
      setTimeout(onSaved, 1500);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t.errors.generic);
    } finally {
      setPending(false);
    }
  };
  if (done) {
    return (
      <p className="flex items-center justify-center gap-1.5 py-1 text-sm font-semibold text-success" role="status">
        <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> {t.contactThanks}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-line bg-surface p-3.5">
      <p className="text-sm font-bold">{t.contactQ}</p>
      <div className="mt-2.5 space-y-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          placeholder={t.namePlaceholder}
          aria-label={t.namePlaceholder}
          autoComplete="name"
          className="field !py-2 text-sm"
        />
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={100}
          placeholder={t.contactPlaceholder}
          aria-label={t.contactPlaceholder}
          aria-invalid={!!error || undefined}
          className="field !py-2 text-sm"
        />
      </div>
      {error ? (
        <p className="mt-1.5 text-xs font-semibold text-sale" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={save} disabled={pending} className="btn btn-primary h-10 min-h-0 flex-1 px-3 text-sm">
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : null} {t.contactSave}
        </button>
        <button type="button" onClick={onSkip} className="btn btn-ghost h-10 min-h-0 px-3 text-sm">
          {t.contactSkip}
        </button>
      </div>
    </div>
  );
}
