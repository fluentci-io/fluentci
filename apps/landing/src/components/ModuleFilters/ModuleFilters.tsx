import { useState } from "react";
import {
  architectures,
  categories,
  operatingSystems,
  type CatalogSearch,
} from "../ModulesPage/filters";
export function ModuleFilters({
  filters,
  onChange,
}: {
  filters: CatalogSearch;
  onChange: (value: CatalogSearch) => void;
}) {
  const [open, setOpen] = useState(false);
  const count =
    filters.categories.length +
    filters.os.length +
    filters.arch.length +
    Number(filters.official);
  const toggle = (field: "categories" | "os" | "arch", value: string) =>
    onChange({
      ...filters,
      [field]: filters[field].includes(value)
        ? filters[field].filter((item) => item !== value)
        : [...filters[field], value],
    });
  return (
    <aside className="catalog-filters" aria-label="Module filters">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium">
          Filters{" "}
          {count > 0 && <span className="ml-1 text-muted">({count})</span>}
        </h2>
        <button
          type="button"
          className="text-xs text-accent lg:hidden"
          aria-expanded={open}
          aria-controls="catalog-filter-options"
          onClick={() => setOpen((value) => !value)}
        >
          {open ? "Hide filters" : "Show filters"}
        </button>
      </div>
      <div
        id="catalog-filter-options"
        className={`${open ? "block" : "hidden"} mt-6 space-y-7 lg:block`}
      >
        {[
          {
            field: "categories" as const,
            legend: "Category",
            options: categories,
          },
          {
            field: "os" as const,
            legend: "Operating system",
            options: operatingSystems,
          },
          {
            field: "arch" as const,
            legend: "CPU architecture",
            options: architectures,
          },
        ].map(({ field, legend, options }) => (
          <fieldset key={field}>
            <legend className="mb-3 text-xs font-medium">{legend}</legend>
            <div className="space-y-3">
              {options.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2.5 text-xs text-muted"
                >
                  <input
                    type="checkbox"
                    className="size-4 accent-accent"
                    checked={filters[field].includes(option.value)}
                    onChange={() => toggle(field, option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
        <label className="flex cursor-pointer items-center gap-2.5 text-xs text-muted">
          <input
            type="checkbox"
            className="size-4 accent-accent"
            checked={filters.official}
            onChange={(event) =>
              onChange({ ...filters, official: event.target.checked })
            }
          />
          Official modules only
        </label>
        {count > 0 && (
          <button
            type="button"
            className="text-link text-xs"
            onClick={() =>
              onChange({
                ...filters,
                categories: [],
                os: [],
                arch: [],
                official: false,
              })
            }
          >
            Clear filters
          </button>
        )}
      </div>
    </aside>
  );
}
