"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { useSettings } from "@/components/SettingsProvider";
import { useConsent } from "./ConsentProvider";

// Analytics / marketing scripts, loaded ONLY after the matching consent and only when the admin configured an ID
// (Admin → Настройки → tracking). Nothing is injected before the visitor chooses. Withdrawing consent reloads the
// page (ConsentProvider), so a script that was running is gone afterwards.
//
// What they may see (privacy):
//   - Pages with secrets or personal data in the address — /nova-parola?token=…, /byuletin?t=…, order pages
//     /porachka/<id>, the account area /profil…, /otkaz-ot-dogovor?order=… — never load the scripts and send
//     nothing; if the scripts were already running (client-side navigation), no page view is sent and GA is paused.
//   - Page views are sent by this component (not by the tags themselves) with a cleaned address: no #hash and only
//     campaign / search parameters (utm_*, gclid…, q, page) — any other query parameter is dropped.
//     GA4: turn OFF Admin → Data streams → Enhanced measurement → "Page changes based on browser history events"
//     (this component sends them; README → Tracking). The Meta pixel's own history tracking is switched off here.
//   - One-time tokens are removed from the address bar as soon as the page has them (reset / newsletter links).

// IDs come from the admin panel and end up inside inline scripts: accept only their documented shapes.
const GA4_RE = /^G-[A-Z0-9]{4,20}$/;
const PIXEL_RE = /^\d{6,20}$/;

/** Public paths (with or without /en) where no tracking may happen. */
const NO_TRACKING = /^(?:\/en)?\/(?:nova-parola|byuletin|otkaz-ot-dogovor|profil|porachka\/[^/]+)(?:\/|$)/;
/** Pages whose one-time token (query parameter) is removed from the address bar after load. */
const SECRET_PARAMS: [RegExp, string][] = [
  [/^(?:\/en)?\/nova-parola$/, "token"],
  [/^(?:\/en)?\/byuletin$/, "t"],
];
/** Query parameters that may reach analytics (campaign attribution, site search, pagination). */
const KEEP_PARAM = /^(?:utm_[a-z]+|gclid|gbraid|wbraid|fbclid|q|page)$/;

/** The current address as analytics may see it. */
export function cleanLocation(href: string): string {
  try {
    const u = new URL(href);
    const kept = [...u.searchParams].filter(([k]) => KEEP_PARAM.test(k));
    u.search = kept.length ? new URLSearchParams(kept).toString() : "";
    u.hash = "";
    return u.toString();
  } catch {
    return "";
  }
}

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { disablePushState?: boolean };
type TrackingWindow = Window & { gtag?: Gtag; fbq?: Fbq } & Record<string, unknown>;

export function TrackingScripts() {
  const { consent } = useConsent();
  const { tracking } = useSettings();
  const pathname = usePublicPathname();
  const ga4 = GA4_RE.test(tracking.ga4Id) ? tracking.ga4Id : "";
  const pixel = PIXEL_RE.test(tracking.metaPixelId) ? tracking.metaPixelId : "";
  const blocked = NO_TRACKING.test(pathname);
  const analytics = !!consent?.analytics && !!ga4;
  const marketing = !!consent?.marketing;

  // One-time tokens out of the address bar (history, bookmarks, screenshots). The form already has them.
  useEffect(() => {
    for (const [re, param] of SECRET_PARAMS) {
      if (!re.test(pathname)) continue;
      const params = new URLSearchParams(window.location.search);
      if (!params.has(param)) continue;
      params.delete(param);
      const rest = params.toString();
      window.history.replaceState(null, "", `${pathname}${rest ? `?${rest}` : ""}`);
    }
  }, [pathname]);

  // Google Consent Mode: keep the ad signals in line with the marketing choice while GA4 runs.
  useEffect(() => {
    const gtag = (window as unknown as TrackingWindow).gtag;
    if (!analytics || !gtag) return;
    const ads = marketing ? "granted" : "denied";
    gtag("consent", "update", { ad_storage: ads, ad_user_data: ads, ad_personalization: ads });
  }, [analytics, marketing]);

  // Page views (first page and every client-side navigation), with the cleaned address; none on blocked pages.
  // Runs after the <Script> children's effects, so the tags' init scripts have already defined gtag / fbq.
  const lastGa = useRef<string | null>(null);
  const lastPixel = useRef<string | null>(null);
  useEffect(() => {
    const w = window as unknown as TrackingWindow;
    if (ga4) w[`ga-disable-${ga4}`] = blocked; // Google's documented switch: no hits while true
    if (blocked) return;
    const location = cleanLocation(window.location.href);
    if (analytics && w.gtag && lastGa.current !== location) {
      w.gtag("set", { page_location: location, ...(lastGa.current ? { page_referrer: lastGa.current } : {}) });
      w.gtag("event", "page_view", { page_location: location, page_title: document.title });
      lastGa.current = location;
    }
    if (marketing && pixel && w.fbq && lastPixel.current !== pathname) {
      w.fbq("track", "PageView");
      lastPixel.current = pathname;
    }
  }, [pathname, blocked, analytics, marketing, ga4, pixel]);

  // A page with a secret in its address never loads the tags; they load on the next normal page (next/script runs
  // each id once per page load, so leaving and coming back does not start them twice).
  const loadGa = analytics && !blocked;
  const loadPixel = marketing && !!pixel && !blocked;

  return (
    <>
      {loadGa ? (
        <>
          <Script id="ga4-src" src={`https://www.googletagmanager.com/gtag/js?id=${ga4}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;` +
              `gtag('consent','default',{analytics_storage:'granted',ad_storage:'${marketing ? "granted" : "denied"}',ad_user_data:'${marketing ? "granted" : "denied"}',ad_personalization:'${marketing ? "granted" : "denied"}'});` +
              `gtag('js',new Date());gtag('config','${ga4}',{send_page_view:false});`}
          </Script>
        </>
      ) : null}
      {loadPixel ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};` +
            `if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;` +
            `s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
            `fbq.disablePushState=true;fbq('set','autoConfig',false,'${pixel}');fbq('init','${pixel}');`}
        </Script>
      ) : null}
    </>
  );
}
