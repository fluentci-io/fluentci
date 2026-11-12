import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  cachedProfiles,
  getProfiles,
  query,
  type Plugin,
  type Profile,
} from "../../registry/client";
import { registryFilter, type CatalogSearch } from "./filters";

export function useModulesCatalog(filters: CatalogSearch) {
  const [q, setQ] = useState(filters.q);
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(filters.q.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [filters.q]);
  const key = JSON.stringify({ ...filters, q });
  const [paging, setPaging] = useState({ key, cursors: [""], index: 0 });
  const [profiles, setProfiles] =
    useState<Record<string, Profile>>(cachedProfiles);
  const index = paging.key === key ? paging.index : 0;
  const cursor = paging.key === key ? paging.cursors[index] : "";
  useEffect(() => {
    setPaging({ key, cursors: [""], index: 0 });
  }, [key]);

  const result = useQuery({
    queryKey: ["module-catalog", key, cursor],
    queryFn: async ({ signal }) => {
      const selected: CatalogSearch = JSON.parse(key);
      const params = new URLSearchParams({
        latest: "true",
        limit: "24",
        sort: selected.sort,
      });
      if (selected.q) params.set("q", selected.q);
      const filter = registryFilter(selected);
      if (filter) params.set("filter", filter);
      if (selected.official) params.set("author", "fluentci.io");
      if (cursor) params.set("cursor", cursor);
      const page = await query<{ packages: Plugin[]; cursor?: string }>(
        "searchPackages",
        params,
        signal,
      );
      if (page.cursor && page.cursor === cursor)
        throw Error("The registry returned a repeated pagination cursor.");
      return page;
    },
  });
  useEffect(() => {
    if (!result.data?.packages.length) return;
    const abort = new AbortController();
    void getProfiles(
      result.data.packages.map((item) => item.author),
      abort.signal,
    )
      .then((authors) => {
        if (!abort.signal.aborted)
          setProfiles((previous) => ({ ...previous, ...authors }));
      })
      .catch(() => {
        /* Module links can use the author's DID. */
      });
    return () => abort.abort();
  }, [result.data]);

  return {
    items: result.data?.packages ?? [],
    profiles,
    loading: result.isPending,
    error: result.data ? undefined : result.error?.message,
    page: index + 1,
    hasPrevious: index > 0,
    hasNext: Boolean(result.data?.cursor),
    previous: () =>
      setPaging((value) => ({ ...value, index: Math.max(0, value.index - 1) })),
    next: () => {
      const next = result.data?.cursor;
      if (next)
        setPaging((value) => ({
          key,
          cursors: [
            ...(value.key === key ? value.cursors.slice(0, index + 1) : [""]),
            next,
          ],
          index: index + 1,
        }));
    },
    retry: () => {
      void result.refetch();
    },
  };
}
