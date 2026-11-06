import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import {
  IconArrowDown as ArrowDown,
  IconArrowUp as ArrowUp,
  IconCornerDownLeft as CornerDownLeft,
  IconFolder as Folder,
  IconGitBranch as WorkflowIcon,
  IconSearch as Search,
  IconTerminal2 as Terminal,
  IconX as X,
} from "@tabler/icons-react";
import type { Project, Run, SearchResult, Workflow } from "../types";
import { workflowSearch } from "../state";
import { graphql, isActive, workflowFields } from "../api";
import { date, statusLabel } from "./ui";

interface Command {
  id: string;
  title: string;
  subtitle: string;
  group: string;
  execute: () => void;
}

export function CommandPalette({
  projects,
  runs,
  currentProject,
  currentRun,
  onControl,
  onClose,
}: {
  projects: Project[];
  runs: Run[];
  currentProject?: Project;
  currentRun?: Run;
  onControl?: () => void;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const workflowId =
    new URLSearchParams(location.search).get("workflow") ||
    currentRun?.workflowId ||
    "default";
  const workflowQueries = useQueries({
    queries: projects.map((project) => ({
      queryKey: ["workflows", project.id],
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        (
          await graphql<{ workflows: Workflow[] }>(
            `query($id: ID!) { workflows(projectId: $id) { ${workflowFields} } }`,
            { id: project.id },
            signal,
          )
        ).workflows,
    })),
  });
  const workflowCommands = projects.flatMap((project, index) =>
    (workflowQueries[index].data || []).map((workflow) => ({
      project,
      workflow,
    })),
  );

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(0);
  const [debounced, setDebounced] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 150);
    return () => clearTimeout(timer);
  }, [search]);
  const indexed = useQuery({
    queryKey: ["search", debounced],
    enabled: debounced.length >= 2,
    queryFn: async ({ signal }) =>
      (
        await graphql<{ search: SearchResult[] }>(
          "query($query: String!) { search(query: $query, limit: 30) { id kind projectId runId jobId title excerpt createdAt } }",
          { query: debounced },
          signal,
        )
      ).search,
    staleTime: 0,
  });
  const commands = (() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };
    const items: Command[] = [
      {
        id: "workspace",
        title: "Go to workspace",
        subtitle: "All local projects",
        group: "Navigation",
        execute: go("/"),
      },
    ];
    if (currentProject) {
      const base = `/project/${currentProject.id}`;
      for (const [path, title, subtitle] of [
        ["", "View latest execution", "Live steps and output"],
        ["actions", "Edit pipeline actions", "Commands, modules, environment"],
        [
          "export",
          "Export CI configuration",
          "GitHub, GitLab, Azure, CircleCI, Semaphore, AWS",
        ],
        ["settings", "Project settings", "Name, tags, archive"],
      ])
        items.push({
          id: `nav-${path}`,
          title,
          subtitle,
          group: "Current project",
          execute: go(`${base}/${path}${workflowSearch(workflowId)}`),
        });
      if (onControl && !currentProject.archived)
        items.unshift({
          id: "control",
          title: `${isActive(currentRun?.status) ? "Cancel" : currentRun ? "Restart" : "Run"} pipeline`,
          subtitle: `${currentProject.displayName || currentProject.name} · ${currentRun?.workflowName || workflowId}`,
          group: "Pipeline",
          execute: () => {
            onControl();
            onClose();
          },
        });
    }
    items.push(
      ...projects.map((project) => ({
        id: `project-${project.id}`,
        title: project.displayName || project.name,
        subtitle: project.path,
        group: "Projects",
        execute: go(`/project/${project.id}`),
      })),
    );
    items.push(
      ...workflowCommands.map(({ project, workflow }) => ({
        id: `workflow-${project.id}-${workflow.id}`,
        title: workflow.name,
        subtitle: `${project.displayName || project.name} · ${workflow.id}${workflow.enabled ? "" : " · Disabled"}${project.archived ? " · Archived project" : ""}`,
        group: "Workflows",
        execute: go(`/project/${project.id}${workflowSearch(workflow.id)}`),
      })),
    );
    items.push(
      ...runs.map((run) => ({
        id: `run-${run.id}`,
        title: `${statusLabel(run.status)} · ${run.title}`,
        subtitle: `${run.id.slice(0, 8)} · ${date(run.date)}`,
        group: "Recent runs",
        execute: go(
          `/project/${run.projectId}/run/${run.id}${workflowSearch(run.workflowId)}`,
        ),
      })),
    );
    return items;
  })();
  const local = commands.filter((command) =>
    `${command.title} ${command.subtitle}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const remote: Command[] =
    debounced === search.trim()
      ? (indexed.data || [])
          .filter(
            (result) =>
              !local.some(
                (command) =>
                  command.id === `${result.kind.toLowerCase()}-${result.id}`,
              ),
          )
          .map((result) => ({
            id: `indexed-${result.kind}-${result.id}`,
            title:
              result.kind === "LOG" ? `Log · ${result.title}` : result.title,
            subtitle: result.excerpt,
            group:
              result.kind === "LOG" ? "Saved log matches" : "Indexed history",
            execute: () => {
              navigate(
                result.kind === "PROJECT"
                  ? `/project/${result.projectId}`
                  : `/project/${result.projectId}/run/${result.runId}${result.kind === "LOG" ? `?job=${encodeURIComponent(result.jobId || "")}&log=${encodeURIComponent(result.id)}` : ""}`,
              );
              onClose();
            },
          }))
      : [];
  const filtered = [...local, ...remote].slice(0, 80);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-index="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <dialog
      ref={dialog}
      aria-label="Quick search"
      className="modal max-w-2xl overflow-hidden p-0"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (filtered.length)
            setSelected(
              (index) =>
                (index +
                  (event.key === "ArrowDown" ? 1 : filtered.length - 1)) %
                filtered.length,
            );
        }
        if (event.key === "Enter" && filtered[selected]) {
          event.preventDefault();
          filtered[selected].execute();
        }
      }}
    >
      <div className="flex items-center gap-3 border-b border-line px-5 py-4">
        <Search size={20} className="text-accent" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="command-results"
          aria-autocomplete="list"
          aria-activedescendant={
            filtered[selected] ? `command-${selected}` : undefined
          }
          aria-label="Search projects, workflows, runs, and commands"
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setSelected(0);
          }}
          placeholder="Search projects, workflows, runs, commands…"
        />
        <button
          aria-label="Close quick search"
          className="icon-btn"
          onClick={onClose}
        >
          <X size={16} />
        </button>
        <kbd>esc</kbd>
      </div>
      <div
        ref={list}
        id="command-results"
        role="listbox"
        aria-label="Search results"
        className="max-h-[420px] overflow-y-auto p-2"
      >
        {filtered.map((command, index) => (
          <div key={command.id}>
            {(index === 0 || filtered[index - 1].group !== command.group) && (
              <p className="px-3 pb-2 pt-4 text-[10px] font-medium uppercase tracking-widest text-muted">
                {command.group}
              </p>
            )}
            <div
              id={`command-${index}`}
              role="option"
              aria-selected={index === selected}
              data-index={index}
              onMouseMove={() => setSelected(index)}
              onClick={command.execute}
              className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 ${index === selected ? "bg-accent/10 text-accent" : "text-text"}`}
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-line bg-panel">
                {command.group === "Projects" ? (
                  <Folder size={15} />
                ) : command.group === "Workflows" ? (
                  <WorkflowIcon size={15} />
                ) : (
                  <Terminal size={15} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{command.title}</p>
                <p className="mt-1 truncate text-xs text-muted">
                  {command.subtitle}
                </p>
              </div>
              {index === selected && <CornerDownLeft size={16} />}
            </div>
          </div>
        ))}
        {!filtered.length && (
          <div className="px-4 py-12 text-center text-sm text-muted">
            No results for “{search}”. Try a workflow, project name, run ID, or
            command.
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 border-t border-line bg-panel px-5 py-3 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <ArrowUp size={12} />
          <ArrowDown size={12} /> navigate
        </span>
        <span className="flex items-center gap-1">
          <CornerDownLeft size={12} /> open
        </span>
        <span className="ml-auto" role="status">
          {indexed.isFetching
            ? "Searching saved history…"
            : indexed.isError
              ? "Saved search unavailable"
              : "Projects · workflows · runs · logs"}
        </span>
      </div>
    </dialog>
  );
}
