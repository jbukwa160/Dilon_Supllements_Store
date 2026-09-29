import { defineMessages } from "../define";

// Error pages and generic error messages. Owner: B.
export default defineMessages({
  bg: {
    notFoundTitle: "Страницата не е намерена",
    notFoundText: "Възможно е адресът да е грешен или продуктът вече да не се предлага. Опитай с търсенето или разгледай категориите.",
    notFoundPopular: "Популярни категории",
    genericTitle: "Нещо се обърка",
    genericText: "Възникна неочаквана грешка. Опитай отново след малко.",
    code: "Код на грешката: {code}",
    rateLimited: "Твърде много опити. Изчакай малко и опитай отново.",
    network: "Няма връзка със сървъра. Провери интернета си и опитай отново.",
    reload: "Страницата е остаряла. Презареди я и опитай отново.",
  },
  en: {
    notFoundTitle: "Page not found",
    notFoundText: "The address may be wrong or the product may no longer be available. Try searching or browse the categories.",
    notFoundPopular: "Popular categories",
    genericTitle: "Something went wrong",
    genericText: "An unexpected error occurred. Please try again in a moment.",
    code: "Error code: {code}",
    rateLimited: "Too many attempts. Please wait a little and try again.",
    network: "Can't reach the server. Check your connection and try again.",
    reload: "This page is out of date. Please reload it and try again.",
  },
});
