import { useEffect, useRef } from "react";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useLocation, useNavigate } from "react-router-dom";
import {
  IconGitBranch,
  IconGitPullRequest,
  IconLoader2,
} from "@tabler/icons-react";
import { graphql, isActive, useRuns } from "../api";
import { actionDraftsAtom } from "../state";
import type { Workflow } from "../types";

interface GitStatus {
  branch: string | null;
  commit: string | null;
  branches: string[];
  upstream: string | null;
  dirty: boolean;
}
const fields = "branch commit branches upstream dirty";
const sourceKeys = [
  "workflows",
  "actions",
  "actionSuggestions",
  "projectDirectories",
  "export",
];

export function ProjectGitControls({
  projectId,
  archived,
  compact = false,
}: {
  projectId: string;
  archived?: boolean;
  compact?: boolean;
}) {
  const client = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const drafts = useAtomValue(actionDraftsAtom);
  const runs = useRuns(projectId);
  const hasDrafts = Object.keys(drafts).some(
    (key) => key === projectId || key.startsWith(`${projectId}:`),
  );
  const busy = useIsMutating({ mutationKey: ["projectGit", projectId] }) > 0;
  const status = useQuery({
    queryKey: ["projectGit", projectId],
    queryFn: async ({ signal }) =>
      (
        await graphql<{ projectGit: GitStatus | null }>(
          `query($id:ID!){projectGit(projectId:$id){${fields}}}`,
          { id: projectId },
          signal,
        )
      ).projectGit,
    refetchInterval: 10_000,
  });
  const refresh = async () => {
    await Promise.all(
      sourceKeys.map((key) =>
        client.invalidateQueries({ queryKey: [key, projectId] }),
      ),
    );
  };
  const previous = useRef<string>();
  const revision = status.data
    ? `${status.data.branch}:${status.data.commit}`
    : undefined;
  useEffect(() => {
    if (previous.current !== undefined && revision !== previous.current) {
      for (const key of sourceKeys)
        void client.invalidateQueries({ queryKey: [key, projectId] });
    }
    previous.current = revision;
  }, [revision, client, projectId]);
  const mutation = useMutation({
    mutationKey: ["projectGit", projectId],
    mutationFn: async (branch: string | null) => {
      await Promise.all(
        sourceKeys.map((key) =>
          client.cancelQueries({ queryKey: [key, projectId] }),
        ),
      );
      const response =
        branch === null
          ? await graphql<{ pullProject: GitStatus }>(
              `mutation($id:ID!){pullProject(projectId:$id){${fields}}}`,
              { id: projectId },
            )
          : await graphql<{ switchProjectBranch: GitStatus }>(
              `mutation($id:ID!,$branch:String!){switchProjectBranch(projectId:$id,branch:$branch){${fields}}}`,
              { id: projectId, branch },
            );
      return "pullProject" in response
        ? response.pullProject
        : response.switchProjectBranch;
    },
    onSuccess: async (next) => {
      client.setQueryData(["projectGit", projectId], next);
      await refresh();
      const params = new URLSearchParams(location.search);
      const workflow = params.get("workflow");
      const workflows = client.getQueryData<Workflow[]>([
        "workflows",
        projectId,
      ]);
      if (
        workflow &&
        workflows &&
        !workflows.some((item) => item.id === workflow)
      ) {
        params.delete("workflow");
        navigate(
          { pathname: location.pathname, search: params.toString() },
          { replace: true },
        );
      }
    },
  });
  if (!status.data) return null;
  const git = status.data;
  const active = runs.data?.some((run) => isActive(run.status));
  const disabled = archived || active || hasDrafts || busy;
  const reason = hasDrafts
    ? "Save or discard Studio action drafts before changing branches"
    : active
      ? "Wait for active project runs to finish"
      : undefined;
  return (
    <div
      className={`flex min-w-0 items-center gap-2 ${compact ? "w-full flex-nowrap text-[11px]" : "mt-3 flex-wrap text-xs"}`}
    >
      <IconGitBranch
        size={14}
        className="shrink-0 text-accent"
        aria-hidden="true"
      />
      <select
        aria-label="Git branch"
        title={reason || "Switch local Git branch"}
        value={git.branch || ""}
        disabled={!!disabled}
        onChange={(event) => mutation.mutate(event.target.value)}
        className="input !w-32 min-w-0 shrink !py-1 font-mono text-xs sm:!w-48"
      >
        {!git.branch && (
          <option value="" disabled>
            Detached {git.commit || "HEAD"}
          </option>
        )}
        {git.branches.map((branch) => (
          <option key={branch} value={branch}>
            {branch}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn-secondary shrink-0 !px-2 !py-1 text-xs"
        aria-label="Pull Git changes"
        title={
          reason ||
          (git.upstream
            ? `Pull ${git.upstream} (fast-forward only)`
            : "No upstream configured for this branch")
        }
        disabled={!!disabled || !git.upstream || !git.branch}
        onClick={() => mutation.mutate(null)}
      >
        {busy ? (
          <IconLoader2 size={13} className="animate-spin" />
        ) : (
          <IconGitPullRequest size={13} />
        )}{" "}
        Pull
      </button>
      {git.dirty && (
        <span className="text-[10px] text-warning" title="Uncommitted changes">
          Modified
        </span>
      )}
      {hasDrafts && !compact && (
        <span className="text-[10px] text-muted">
          Save or discard action drafts to change Git branches.
        </span>
      )}
      {mutation.error && (
        <span
          role="alert"
          title={String(mutation.error)}
          className={`text-xs text-danger ${compact ? "max-w-48 truncate" : "basis-full"}`}
        >
          {String(mutation.error)}
        </span>
      )}
    </div>
  );
}
