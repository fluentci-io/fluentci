import { useCallback, useEffect, useRef, useState } from "react";
import { query, uniquePlugins, type Plugin } from "../../registry/client";

export type ModuleSort = "downloads" | "newest" | "oldest" | "name";

export function usePublisherModules(
  actor: string,
  search: string,
  sort: ModuleSort,
) {
  const [items, setItems] = useState<Plugin[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [total, setTotal] = useState<number>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [debounced, setDebounced] = useState(search);
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController>();
  const generation = useRef(0);
  const busy = useRef(false);
  const next = useRef<string>();
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setTotal(undefined), [actor]);
  const fetchPage = useCallback(
    async (after?: string) => {
      if (busy.current) return;
      busy.current = true;
      const current = generation.current;
      const abort = new AbortController();
      request.current = abort;
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          actor,
          q: debounced,
          latest: "true",
          limit: "20",
          sort,
        });
        if (after) params.set("cursor", after);
        const page = await query<{
          packages: Plugin[];
          cursor?: string;
          total?: number;
        }>("getActorPackages", params, abort.signal);
        if (abort.signal.aborted || current !== generation.current) return;
        if (after && page.cursor === after)
          throw Error("The registry returned a repeated pagination cursor.");
        setItems((previous) =>
          uniquePlugins(
            after ? [...previous, ...page.packages] : page.packages,
          ),
        );
        const cursor = page.cursor || undefined;
        next.current = cursor;
        setCursor(cursor);
        if (typeof page.total === "number") setTotal(page.total);
      } catch (reason) {
        if (!abort.signal.aborted && current === generation.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load published modules.",
          );
      } finally {
        if (current === generation.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [actor, debounced, sort],
  );
  useEffect(() => {
    generation.current += 1;
    request.current?.abort();
    busy.current = false;
    next.current = undefined;
    setCursor(undefined);
    setItems([]);
    void fetchPage();
    return () => {
      generation.current += 1;
      request.current?.abort();
    };
  }, [fetchPage, retry]);
  const loadMore = useCallback(() => {
    if (next.current) void fetchPage(next.current);
  }, [fetchPage]);
  return {
    items,
    total,
    loading,
    error,
    hasMore: Boolean(cursor),
    loadMore,
    retry: () => {
      if (next.current && items.length) void fetchPage(next.current);
      else setRetry((value) => value + 1);
    },
  };
}
