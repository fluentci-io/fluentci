import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Profile } from "./client";

export function useAccountSearch(handle: string, enabled: boolean) {
  const [q, setQ] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(
      () => setQ(handle.trim().replace(/^@/, "").toLowerCase()),
      180,
    );
    return () => window.clearTimeout(timer);
  }, [handle]);
  const search = useQuery({
    queryKey: ["account-suggestions", q],
    enabled: enabled && q.length >= 2,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ q, limit: "5" });
      const response = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?${params}`,
        { signal },
      );
      if (!response.ok) throw Error("Account suggestions unavailable");
      const data: { actors?: Profile[] } = await response.json();
      return (data.actors ?? []).filter(
        (actor) =>
          typeof actor.did === "string" &&
          typeof actor.handle === "string" &&
          actor.handle !== "handle.invalid",
      );
    },
  });
  const matches = q === handle.trim().replace(/^@/, "").toLowerCase();
  return {
    items: matches ? (search.data ?? []) : [],
    loading: enabled && q.length >= 2 && (search.isFetching || !matches),
  };
}
