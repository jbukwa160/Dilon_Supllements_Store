"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import {
  ArrowLeft,
  Archive,
  Check,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  Mail,
  MessagesSquare,
  Package,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  SendHorizontal,
  Settings2,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { Lang } from "@/i18n/config";
import type { ChatConversation, ChatFilter, ChatMessage, ChatSummary } from "@/lib/chat";
import type { ChatSettings } from "@/lib/settings-types";
import { deleteChatAction, saveChatSettingsAction, sendChatReplyAction, setChatStatusAction } from "@/app/admin/_actions/chat";
import { findProductsAction, type PickerProduct } from "@/app/admin/_actions/product-search";
import { MessageText, formatChatTime } from "@/components/chat/MessageText";
import { CHAT_UNREAD_EVENT } from "./AdminShell";
import { Card, Field, L10nInput, Toggle, useEditor, type SaveStatus } from "./ui";

type Data = { unread: number; conversations: ChatSummary[]; conversation: ChatConversation | null; messages: ChatMessage[] };

const FILTERS: Record<ChatFilter, string> = { open: "Отворени", closed: "Приключени", all: "Всички" };
const LANG_BADGE: Record<Lang, { label: string; title: string }> = {
  bg: { label: "БГ", title: "Пише от българската версия на сайта" },
  en: { label: "EN", title: "Пише от английската версия на сайта — отговорете на английски" },
};

const visitorName = (c: Pick<ChatConversation, "id" | "name" | "customer">) => c.customer?.name || c.name || `Посетител №${c.id}`;

function device(ua: string | null): string {
  if (!ua) return "";
  const mobile = /Mobi|Android|iPhone|iPad/i.test(ua) ? "телефон" : "компютър";
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return browser ? `${mobile}, ${browser}` : mobile;
}

function ContactLink({ contact }: { contact: string }) {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
    return (
      <a href={`mailto:${contact}`} className="inline-flex items-center gap-1 font-bold text-sky hover:underline">
        <Mail className="h-4 w-4" /> {contact}
      </a>
    );
  }
  if (/^[+\d][\d\s/()-]{5,}$/.test(contact)) {
    return (
      <a href={`tel:${contact.replace(/[\s/()-]/g, "")}`} className="inline-flex items-center gap-1 font-bold text-sky hover:underline">
        <Phone className="h-4 w-4" /> {contact}
      </a>
    );
  }
  return <span className="font-bold">{contact}</span>;
}

function LangBadge({ lang }: { lang: Lang }) {
  return (
    <span
      className={clsx("shrink-0 rounded-md px-1.5 py-0.5 text-[0.65rem] font-black", lang === "en" ? "bg-grape-soft text-grape" : "bg-canvas text-ink-soft")}
      title={LANG_BADGE[lang].title}
    >
      {LANG_BADGE[lang].label}
    </span>
  );
}

export function ChatInbox({ initial, initialSettings, initialId }: { initial: Data; initialSettings: ChatSettings; initialId: number | null }) {
  const [filter, setFilter] = useState<ChatFilter>("open");
  const [conversations, setConversations] = useState(initial.conversations);
  const [selected, setSelected] = useState<number | null>(initialId);
  const [conversation, setConversation] = useState<ChatConversation | null>(initial.conversation);
  const [messages, setMessages] = useState<ChatMessage[]>(initial.messages);
  const [showSettings, setShowSettings] = useState(false);
  const lastId = useRef(initial.messages.at(-1)?.id ?? 0);
  // What is on screen right now, for the polling callback.
  const current = useRef({ filter, selected });
  useEffect(() => {
    current.current = { filter, selected };
  }, [filter, selected]);

  const refresh = useCallback(async () => {
    const { filter, selected } = current.current;
    const q = new URLSearchParams({ filter });
    if (selected) {
      q.set("c", String(selected));
      q.set("after", String(lastId.current));
    }
    try {
      const r = await fetch(`/admin/chat/data?${q}`, { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as Data;
      // Ignore answers to an older request (another conversation was opened meanwhile).
      if (current.current.selected !== selected || current.current.filter !== filter) return;
      setConversations(d.conversations);
      window.dispatchEvent(new CustomEvent(CHAT_UNREAD_EVENT, { detail: d.unread }));
      if (selected) {
        setConversation(d.conversation);
        if (d.messages.length) {
          setMessages((cur) => {
            const known = new Set(cur.map((m) => m.id));
            return [...cur, ...d.messages.filter((m) => !known.has(m.id))];
          });
          lastId.current = Math.max(lastId.current, ...d.messages.map((m) => m.id));
        }
      }
    } catch {
      // Connection hiccup: the next tick tries again.
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (!document.hidden) await refresh();
      if (!stopped) timer = setTimeout(tick, 3000);
    };
    timer = setTimeout(tick, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  const open = (id: number | null) => {
    setSelected(id);
    setConversation(null);
    setMessages([]);
    lastId.current = 0;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("c", String(id));
    else url.searchParams.delete("c");
    window.history.replaceState(null, "", url);
    current.current = { filter, selected: id };
    refresh();
  };

  const changeFilter = (f: ChatFilter) => {
    setFilter(f);
    current.current = { filter: f, selected };
    refresh();
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-2 rounded-full bg-mint-soft px-3.5 py-1.5 text-sm font-bold text-mint">
          <span className="h-2.5 w-2.5 rounded-full bg-mint" /> Вие сте на линия — посетителите виждат, че отговаряте веднага
        </span>
        <button type="button" onClick={() => setShowSettings((v) => !v)} className="btn btn-ghost ml-auto h-10 px-4 text-sm" aria-expanded={showSettings}>
          <Settings2 className="h-4 w-4" /> Настройки на чата
        </button>
      </div>

      {showSettings ? <ChatSettingsCard initial={initialSettings} onClose={() => setShowSettings(false)} /> : null}

      <div className="grid overflow-hidden rounded-3xl border border-line bg-white lg:h-[calc(100vh-15rem)] lg:min-h-[540px] lg:grid-cols-[320px_1fr]">
        {/* conversation list */}
        <div className={clsx("flex min-h-0 flex-col border-line lg:border-r", selected && "max-lg:hidden")}>
          <div className="flex gap-1 border-b border-line p-2" role="tablist" aria-label="Филтър">
            {(Object.keys(FILTERS) as ChatFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => changeFilter(f)}
                className={clsx("flex-1 rounded-xl px-2 py-2 text-sm font-extrabold transition", filter === f ? "bg-ink text-white" : "text-ink-soft hover:bg-canvas")}
              >
                {FILTERS[f]}
              </button>
            ))}
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto max-lg:max-h-[70vh]">
            {conversations.length ? (
              conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => open(c.id)}
                    aria-current={selected === c.id ? "true" : undefined}
                    className={clsx("flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-canvas", selected === c.id && "bg-sky-soft hover:bg-sky-soft")}
                  >
                    <span className={clsx("grid h-10 w-10 shrink-0 place-items-center rounded-full font-black", c.unreadAdmin ? "bg-brand text-white" : "bg-canvas text-ink-soft")}>
                      {visitorName(c).slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={clsx("truncate", c.unreadAdmin ? "font-black" : "font-bold")}>{visitorName(c)}</span>
                        <LangBadge lang={c.locale} />
                        <span className="ml-auto shrink-0 text-xs text-muted">{formatChatTime(c.lastMessageAt)}</span>
                      </span>
                      <span className={clsx("line-clamp-2 text-sm", c.unreadAdmin ? "font-bold text-ink" : "text-ink-soft")}>
                        {c.lastMessage?.sender === "admin" ? "Вие: " : ""}
                        {c.lastMessage?.body}
                      </span>
                    </span>
                    {c.unreadAdmin ? (
                      <span className="mt-1 grid h-6 min-w-6 place-items-center rounded-full bg-brand px-1.5 text-xs font-black text-white" aria-label={`${c.unreadAdmin} непрочетени`}>
                        {c.unreadAdmin}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))
            ) : (
              <li className="p-8 text-center text-sm text-muted">
                {filter === "open" ? "Няма отворени разговори. Когато посетител пише в чата, ще го видите тук." : "Няма разговори."}
              </li>
            )}
          </ul>
        </div>

        {/* open conversation */}
        <div className={clsx("flex min-h-0 flex-col", !selected && "max-lg:hidden")}>
          {selected ? (
            <Conversation
              key={selected}
              id={selected}
              conversation={conversation}
              messages={messages}
              onBack={() => open(null)}
              onSent={(m) => {
                setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
                lastId.current = Math.max(lastId.current, m.id);
                refresh();
              }}
              onChanged={refresh}
              onDeleted={() => open(null)}
            />
          ) : (
            <div className="grid flex-1 place-items-center p-10 text-center text-muted">
              <div>
                <MessagesSquare className="mx-auto h-12 w-12 text-line" />
                <p className="mt-3 font-bold">Изберете разговор отляво</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Conversation({
  id,
  conversation: c,
  messages,
  onBack,
  onSent,
  onChanged,
  onDeleted,
}: {
  id: number;
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  onBack: () => void;
  onSent: (m: ChatMessage) => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [picker, setPicker] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  const send = () => {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    start(async () => {
      const r = await sendChatReplyAction(id, body);
      if (r.message) {
        setText("");
        onSent(r.message);
      } else setError(r.error ?? "Отговорът не беше изпратен.");
      inputRef.current?.focus();
    });
  };

  const act = (fn: () => Promise<{ ok?: boolean; error?: string }>, after: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) after();
      else setError(r.error ?? "Грешка");
    });

  const insert = (s: string) => {
    const el = inputRef.current;
    const pos = el?.selectionStart ?? text.length;
    const before = text.slice(0, pos);
    const next = `${before}${before && !/\s$/.test(before) ? " " : ""}${s} ${text.slice(pos)}`;
    setText(next);
    setPicker(false);
    requestAnimationFrame(() => el?.focus());
  };

  if (!c) {
    return (
      <div className="grid flex-1 place-items-center p-10">
        <LoaderCircle className="h-6 w-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3">
        <button type="button" onClick={onBack} className="grid h-9 w-9 place-items-center rounded-full hover:bg-canvas lg:hidden" aria-label="Назад към разговорите">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-black">{visitorName(c)}</h2>
            <LangBadge lang={c.locale} />
            {c.status === "closed" ? <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-bold text-muted">Приключен</span> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-soft">
            {c.customer ? (
              <Link href={`/admin/poruchki/klienti/${c.customer.id}`} className="inline-flex items-center gap-1 font-bold text-sky hover:underline">
                <UserRound className="h-4 w-4" /> Регистриран клиент · {c.customer.email} →
              </Link>
            ) : null}
            {c.contact ? <ContactLink contact={c.contact} /> : !c.customer ? <span className="text-muted">Не е оставил контакт</span> : null}
            {c.page ? (
              <a href={c.page} target="_blank" rel="noopener" className="inline-flex max-w-full items-center gap-1 truncate hover:text-brand">
                <ExternalLink className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Пише от: {c.page}</span>
              </a>
            ) : null}
            <span className="text-muted">
              Започнат {formatChatTime(c.createdAt)}
              {device(c.userAgent) ? ` · ${device(c.userAgent)}` : ""}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {c.status === "open" ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => act(() => setChatStatusAction(id, "closed"), onChanged)}
              className="btn btn-ghost h-9 px-3 text-sm"
              title="Премества разговора в „Приключени“. Ако посетителят пише отново, ще се отвори пак."
            >
              <Archive className="h-4 w-4" /> Приключи
            </button>
          ) : (
            <button type="button" disabled={pending} onClick={() => act(() => setChatStatusAction(id, "open"), onChanged)} className="btn btn-ghost h-9 px-3 text-sm">
              <RotateCcw className="h-4 w-4" /> Отвори отново
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (confirm("Да изтрия ли целия разговор? Това не може да се върне.")) act(() => deleteChatAction(id), onDeleted);
            }}
            className="btn btn-ghost h-9 px-3 text-sm text-brand"
            aria-label="Изтрий разговора"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto bg-canvas px-4 py-4 max-lg:h-[55vh]" aria-live="polite">
        {messages.map((m) => {
          const mine = m.sender === "admin";
          return (
            <div key={m.id} className={clsx("flex flex-col", mine ? "items-end" : "items-start")}>
              <div
                className={clsx(
                  "max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 leading-snug",
                  mine ? "rounded-br-md bg-ink text-white" : "rounded-bl-md border border-line bg-white",
                )}
              >
                <MessageText text={m.body} />
              </div>
              <span className="mt-0.5 px-1 text-[0.7rem] text-muted">
                {mine ? "Вие · " : ""}
                {formatChatTime(m.createdAt)}
              </span>
            </div>
          );
        })}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="relative border-t border-line p-3"
      >
        {picker ? (
          <ProductLinkPicker onPick={(p) => insert(`${window.location.origin}${c.locale === "en" ? "/en" : ""}/produkt/${p.slug}`)} onClose={() => setPicker(false)} />
        ) : null}
        {error ? (
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-brand" role="alert">
            <CircleAlert className="h-4 w-4" /> {error}
          </p>
        ) : null}
        {c.locale === "en" ? <p className="mb-2 text-xs font-bold text-grape">Посетителят разглежда сайта на английски — отговорете на английски.</p> : null}
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setPicker((v) => !v)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-line text-ink-soft hover:border-ink"
            title="Вмъкни линк към продукт"
            aria-label="Вмъкни линк към продукт"
            aria-expanded={picker}
          >
            <Package className="h-5 w-5" />
          </button>
          <textarea
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 1000))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            rows={2}
            lang={c.locale}
            placeholder="Напишете отговор… (Enter изпраща, Shift+Enter за нов ред)"
            aria-label="Отговор"
            className="field min-h-11 flex-1 resize-y"
          />
          <button type="submit" disabled={pending || !text.trim()} className="btn btn-primary h-11 px-5 !shadow-none">
            {pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" />}
            <span className="max-sm:hidden">Изпрати</span>
          </button>
        </div>
        {!c.contact && !c.customer ? (
          <p className="mt-2 text-xs text-muted">Посетителят вижда отговора веднага, ако чатът му е отворен, или следващия път, когато отвори сайта от същия браузър.</p>
        ) : null}
      </form>
    </>
  );
}

function ProductLinkPicker({ onPick, onClose }: { onPick: (p: PickerProduct) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ q: string; items: PickerProduct[] } | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => start(async () => setResults({ q: term, items: await findProductsAction(term) })), 250);
    return () => clearTimeout(t);
  }, [q]);
  const showing = results && results.q === q.trim() && q.trim().length >= 2 ? results.items : [];
  return (
    <div className="absolute bottom-full left-3 right-3 z-10 mb-2 rounded-2xl border border-line bg-white p-3 shadow-[var(--shadow-lift)]">
      <div className="flex items-center gap-2">
        <label className="flex flex-1 items-center rounded-xl border-2 border-line px-3 focus-within:border-sky">
          {pending ? <LoaderCircle className="h-4 w-4 animate-spin text-muted" /> : <Search className="h-4 w-4 text-muted" />}
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Продукт по име, код или баркод"
            aria-label="Търсене на продукт"
            className="w-full bg-transparent px-2 py-2 outline-none focus-visible:outline-none"
          />
        </label>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-canvas" aria-label="Затвори">
          <X className="h-4 w-4" />
        </button>
      </div>
      {showing.length ? (
        <ul className="mt-2 max-h-64 overflow-y-auto">
          {showing.map((p) => (
            <li key={p.sku}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-canvas">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.image ?? "/placeholder.svg"} alt="" referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-lg border border-line object-contain" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-1 text-sm font-bold">{p.name}</span>
                  <span className="text-xs text-muted">
                    {p.variant ? `${p.variant} · ` : ""}
                    {p.sku} · {p.stock > 0 ? "в наличност" : "изчерпан"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ChatSettingsCard({ initial, onClose }: { initial: ChatSettings; onClose: () => void }) {
  const ed = useEditor(initial, saveChatSettingsAction);
  const v = ed.value;
  const set = <K extends keyof ChatSettings>(k: K, val: ChatSettings[K]) => ed.setValue((cur) => ({ ...cur, [k]: val }));
  const setQuestion = (i: number, lang: Lang, text: string) =>
    ed.setValue((cur) => ({ ...cur, quickQuestions: cur.quickQuestions.map((q, j) => (j === i ? { ...q, [lang]: text } : q)) }));
  return (
    <Card
      className="mb-5"
      title="Настройки на чата"
      description="Балончето се показва долу вдясно на всяка страница от магазина, на български и на английски (празен английски текст = българският)."
      actions={
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full hover:bg-canvas" aria-label="Затвори настройките">
          <X className="h-5 w-5" />
        </button>
      }
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Toggle checked={v.enabled} onChange={(x) => set("enabled", x)} label="Показвай чата в сайта" description="Изключете го, ако за известно време няма кой да отговаря." className="md:col-span-2" />
        <Field label="Заглавие" group>
          <L10nInput value={v.title} onChange={(x) => set("title", x)} label="Заглавие" maxLength={40} invalid={!v.title.bg.trim()} />
        </Field>
        <Toggle
          checked={v.askContact}
          onChange={(x) => set("askContact", x)}
          label="Питай за телефон или имейл"
          description="След първото съобщение, за да можете да отговорите и по-късно. Регистрираните клиенти не се питат."
        />
        <Field label="Поздрав" hint="Първото съобщение, което посетителят вижда." group>
          <L10nInput value={v.greeting} onChange={(x) => set("greeting", x)} label="Поздрав" multiline rows={3} maxLength={400} />
        </Field>
        <Field label="Текст, когато не сте на линия" hint="Показва се, когато админ панелът не е отворен никъде." group>
          <L10nInput value={v.offlineText} onChange={(x) => set("offlineText", x)} label="Текст, когато не сте на линия" multiline rows={3} maxLength={300} />
        </Field>
        <div className="md:col-span-2" role="group" aria-labelledby="chat-quick-questions">
          <p id="chat-quick-questions" className="mb-1.5 text-sm font-extrabold">
            Бързи въпроси
          </p>
          <p className="mb-2 text-sm text-muted">До 6. Посетителят може да ги натисне, вместо да пише.</p>
          <ul className="space-y-2">
            {v.quickQuestions.map((q, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                <span className="w-6 shrink-0 text-center text-sm font-black text-muted">{i + 1}</span>
                <input
                  value={q.bg}
                  onChange={(e) => setQuestion(i, "bg", e.target.value)}
                  maxLength={120}
                  placeholder="На български"
                  aria-label={`Въпрос ${i + 1} (БГ)`}
                  className="field min-w-0 flex-1"
                />
                <input
                  value={q.en}
                  onChange={(e) => setQuestion(i, "en", e.target.value)}
                  maxLength={120}
                  placeholder={q.bg || "In English"}
                  aria-label={`Въпрос ${i + 1} (EN)`}
                  lang="en"
                  className="field min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => set("quickQuestions", v.quickQuestions.filter((_, j) => j !== i))}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-brand hover:bg-brand-soft"
                  aria-label={`Премахни въпрос ${i + 1}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          {v.quickQuestions.length < 6 ? (
            <button type="button" onClick={() => set("quickQuestions", [...v.quickQuestions, { bg: "", en: "" }])} className="btn btn-ghost mt-2 h-10 px-4 text-sm">
              <Plus className="h-4 w-4" /> Добави въпрос
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={ed.submit} disabled={ed.pending || !ed.dirty} className="btn btn-primary h-11 px-6">
          {ed.pending ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Запази настройките
        </button>
        <StatusText status={ed.status} dirty={ed.dirty} />
      </div>
    </Card>
  );
}

function StatusText({ status, dirty }: { status: SaveStatus; dirty: boolean }) {
  if (status.kind === "error") {
    return (
      <span className="flex items-center gap-1.5 text-sm font-bold text-brand" role="alert">
        <CircleAlert className="h-4 w-4" /> {status.message}
      </span>
    );
  }
  if (status.kind === "saved" && !dirty) {
    return (
      <span className="flex items-center gap-1.5 text-sm font-bold text-mint" role="status">
        <Check className="h-4 w-4" strokeWidth={3} /> Запазено!
      </span>
    );
  }
  return null;
}
