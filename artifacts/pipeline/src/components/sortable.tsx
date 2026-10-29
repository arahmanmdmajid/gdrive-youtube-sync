import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";

type Sort = { key: string; dir: "asc" | "desc" };
type Value = string | number | null | undefined;

/** "DD-MM-YYYY" as "YYYY-MM-DD" so dates sort as text; anything else is returned as it is. */
export const dateKey = (d: string) => d.replace(/^(\d{2})-(\d{2})-(\d{4})$/, "$3-$2-$1");

/**
 * Sorts rows by one column at a time, in the browser. `columns` maps a column key to the value to sort by.
 * Starts on `initial`; clicking the same header flips the order, a new one starts ascending.
 */
export function useSort<T>(rows: T[], columns: Record<string, (row: T) => Value>, initial: Sort) {
  const [sort, setSort] = useState(initial);
  const get = columns[sort.key];
  const sign = sort.dir === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1; // empty last either way
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sign;
  });
  const toggle = (key: string) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  return { sorted, sort, toggle };
}

export function SortHead({
  label, column, sort, onSort, className,
}: { label: string; column: string; sort: Sort; onSort: (key: string) => void; className?: string }) {
  const Icon = sort.key !== column ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className} aria-sort={sort.key !== column ? "none" : sort.dir === "asc" ? "ascending" : "descending"}>
      <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => onSort(column)}>
        {label}
        <Icon className={`h-3 w-3 ${sort.key === column ? "" : "opacity-40"}`} />
      </button>
    </TableHead>
  );
}
