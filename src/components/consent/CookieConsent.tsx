"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CheckCircle2, Cookie } from "lucide-react";
import { fmt } from "@/i18n";
import { useDict, useLang } from "@/i18n/client";
import { localizeHref } from "@/lib/links";
import { useSettings } from "@/components/SettingsProvider";
import { Dialog } from "@/components/ui/Dialog";
import { useConsent, type Consent } from "./ConsentProvider";

// The cookie banner (first visit, and again after the policy version changes) and the settings dialog.
// Legal rules (legal-content.md A.8 / C.9, EDPB cookie banner task force): "Приеми всички" and "Отхвърли" on the first
// layer with EQUAL weight, nothing pre-ticked, no cookie wall (the page stays usable, no scrim), Escape is not
// consent, and the footer link re-opens the settings at any time.
// Stacking: the banner (z 48) sits above the sticky header (40) and the chat bubble (40/45) but BELOW every modal
// Drawer / Dialog (z 50), so a dialog opened while the banner is up is never covered.

type Choice = Omit<Consent, "necessary">;
const ALL: Consent = { necessary: true, preferences: true, analytics: true, marketing: true };
const NONE: Consent = { necessary: true, preferences: false, analytics: false, marketing: false };

function Switch({ on, onChange, labelledBy, describedBy, label }: { on: boolean; onChange: (v: boolean) => void; labelledBy: string; describedBy: string; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      title={label}
      onClick={() => onChange(!on)}
      className="group grid h-11 w-16 shrink-0 place-items-center rounded-pill"
    >
      <span className={clsx("relative h-7 w-12 rounded-pill transition-colors", on ? "bg-primary" : "bg-[#8a8a8a] group-hover:bg-ink-soft")}>
        <span className={clsx("absolute top-1 h-5 w-5 rounded-full bg-surface shadow transition-[left]", on ? "left-6" : "left-1")} />
      </span>
    </button>
  );
}

/** The dialog body; mounted when the dialog opens, so its toggles start from the current choice (all off at first). */
function SettingsDialog({ open }: { open: boolean }) {
  const lang = useLang();
  const dict = useDict();
  const t = dict.cookies;
  const { consent, save, closeSettings } = useConsent();
  const { tracking } = useSettings();
  const uid = useId();
  const [choice, setChoice] = useState<Choice>(() => ({
    preferences: consent?.preferences ?? false,
    analytics: consent?.analytics ?? false,
    marketing: consent?.marketing ?? false,
  }));

  const rows: { key: "necessary" | keyof Choice; name: string; desc: string }[] = [
    { key: "necessary", name: t.necessary.name, desc: t.necessary.desc },
    { key: "preferences", name: t.preferences.name, desc: t.preferences.desc },
    { key: "analytics", name: t.analytics.name, desc: tracking.ga4Id ? t.analytics.desc : `${t.analytics.desc} ${t.notUsed}` },
    { key: "marketing", name: t.marketing.name, desc: tracking.metaPixelId ? t.marketing.desc : `${t.marketing.desc} ${t.notUsed}` },
  ];

  return (
    <Dialog
      open={open}
      onClose={closeSettings}
      title={t.modalTitle}
      description={t.modalBody}
      size="lg"
      footer={
        <div className="grid gap-2 sm:grid-cols-3">
          <button type="button" className="btn btn-outline" onClick={() => save(NONE)}>
            {t.rejectAll}
          </button>
          <button type="button" className="btn btn-outline" onClick={() => save(ALL)}>
            {t.acceptAll}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => save({ necessary: true, ...choice })} data-autofocus>
            {t.save}
          </button>
        </div>
      }
    >
      <ul className="space-y-3 pt-2">
        {rows.map((r) => {
          const nameId = `${uid}-${r.key}-name`;
          const descId = `${uid}-${r.key}-desc`;
          return (
            <li key={r.key} className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-line p-4">
              <div className="min-w-0">
                <h3 id={nameId} className="font-semibold">
                  {r.name}
                </h3>
                <p id={descId} className="mt-1 text-sm leading-relaxed text-muted">
                  {r.desc}
                </p>
              </div>
              {r.key === "necessary" ? (
                <span className="mt-0.5 shrink-0 rounded-pill bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700">{t.necessary.badge}</span>
              ) : (
                <Switch
                  on={choice[r.key]}
                  onChange={(v) => setChoice((c) => ({ ...c, [r.key]: v }))}
                  labelledBy={nameId}
                  describedBy={descId}
                  label={fmt(t.allow, { name: r.name })}
                />
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-sm">
        <Link href={localizeHref("/biskvitki", lang)} onClick={closeSettings} className="font-semibold text-primary underline underline-offset-2">
          {t.policyLink}
        </Link>
      </p>
    </Dialog>
  );
}

/** "Изборът ти е запазен." for a few seconds after saving. */
function SavedToast() {
  const dict = useDict();
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 3500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-[48] flex justify-center px-4">
      {visible ? (
        <p className="flex animate-fade-in items-center gap-2 rounded-pill bg-ink px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--shadow-overlay)]">
          <CheckCircle2 className="h-4 w-4 text-accent" aria-hidden /> {dict.cookies.saved}
        </p>
      ) : null}
    </div>
  );
}

export function CookieConsent() {
  const lang = useLang();
  const dict = useDict();
  const t = dict.cookies;
  const { ready, consent, save, settingsOpen, openSettings, savedAt } = useConsent();
  const titleId = useId();
  const bodyId = useId();
  const bannerRef = useRef<HTMLElement>(null);
  const showBanner = ready && !consent && !settingsOpen;

  // Move focus to the banner once when it first appears, so keyboard and screen-reader users meet it right away.
  const focused = useRef(false);
  useEffect(() => {
    if (!showBanner || focused.current) return;
    focused.current = true;
    bannerRef.current?.focus({ preventScroll: true });
  }, [showBanner]);

  return (
    <>
      {showBanner ? (
        <section
          ref={bannerRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          tabIndex={-1}
          // Phones: bottom sheet. Tablets (md): a floating card bottom-left. Desktop (lg+): a slim full-width bar at the
          // bottom (text left, buttons right), so the hero's heading and buttons stay visible on a 1440 × 900 screen.
          className="fixed inset-x-0 bottom-0 z-[48] max-h-[85dvh] animate-sheet-up overflow-y-auto rounded-t-[var(--radius-xl)] border border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-overlay)] outline-none md:inset-x-auto md:bottom-4 md:left-4 md:w-[26rem] md:animate-fade-in md:rounded-[var(--radius-xl)] lg:inset-x-0 lg:bottom-0 lg:w-auto lg:rounded-none lg:border-x-0 lg:border-b-0 lg:px-0 lg:py-4 lg:pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="lg:mx-auto lg:flex lg:max-w-[1320px] lg:items-center lg:gap-8 lg:px-6 xl:px-8">
            <div className="lg:min-w-0 lg:flex-1">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-50 text-primary lg:h-9 lg:w-9">
                  <Cookie className="h-5 w-5" aria-hidden />
                </span>
                <h2 id={titleId} className="text-lg font-bold leading-snug lg:text-base">
                  {t.title}
                </h2>
              </div>
              <p id={bodyId} className="mt-3 text-sm leading-relaxed text-ink-soft lg:mt-1.5 lg:pl-12">
                {t.body}{" "}
                <Link href={localizeHref("/biskvitki", lang)} className="font-semibold text-primary underline underline-offset-2">
                  {t.policyLink}
                </Link>
              </p>
            </div>
            {/* Equal weight on purpose: same size, same style. */}
            <div className="mt-4 grid grid-cols-2 gap-2 lg:mt-0 lg:flex lg:shrink-0 lg:items-center">
              <button type="button" className="btn bg-ink px-3 text-white hover:bg-ink-soft lg:min-w-36 lg:px-5" onClick={() => save({ ...ALL })}>
                {t.acceptAll}
              </button>
              <button type="button" className="btn bg-ink px-3 text-white hover:bg-ink-soft lg:min-w-36 lg:px-5" onClick={() => save({ ...NONE })}>
                {t.reject}
              </button>
              <button type="button" className="btn btn-ghost col-span-2 lg:px-5" onClick={openSettings} aria-haspopup="dialog">
                {t.settings}
              </button>
            </div>
          </div>
        </section>
      ) : null}
      {settingsOpen ? <SettingsDialog open /> : null}
      {savedAt ? <SavedToast key={savedAt} /> : null}
    </>
  );
}
