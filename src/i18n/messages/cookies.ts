import { defineMessages } from "../define";

// Cookie banner and settings dialog (texts from the legal research, C.9). Owner: B.
export default defineMessages({
  bg: {
    title: "Бисквитки и поверителност",
    body: "Използваме строго необходими бисквитки, за да работят входът, количката и сигурността на сайта. С твое съгласие бихме използвали и функционални, аналитични и маркетингови бисквитки. Можеш да промениш избора си по всяко време от „Настройки за бисквитки“ във футъра.",
    policyLink: "Политика за бисквитки",
    acceptAll: "Приеми всички",
    reject: "Отхвърли",
    settings: "Настройки",
    modalTitle: "Настройки за бисквитки",
    modalBody: "Избери кои категории бисквитки разрешаваш. Строго необходимите са винаги активни, защото без тях сайтът не работи.",
    necessary: {
      name: "Строго необходими",
      desc: "Вход в профила, количка и избран подарък, сигурност на формите, език, чат и запомняне на избора ти за бисквитки.",
      badge: "Винаги активни",
    },
    preferences: {
      name: "Функционални",
      desc: "Запомнят допълнителни предпочитания, например последните ти търсения.",
    },
    analytics: {
      name: "Аналитични",
      desc: "Обобщена статистика как се използва сайтът, за да го подобряваме (Google Analytics).",
    },
    marketing: {
      name: "Маркетингови",
      desc: "Реклами, съобразени с интересите ти, в други сайтове и социални мрежи (Meta Pixel).",
    },
    notUsed: "В момента не се използват.",
    allow: "Разреши: {name}",
    save: "Запази избора",
    rejectAll: "Отхвърли всички",
    saved: "Изборът ти е запазен.",
  },
  en: {
    title: "Cookies and privacy",
    body: "We use strictly necessary cookies so that sign-in, the cart and site security work. With your consent we would also use functional, analytics and marketing cookies. You can change your choice at any time via “Cookie settings” in the footer.",
    policyLink: "Cookie Policy",
    acceptAll: "Accept all",
    reject: "Reject",
    settings: "Settings",
    modalTitle: "Cookie settings",
    modalBody: "Choose which categories of cookies you allow. Strictly necessary cookies are always on because the site cannot work without them.",
    necessary: {
      name: "Strictly necessary",
      desc: "Sign-in, cart and chosen gift, form security, language, chat, and remembering your cookie choice.",
      badge: "Always active",
    },
    preferences: {
      name: "Functional",
      desc: "Remember extra preferences, e.g. your recent searches.",
    },
    analytics: {
      name: "Analytics",
      desc: "Aggregate statistics on how the site is used, so we can improve it (Google Analytics).",
    },
    marketing: {
      name: "Marketing",
      desc: "Interest-based ads on other websites and social networks (Meta Pixel).",
    },
    notUsed: "Not used at the moment.",
    allow: "Allow: {name}",
    save: "Save choices",
    rejectAll: "Reject all",
    saved: "Your choice has been saved.",
  },
});
