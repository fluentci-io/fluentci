import { formatCompactCount } from "../../registry/formatCount";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LikeRecord } from "../../auth/client";
import { useAuth } from "../../auth/context";
import { query, type Plugin } from "../../registry/client";
import { HeartIcon } from "../HeartIcon";

export function LikeButton({
  plugin,
  compact = false,
}: {
  plugin: Plugin;
  compact?: boolean;
}) {
  const { account, loading, openSignIn } = useAuth();
  const queries = useQueryClient();
  const viewerKey = ["viewer-like", account?.did, plugin.author, plugin.name];
  const countKey = ["module-like-count", plugin.author, plugin.name];
  const count = useQuery({
    queryKey: countKey,
    initialData: plugin.likesCount ?? 0,
    queryFn: async ({ signal }) => {
      const result = await query<{ packages: Plugin[] }>(
        "searchPackages",
        new URLSearchParams({
          author: plugin.author,
          filter: `name==${plugin.name}`,
          latest: "true",
          limit: "1",
        }),
        signal,
      );
      return result.packages[0]?.likesCount ?? 0;
    },
  });
  const viewer = useQuery({
    queryKey: viewerKey,
    enabled: Boolean(account),
    queryFn: async () => {
      const auth = await import("../../auth/client");
      const records = await queries.fetchQuery({
        queryKey: ["viewer-likes", account!.did],
        queryFn: ({ signal }) => auth.listLikes(account!, signal),
      });
      return records.filter((record) => auth.matchesModule(record, plugin));
    },
  });
  const mutation = useMutation({
    mutationFn: async (liked: boolean) => {
      const auth = await import("../../auth/client");
      return auth.writeLike(account!, plugin, liked);
    },
    onMutate: async (liked) => {
      await queries.cancelQueries({ queryKey: viewerKey });
      await queries.cancelQueries({ queryKey: countKey });
      const oldViewer = queries.getQueryData<LikeRecord[]>(viewerKey) ?? [];
      const oldCount = queries.getQueryData<number>(countKey) ?? 0;
      queries.setQueryData(
        viewerKey,
        liked
          ? [{ uri: "pending", subject: { uri: plugin.uri, cid: plugin.cid } }]
          : [],
      );
      queries.setQueryData(countKey, Math.max(0, oldCount + (liked ? 1 : -1)));
      return { oldViewer, oldCount };
    },
    onError: (_error, _liked, previous) => {
      if (previous) {
        queries.setQueryData(viewerKey, previous.oldViewer);
        queries.setQueryData(countKey, previous.oldCount);
      }
    },
    onSuccess: async (records) => {
      if (!account) return;
      queries.setQueryData(viewerKey, records);
      const auth = await import("../../auth/client");
      queries.setQueryData<LikeRecord[]>(
        ["viewer-likes", account!.did],
        (previous) => [
          ...(previous ?? []).filter(
            (record) => !auth.matchesModule(record, plugin),
          ),
          ...records,
        ],
      );
      void queries.invalidateQueries({
        queryKey: ["module-catalog"],
        refetchType: "none",
      });
    },
  });
  const liked = Boolean(viewer.data?.length);
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        aria-label={`${liked ? "Unlike" : "Like"} ${plugin.name}`}
        aria-pressed={liked}
        title={
          account
            ? liked
              ? "Unlike module"
              : "Like module"
            : "Sign in to like this module"
        }
        disabled={
          loading || mutation.isPending || Boolean(account && viewer.isPending)
        }
        className={`inline-flex items-center gap-1.5 rounded px-1 py-1 font-mono ${compact ? "text-xs" : "text-sm"} transition-colors disabled:opacity-50 ${liked ? "text-accent" : "text-muted hover:text-accent"}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!account) openSignIn();
          else if (viewer.isError) void viewer.refetch();
          else mutation.mutate(!liked);
        }}
      >
        <HeartIcon filled={liked} />
        {count.data > 0 && (
          <span
            title={`${count.data.toLocaleString()} likes`}
            aria-label={`${count.data.toLocaleString()} likes`}
          >
            {compact
              ? formatCompactCount(count.data)
              : count.data.toLocaleString()}
          </span>
        )}
      </button>
      {(mutation.isError || viewer.isError) && (
        <span role="alert" className="max-w-48 text-[11px] text-red-400">
          {viewer.isError
            ? "Unable to check like. Click to retry."
            : "Unable to save like. Try again."}
        </span>
      )}
    </span>
  );
}
