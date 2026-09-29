import { Search } from "lucide-react";
import { ADMIN_FILTERS, ADMIN_SORTS, STOCK_FILTERS, type AdminQuery, type AdminSort, type CategoryOption, type Choice } from "@/lib/admin/products";

/**
 * Search and filters of Admin → Продукти: a plain GET form (works without JavaScript; the address keeps the state,
 * so a filtered list can be bookmarked or sent to a colleague).
 */
export function ProductFilters({
  query,
  sort,
  categories,
  brands,
  kinds,
}: {
  query: AdminQuery;
  sort: AdminSort;
  categories: CategoryOption[];
  brands: string[];
  kinds: Choice[];
}) {
  const label = "mb-1 block text-xs font-extrabold uppercase tracking-wide text-muted";
  const select = "field cursor-pointer !py-2";
  return (
    <form className="mb-5 space-y-3 rounded-3xl border border-line bg-white p-4" action="/admin/produkti" role="search" aria-label="Търсене на продукти">
      <div className="flex flex-wrap gap-2">
        <label className="flex min-w-0 flex-1 basis-64 items-center rounded-[0.875rem] border-2 border-line bg-white px-3 focus-within:border-sky">
          <Search className="h-5 w-5 shrink-0 text-muted" />
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Име, код (SKU) или баркод — може и част от тях"
            className="w-full bg-transparent px-2 py-2.5 outline-none focus-visible:outline-none"
            aria-label="Търсене по име, код или баркод"
          />
        </label>
        <button type="submit" className="btn btn-primary h-12 px-6 !shadow-none">
          Покажи
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
        <label>
          <span className={label}>Категория</span>
          <select name="kat" defaultValue={query.category} className={select}>
            <option value="">Всички</option>
            {categories.map((c) => (
              <optgroup key={c.slug} label={c.hidden ? `${c.name} (скрита)` : c.name}>
                <option value={c.slug}>{c.name} — всички</option>
                {c.subs.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Марка</span>
          <input name="marka" defaultValue={query.brand} list="admin-brand-options" placeholder="Всички" className="field !py-2" autoComplete="off" />
          <datalist id="admin-brand-options">
            {brands.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label>
          <span className={label}>Наличност</span>
          <select name="nalichnost" defaultValue={query.stock} className={select}>
            {Object.entries(STOCK_FILTERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Вид</span>
          <select name="vid" defaultValue={query.kind} className={select}>
            <option value="">Всички</option>
            {kinds.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Покажи</span>
          <select name="filter" defaultValue={query.filter} className={select}>
            {Object.entries(ADMIN_FILTERS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={label}>Подреди</span>
          <select name="sort" defaultValue={sort} className={select}>
            {Object.entries(ADMIN_SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
    </form>
  );
}
