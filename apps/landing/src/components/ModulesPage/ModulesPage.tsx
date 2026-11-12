import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { SiteHeader } from "../SiteHeader";
import { ScrollToTop } from "../ScrollToTop";
import { SiteFooter } from "../SiteFooter";
import { ModuleCard } from "../ModuleCard";
import { ModuleFilters } from "../ModuleFilters";
import { ModuleGridSkeleton } from "../ModuleGridSkeleton";
import { SearchIcon } from "../SearchIcon";
import { sorts, type CatalogSearch } from "./filters";
import { useModulesCatalog } from "./useModulesCatalog";
export function ModulesPage() {
  const filters = useSearch({ from: "/modules" });
  const navigate = useNavigate({ from: "/modules" });
  const catalog = useModulesCatalog(filters);
  const update = (value: CatalogSearch) => {
    void navigate({ search: value, replace: true, resetScroll: false });
  };
  useEffect(() => {
    document.title = "Modules · FluentCI";
    return () => {
      document.title = "FluentCI — Strongly typed. Functional CI/CD.";
    };
  }, []);
  return (
    <>
      <SiteHeader />
      <main className="page-width py-12 sm:py-16">
        <p className="section-label">The FluentCI registry</p>
        <h1 className="mt-4 text-3xl tracking-tight sm:text-4xl">
          Modules for every pipeline.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-muted">
          Discover reusable toolchains, build tools, and deployment steps.
          Browse the latest release of each module, sorted by total downloads.
        </p>
        <div className="catalog-layout mt-10">
          <ModuleFilters filters={filters} onChange={update} />
          <section className="min-w-0" aria-label="Module catalog">
            <div
              className="sticky top-0 z-20 mb-6 flex flex-col gap-3 bg-paper py-4 sm:flex-row"
              role="search"
              aria-label="Module search and sorting"
            >
              <label className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5 text-muted">
                <SearchIcon />
                <span className="sr-only">Search modules</span>
                <input
                  type="search"
                  maxLength={200}
                  placeholder="Search modules…"
                  value={filters.q}
                  onChange={(event) =>
                    update({ ...filters, q: event.target.value })
                  }
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
                />
              </label>
              <label>
                <span className="sr-only">Sort modules</span>
                <select
                  className="w-full rounded-lg border border-line bg-panel px-3 py-3 text-xs text-ink sm:w-auto"
                  value={filters.sort}
                  onChange={(event) =>
                    update({ ...filters, sort: event.target.value })
                  }
                >
                  {sorts.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div aria-busy={catalog.loading}>
              {catalog.loading ? (
                <ModuleGridSkeleton />
              ) : catalog.error ? (
                <div
                  role="alert"
                  className="rounded-lg border border-line p-8 text-sm"
                >
                  <p>{catalog.error}</p>
                  <button className="text-link mt-4" onClick={catalog.retry}>
                    Retry
                  </button>
                </div>
              ) : catalog.items.length ? (
                <div className="catalog-grid">
                  {catalog.items.map((plugin) => (
                    <ModuleCard
                      key={plugin.uri}
                      plugin={plugin}
                      profile={catalog.profiles[plugin.author]}
                    />
                  ))}
                </div>
              ) : (
                <div
                  role="status"
                  className="py-16 text-center text-sm text-muted"
                >
                  No modules match. Try another search or adjust the filters.
                </div>
              )}
            </div>
            <nav
              className="mt-8 flex items-center justify-between gap-4 border-t border-line pt-6"
              aria-label="Module pagination"
            >
              <button
                className="catalog-page-button"
                disabled={catalog.loading || !catalog.hasPrevious}
                onClick={catalog.previous}
              >
                Previous
              </button>
              <span className="font-mono text-xs text-muted" aria-live="polite">
                Page {catalog.page}
              </span>
              <button
                className="catalog-page-button"
                disabled={catalog.loading || !catalog.hasNext}
                onClick={catalog.next}
              >
                Next
              </button>
            </nav>
          </section>
        </div>
      </main>
      <SiteFooter />
      <ScrollToTop />
    </>
  );
}
