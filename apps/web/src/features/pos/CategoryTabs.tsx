import type { CategoryView, ProductView } from "@sari/shared";
import { Bath, Cookie, CupSoda, Egg, LayoutGrid, Package, PencilLine, Salad, Soup, SprayCan, type LucideIcon } from "lucide-react";

/** A tile icon from the category's name; owners can add categories, so unknown names get a box. */
const ICONS: [RegExp, LucideIcon][] = [
  [/snack|chip|candy|biscuit/i, Cookie],
  [/drink|inumin|beverage|juice/i, CupSoda],
  [/can|instant|noodle/i, Soup],
  [/condiment|sauce|spice/i, Salad],
  [/household|cleaning|laundry/i, SprayCan],
  [/personal|care|hygiene/i, Bath],
  [/school|supplies|paper/i, PencilLine],
  [/tingi|egg|rice/i, Egg],
];
const iconFor = (name: string) => ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? Package;

type Props = { categories: CategoryView[]; products: ProductView[]; selected: string | null; onSelect: (categoryId: string | null) => void };

/** The reference's category tiles: name, item count and an icon in the corner; the chosen one on the accent. */
export function CategoryTabs({ categories, products, selected, onSelect }: Props) {
  const count = (categoryId: string | null) => products.filter((p) => categoryId === null || p.categoryId === categoryId).length;
  const tiles = [{ id: null, name: "All", icon: LayoutGrid }, ...categories.filter((c) => !c.archived).map((c) => ({ id: c.id, name: c.name, icon: iconFor(c.name) }))];
  return (
    // Phones: one row that scrolls sideways, so the products stay near the top. Wider screens: a grid.
    <div
      role="group"
      aria-label="Categories"
      className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] md:overflow-visible md:px-0 md:pb-0"
    >
      {tiles.map(({ id, name, icon: Icon }) => {
        const active = selected === id;
        return (
          <button
            key={id ?? "all"}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(id)}
            className={`relative flex min-h-24 w-36 shrink-0 flex-col justify-end rounded-card p-4 text-left transition-colors md:w-auto ${active ? "bg-accent text-accent-ink" : "bg-surface text-text hover:bg-raised"}`}
          >
            <Icon aria-hidden size={26} className={`absolute right-4 top-4 ${active ? "" : "text-accent"}`} />
            {/* Room on the right, so a long name wraps before it reaches the corner icon. */}
            <span className="pr-8 font-medium leading-snug">{name}</span>
            <span className={`text-sm ${active ? "" : "text-muted"}`}>
              {count(id)} {count(id) === 1 ? "item" : "items"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
