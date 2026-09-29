import { defineMessages } from "../define";

// Wishlist page and heart buttons. Owner: D.
export default defineMessages({
  bg: {
    title: "Любими",
    empty: "Още нямаш любими продукти.",
    emptyText: "Натисни сърцето при продукт, за да го запазиш тук.",
    emptyCta: "Разгледай продуктите",
    add: "Добави в любими",
    remove: "Премахни от любими",
    removeNamed: "Премахни {name} от любими",
    saved: "В любими",
    count: { one: "{n} любим продукт", other: "{n} любими продукта" },
    unavailable: "Вече не се предлага",
    headerLabel: "Любими",
    headerLabelCount: "Любими ({n})",
  },
  en: {
    title: "Wishlist",
    empty: "Your wishlist is empty.",
    emptyText: "Tap the heart on a product to save it here.",
    emptyCta: "Browse products",
    add: "Add to wishlist",
    remove: "Remove from wishlist",
    removeNamed: "Remove {name} from your wishlist",
    saved: "Saved",
    count: { one: "{n} saved product", other: "{n} saved products" },
    unavailable: "No longer available",
    headerLabel: "Wishlist",
    headerLabelCount: "Wishlist ({n})",
  },
});
