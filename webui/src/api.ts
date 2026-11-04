import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { connectionAtom } from "./state";
import type { Action, Job, Log, Project, Run } from "./types";

export const endpoint = import.meta.env.VITE_APP_API_URL || "/graphql";
export const projectFields =
  "id name displayName description path archived tags";
export const jobFields = "id name status createdAt startedAt duration";
export const runFields = `id projectId title status date duration branch commit message jobs { ${jobFields} }`;
export const actionFields =
  "name commands enabled plugin useWasm env workingDirectory";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 2_000, retry: 1, refetchOnWindowFocus: true },
  },
});

export async function graphql<T>(
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(new URL(endpoint, location.origin).href, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal,
  });
  if (!response.ok)
    throw new Error(`Local server returned HTTP ${response.status}.`);
  const result = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (result.errors?.length)
    throw new Error(result.errors.map((error) => error.message).join("\n"));
  if (!result.data)
    throw new Error("The local server returned an empty response.");
  return result.data;
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: async ({ signal }) =>
      (
        await graphql<{ projects: Project[] }>(
          `query { projects(limit: 1000) { ${projectFields} } }`,
          {},
          signal,
        )
      ).projects,
    refetchInterval: 15_000,
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ["project", id],
    queryFn: async ({ signal }) =>
      (
        await graphql<{ project: Project | null }>(
          `query($id: ID!) { project(id: $id) { ${projectFields} } }`,
          { id },
          signal,
        )
      ).project,
  });
}

export function useRuns(projectId: string) {
  return useQuery({
    queryKey: ["runs", projectId],
    queryFn: async ({ signal }) =>
      (
        await graphql<{ getRuns: Run[] }>(
          `query($id: ID!) { getRuns(projectId: $id, limit: 1000) { ${runFields} } }`,
          { id: projectId },
          signal,
        )
      ).getRuns,
    refetchInterval: 5_000,
  });
}

export function useRun(id: string | undefined) {
  return useQuery({
    queryKey: ["run", id],
    enabled: !!id,
    queryFn: async ({ signal }) =>
      (
        await graphql<{ getRun: Run | null }>(
          `query($id: ID!) { getRun(id: $id) { ${runFields} } }`,
          { id },
          signal,
        )
      ).getRun,
    refetchInterval: (query) =>
      isActive(query.state.data?.status) ? 3_000 : false,
  });
}

export function useActions(projectId: string) {
  return useQuery({
    queryKey: ["actions", projectId],
    queryFn: async ({ signal }) =>
      (
        await graphql<{ actions: Action[] }>(
          `query($id: ID!) { actions(projectId: $id) { ${actionFields} } }`,
          { id: projectId },
          signal,
        )
      ).actions,
  });
}

export function mergeLogs(saved: Log[], incoming: Log[]): Log[] {
  const byId = new Map(saved.map((log) => [log.id, log]));
  incoming.forEach((log) => byId.set(log.id, log));
  return [...byId.values()].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
}

export function useLogs(jobId: string, active: boolean) {
  const client = useQueryClient();
  return useQuery({
    queryKey: ["logs", jobId],
    queryFn: async ({ signal }) => {
      const { logs } = await graphql<{ logs: Log[] }>(
        "query($id: ID!) { logs(jobId: $id) { id jobId message createdAt } }",
        { id: jobId },
        signal,
      );
      // A snapshot may finish after a newer WebSocket line arrives.
      return mergeLogs(logs, client.getQueryData<Log[]>(["logs", jobId]) || []);
    },
    refetchInterval: active ? 5_000 : false,
  });
}

export function isActive(status?: string | null) {
  return status === "RUNNING" || status === "PENDING";
}

export function useLiveEvents() {
  const client = useQueryClient();
  const setConnection = useSetAtom(connectionAtom);
  useEffect(() => {
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    let heartbeat: ReturnType<typeof setInterval>;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let attempts = 0;
    const invalidate = () => {
      if (refresh) return;
      refresh = setTimeout(() => {
        refresh = undefined;
        for (const key of ["projects", "project", "runs", "run"])
          void client.invalidateQueries({ queryKey: [key] });
      }, 100);
    };
    const connect = () => {
      if (disposed) return;
      const url = new URL(
        import.meta.env.VITE_APP_WS_URL || "/ws",
        new URL(endpoint, location.origin),
      );
      if (url.protocol === "https:") url.protocol = "wss:";
      else if (url.protocol === "http:") url.protocol = "ws:";
      socket = new WebSocket(url);
      socket.onopen = () => {
        attempts = 0;
        setConnection("live");
        // Recover persisted output and status after any disconnected interval.
        void client.invalidateQueries();
        heartbeat = setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) socket.send("heartbeat");
        }, 15_000);
      };
      socket.onmessage = (message) => {
        try {
          const event = JSON.parse(String(message.data)) as {
            channel: string;
            data: Record<string, unknown>;
          };
          const data = event.data;
          if (event.channel === "logs") {
            if (
              typeof data.id === "string" &&
              typeof data.jobId === "string" &&
              typeof data.text === "string" &&
              typeof data.createdAt === "string"
            ) {
              const log: Log = {
                id: data.id,
                jobId: data.jobId,
                message: data.text,
                createdAt: data.createdAt,
              };
              client.setQueryData<Log[]>(["logs", log.jobId], (old) =>
                mergeLogs(old || [], [log]),
              );
            } else {
              // Compatibility with older local servers without log IDs.
              void client.invalidateQueries({ queryKey: ["logs", data.jobId] });
            }
          } else if (event.channel === "run") {
            const run = data as unknown as Run;
            client.setQueryData(["run", run.id], run);
            invalidate();
          } else if (event.channel === "job") {
            const job = data as unknown as Job;
            client.setQueriesData<Run | null>({ queryKey: ["run"] }, (run) =>
              run
                ? {
                    ...run,
                    jobs: run.jobs.map((item) =>
                      item.id === job.id ? job : item,
                    ),
                  }
                : run,
            );
            void client.invalidateQueries({ queryKey: ["logs", job.id] });
            invalidate();
          } else if (["project", "update-stats"].includes(event.channel)) {
            invalidate();
          }
        } catch {
          /* Ignore messages outside the local event protocol. */
        }
      };
      socket.onclose = () => {
        clearInterval(heartbeat);
        if (disposed) return;
        setConnection("reconnecting");
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempts++, 15_000));
      };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      clearTimeout(refresh);
      clearInterval(heartbeat);
      socket?.close();
    };
  }, [client, setConnection]);
}
