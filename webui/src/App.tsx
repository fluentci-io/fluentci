import { useCallback, useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  matchPath,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { repositorySchema, type RepositoryValues } from "./forms";
import { useAtom, useAtomValue } from "jotai";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  IconActivity as Activity,
  IconDownload as ArrowDownToLine,
  IconArrowRight as ArrowRight,
  IconBox as Box,
  IconChevronRight as ChevronRight,
  IconCode as Code2,
  IconCommand as Command,
  IconFolder as Folder,
  IconFolderCode as FolderGit2,
  IconGitBranch as GitBranch,
  IconLayoutGrid as LayoutGrid,
  IconPlus as Plus,
  IconLayoutSidebarLeftCollapse as PanelLeftClose,
  IconLayoutSidebarLeftExpand as PanelLeftOpen,
  IconSearch as Search,
  IconAdjustmentsHorizontal as Settings2,
  IconTerminal2 as Terminal,
  IconRoute as Workflow,
} from "@tabler/icons-react";
import {
  graphql,
  isActive,
  projectFields,
  runFields,
  useLiveEvents,
  useProject,
  useProjects,
  useRun,
  useRuns,
} from "./api";
import { actionDraftsAtom, connectionAtom, projectSearchAtom } from "./state";
import type { Project, Run } from "./types";
import { HistoryBars } from "./components/HistoryBars";
import { PipelineControl } from "./components/PipelineControl";
import { RunView } from "./components/RunView";
import { ActionsEditor } from "./components/ActionsEditor";
import { ExportView, ProjectSettings } from "./components/ProjectSettings";
import { CommandPalette } from "./components/CommandPalette";
import {
  CopyButton,
  date,
  duration,
  Empty,
  ErrorNotice,
  Loading,
  Modal,
  StatusIcon,
  statusLabel,
} from "./components/ui";

export default function App() {
  useLiveEvents();
  const projects = useProjects();
  const connection = useAtomValue(connectionAtom);
  const drafts = useAtomValue(actionDraftsAtom);
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [palette, setPalette] = useState(false);
  const [newProject, setNewProject] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (window.innerWidth < 1024) return false;
    return localStorage.getItem("studio.sidebarOpen") !== "false";
  });
  const toggleSidebar = () => {
    setSidebarOpen((open) => {
      if (window.innerWidth >= 1024)
        localStorage.setItem("studio.sidebarOpen", String(!open));
      return !open;
    });
  };
  useEffect(() => {
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, [location.pathname]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape" && window.innerWidth < 1024)
        setSidebarOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);
  const projectId = matchPath("/project/:id/*", location.pathname)?.params.id;
  const currentProject = projects.data?.find(
    (project) => project.id === projectId,
  );
  const histories = useQueries({
    queries: (projects.data || []).map((project) => ({
      queryKey: ["runs", project.id],
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        (
          await graphql<{ getRuns: Run[] }>(
            `query($id: ID!) { getRuns(projectId: $id, limit: 1000) { ${runFields} } }`,
            { id: project.id },
            signal,
          )
        ).getRuns,
      refetchInterval: 10_000,
    })),
  });
  const allRuns = histories
    .flatMap((query) => query.data || [])
    .sort((a, b) => b.date.localeCompare(a.date));
  const currentRuns = allRuns.filter((run) => run.projectId === projectId);
  const controllingRun =
    currentRuns.find((run) => isActive(run.status)) || currentRuns[0];
  const mutation = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Select a project first.");
      if (isActive(controllingRun?.status)) {
        return (
          await graphql<{ cancelRun: Run }>(
            `mutation($id: ID!) { cancelRun(id: $id) { ${runFields} } }`,
            { id: controllingRun.id },
          )
        ).cancelRun;
      }
      if (drafts[projectId])
        throw new Error(
          "Save your action changes before starting the pipeline.",
        );
      return (
        await graphql<{ runPipeline: Run }>(
          `mutation($id: ID!) { runPipeline(projectId: $id, wait: false) { ${runFields} } }`,
          { id: projectId },
        )
      ).runPipeline;
    },
    onSuccess: (run) => {
      client.setQueryData(["run", run.id], run);
      client.setQueryData<Run[]>(["runs", run.projectId], (old) => [
        run,
        ...(old || []).filter((item) => item.id !== run.id),
      ]);
      void client.invalidateQueries({ queryKey: ["runs", run.projectId] });
      navigate(`/project/${run.projectId}/run/${run.id}`);
    },
  });
  const control = useCallback(() => {
    if (!mutation.isPending) mutation.mutate();
  }, [mutation]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(drafts).length) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [drafts]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((open) => !open);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="min-h-screen bg-canvas text-text">
      {sidebarOpen && (
        <button
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        id="studio-sidebar"
        aria-label="Workspace navigation"
        hidden={!sidebarOpen}
        onClick={(event) => {
          if (
            window.innerWidth < 1024 &&
            (event.target as HTMLElement).closest("a")
          )
            setSidebarOpen(false);
        }}
        className={`${sidebarOpen ? "flex" : "hidden"} fixed bottom-0 left-0 top-14 z-40 w-60 flex-col border-r border-line bg-sidebar`}
      >
        <Link to="/" className="flex h-16 shrink-0 items-center gap-3 px-5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-canvas">
            <Workflow size={20} strokeWidth={2.5} />
          </span>
          <span className="text-lg font-semibold tracking-tight">
            fluentci
            <span className="ml-2 text-[10px] font-normal uppercase tracking-[.16em] text-muted">
              studio
            </span>
          </span>
        </Link>
        <div className="px-4">
          <button
            className="flex w-full items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2.5 text-xs text-muted transition-colors hover:border-muted/50"
            onClick={() => setPalette(true)}
          >
            <Search size={14} />
            <span className="flex-1 text-left">Quick search</span>
            <kbd>⌘ K</kbd>
          </button>
        </div>
        <div className="px-4 pb-6 pt-7">
          <p className="section-label mb-3 px-3">Workspace</p>
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `nav-item ${isActive ? "nav-active" : ""}`
            }
          >
            <LayoutGrid size={16} />
            Overview
          </NavLink>
        </div>
        <div className="mb-3 flex items-center justify-between px-7">
          <p className="section-label">Projects</p>
          <button
            className="icon-btn"
            aria-label="Add project"
            onClick={() => setNewProject(true)}
          >
            <Plus size={14} />
          </button>
        </div>
        <nav
          className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4"
          aria-label="Projects"
        >
          {projects.data
            ?.filter((project) => !project.archived)
            .map((project) => (
              <NavLink
                key={project.id}
                to={`/project/${project.id}`}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "nav-active" : ""}`
                }
              >
                <Folder size={15} className="shrink-0" />
                <span className="truncate">
                  {project.displayName || project.name}
                </span>
                {allRuns.some(
                  (run) => run.projectId === project.id && isActive(run.status),
                ) && (
                  <span className="ml-auto size-1.5 animate-pulse rounded-full bg-accent" />
                )}
              </NavLink>
            ))}
          {!projects.data?.length && (
            <p className="px-3 text-xs leading-6 text-muted">
              Your local projects will appear here.
            </p>
          )}
        </nav>
        <div className="m-4 rounded-lg border border-line bg-panel p-3.5">
          <div className="flex items-center gap-2 text-xs font-medium">
            <span
              className={`size-1.5 rounded-full ${connection === "live" ? "bg-success" : "animate-pulse bg-warning"}`}
            />
            Local engine
          </div>
          <p className="mt-1.5 pl-3.5 text-[11px] text-muted">
            {connection === "live"
              ? "Connected · live updates"
              : connection === "connecting"
                ? "Connecting to event stream…"
                : "Reconnecting · recovering logs"}
          </p>
        </div>
        <div className="flex items-center justify-between border-t border-line px-7 py-4 text-[10px] text-muted">
          <span>BUILT FOR YOUR MACHINE</span>
          <Terminal size={13} />
        </div>
      </aside>
      <div className={sidebarOpen ? "pt-14 lg:pl-60" : "pt-14"}>
        <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center justify-between gap-4 border-b border-line bg-panel px-4">
          <button
            className="icon-btn"
            aria-label={sidebarOpen ? "Hide left panel" : "Show left panel"}
            title={sidebarOpen ? "Hide left panel" : "Show left panel"}
            aria-expanded={sidebarOpen}
            aria-controls="studio-sidebar"
            onClick={toggleSidebar}
          >
            {sidebarOpen ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
            <Link
              to="/"
              className="flex items-center gap-2 text-muted hover:text-text"
            >
              <Box size={15} />
              <span className="hidden sm:inline">Local workspace</span>
            </Link>
            <ChevronRight size={13} className="shrink-0 text-muted/50" />
            <span className="truncate">
              {currentProject
                ? currentProject.displayName || currentProject.name
                : "Overview"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-[10px] text-muted sm:flex">
              <span className="size-1.5 rounded-full bg-accent" />
              LOCAL FIRST
            </span>
            <button
              className="icon-btn"
              aria-label="Open command palette"
              onClick={() => setPalette(true)}
            >
              <Search size={17} />
            </button>
            <span className="flex size-7 items-center justify-center rounded-full border border-line bg-panel text-[11px] font-medium text-muted">
              FC
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-5 md:px-6 md:py-6">
          <Routes>
            <Route
              path="/"
              element={
                <Overview
                  projects={projects.data || []}
                  runs={allRuns}
                  loading={projects.isPending}
                  error={
                    projects.error ||
                    histories.find((query) => query.error)?.error
                  }
                  onRetry={() => void client.invalidateQueries()}
                  onNew={() => setNewProject(true)}
                />
              }
            />
            <Route
              path="/project/:id/*"
              element={
                <ProjectPage
                  controllingRun={controllingRun}
                  pending={mutation.isPending}
                  control={control}
                  controlError={mutation.error}
                />
              }
            />
            <Route
              path="*"
              element={
                <Empty icon={<Folder size={28} />} title="Page not found">
                  <Link className="text-accent" to="/">
                    Return to workspace
                  </Link>
                </Empty>
              }
            />
          </Routes>
        </main>
      </div>
      {palette && (
        <CommandPalette
          projects={projects.data || []}
          runs={allRuns}
          currentProject={currentProject}
          currentRun={controllingRun}
          onControl={control}
          onClose={() => setPalette(false)}
        />
      )}
      {newProject && <NewProject onClose={() => setNewProject(false)} />}
    </div>
  );
}

function Overview({
  projects,
  runs,
  loading,
  error,
  onRetry,
  onNew,
}: {
  projects: Project[];
  runs: Run[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useAtom(projectSearchAtom);
  const [archived, setArchived] = useState(false);
  const filtered = projects.filter(
    (project) =>
      !!project.archived === archived &&
      `${project.displayName} ${project.name} ${project.path} ${(project.tags || []).join(" ")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const activeProjects = projects.filter((project) => !project.archived);
  const recent = runs.filter(
    (run) =>
      Date.now() - new Date(run.date).getTime() < 7 * 24 * 60 * 60 * 1000,
  );
  const finished = recent.filter((run) =>
    ["SUCCESS", "FAILURE"].includes(run.status || ""),
  );
  const rate = finished.length
    ? `${Math.round((100 * finished.filter((run) => run.status === "SUCCESS").length) / finished.length)}%`
    : "—";
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="section-label mb-2 text-accent">FluentCI Studio</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Workspace overview
          </h1>
          <p className="mt-2 text-sm text-muted">
            Your local projects and pipeline activity.
          </p>
        </div>
        <button className="btn-primary" onClick={onNew}>
          <Plus size={16} />
          Add project
        </button>
      </div>
      {!!error && <ErrorNotice error={error} retry={onRetry} />}
      <div className="mb-9 grid grid-cols-2 divide-x divide-line overflow-hidden rounded-xl border border-line bg-panel xl:grid-cols-4">
        {[
          {
            label: "Active projects",
            value: String(activeProjects.length),
            detail: "in your local workspace",
            icon: <FolderGit2 size={17} />,
          },
          {
            label: "Running now",
            value: String(runs.filter((run) => isActive(run.status)).length),
            detail: "pipelines in progress",
            icon: <Activity size={17} />,
          },
          {
            label: "Runs this week",
            value: String(recent.length),
            detail: "over the last 7 days",
            icon: <Terminal size={17} />,
          },
          {
            label: "Success rate",
            value: rate,
            detail: "completed runs · last 7 days",
            icon: <GitBranch size={17} />,
          },
        ].map((metric) => (
          <div key={metric.label} className="p-4">
            <div className="flex items-center justify-between text-xs text-muted">
              {metric.label}
              <span className="text-accent/70">{metric.icon}</span>
            </div>
            <p className="mb-2 mt-4 font-mono text-3xl tracking-tight">
              {loading ? "—" : metric.value}
            </p>
            <p className="text-[11px] text-muted">{metric.detail}</p>
          </div>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-medium">Your projects</h2>
          <span className="rounded-md border border-line px-2 py-0.5 font-mono text-[10px] text-muted">
            {filtered.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={archived}
              onChange={(event) => setArchived(event.target.checked)}
            />
            Archived
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-line bg-panel px-3">
            <Search size={14} className="text-muted" />
            <input
              className="w-40 bg-transparent py-2.5 text-xs outline-none placeholder:text-muted sm:w-48"
              aria-label="Filter projects"
              placeholder="Filter projects…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
        </div>
      </div>
      {loading ? (
        <Loading />
      ) : !filtered.length ? (
        <Empty
          icon={<FolderGit2 size={30} />}
          title={
            search
              ? "No matching projects"
              : archived
                ? "No archived projects"
                : "Your next build starts here"
          }
        >
          {search ? (
            "Try another name, path, or tag."
          ) : (
            <>
              <p>Open a terminal in your project and run:</p>
              <code className="my-3 inline-block rounded-md border border-line bg-terminal px-4 py-2 text-accent">
                fluentci studio
              </code>
              <p>
                Studio detects your project and available actions automatically.
              </p>
            </>
          )}
        </Empty>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              runs={runs.filter((run) => run.projectId === project.id)}
            />
          ))}
        </div>
      )}
      <div className="mt-9 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-[11px] text-muted">
        <span className="flex items-center gap-2">
          <Terminal size={13} />
          Local execution. Shared CLI history. No account needed.
        </span>
        <span className="flex items-center gap-1.5">
          <Command size={12} />K to jump anywhere
        </span>
      </div>
    </>
  );
}

function ProjectCard({ project, runs }: { project: Project; runs: Run[] }) {
  const latest = runs[0];
  const completed = runs.filter((run) =>
    ["SUCCESS", "FAILURE"].includes(run.status || ""),
  );
  const rate = completed.length
    ? `${Math.round((100 * completed.filter((run) => run.status === "SUCCESS").length) / completed.length)}%`
    : "—";
  return (
    <article className="rounded-xl border border-line bg-panel p-5 transition-colors hover:border-muted/40">
      <div className="mb-5 flex items-start gap-3">
        <Link
          to={`/project/${project.id}`}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-line bg-elevated text-accent"
          aria-label={`Open ${project.displayName || project.name}`}
        >
          <FolderGit2 size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to={`/project/${project.id}`}
            className="text-sm font-medium hover:text-accent"
          >
            {project.displayName || project.name}
          </Link>
          <p
            className="mt-1 truncate font-mono text-[10px] text-muted"
            title={project.path}
          >
            {project.path}
          </p>
        </div>
        <Link
          to={`/project/${project.id}`}
          className="icon-btn"
          aria-label={`View ${project.displayName || project.name}`}
        >
          <ArrowRight size={15} />
        </Link>
      </div>
      {project.description && (
        <p className="mb-5 line-clamp-2 text-xs leading-5 text-muted">
          {project.description}
        </p>
      )}
      <div className="mb-2 flex items-center justify-between text-[10px] text-muted">
        <span className="uppercase tracking-widest">Build history</span>
        <span>
          {runs.length
            ? `Last ${Math.min(runs.length, 24)} runs`
            : "No runs yet"}
        </span>
      </div>
      <HistoryBars compact runs={runs} projectId={project.id} />
      <div className="mt-5 flex items-center gap-2 border-t border-line pt-4 text-xs">
        <StatusIcon status={latest?.status} />
        <span>{statusLabel(latest?.status)}</span>
        <span className="ml-auto text-muted">
          {latest ? duration(latest.duration) : "Ready to run"}
        </span>
        <span className="mx-2 text-line">|</span>
        <span className="text-muted">{rate} passed</span>
      </div>
    </article>
  );
}

function ProjectPage({
  controllingRun,
  pending,
  control,
  controlError,
}: {
  controllingRun?: Run;
  pending: boolean;
  control: () => void;
  controlError: unknown;
}) {
  const { id = "" } = useParams();
  const project = useProject(id);
  const runs = useRuns(id);
  const location = useLocation();
  const runId = matchPath("/project/:id/run/:runId", location.pathname)?.params
    .runId;
  const detail = useRun(runId || runs.data?.[0]?.id);
  const current =
    detail.data ??
    (runId ? runs.data?.find((run) => run.id === runId) : runs.data?.[0]);
  const base = `/project/${id}`;
  const tab = location.pathname.endsWith("/actions")
    ? "actions"
    : location.pathname.endsWith("/settings")
      ? "settings"
      : location.pathname.endsWith("/export")
        ? "export"
        : "execution";
  if (project.isPending) return <Loading />;
  if (project.error)
    return (
      <ErrorNotice error={project.error} retry={() => void project.refetch()} />
    );
  if (!project.data)
    return (
      <Empty icon={<Folder size={28} />} title="Project not found">
        <Link to="/" className="text-accent">
          Return to workspace
        </Link>
      </Empty>
    );
  const item = project.data;
  return (
    <div key={id}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-accent">
            <span className="size-1.5 rounded-full bg-accent" />
            Local pipeline
            {item.archived && <span className="text-warning">· Archived</span>}
          </div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
            {item.displayName || item.name}
          </h1>
          <p className="mt-2 flex items-center gap-2 break-all font-mono text-[11px] text-muted">
            <Folder size={12} className="shrink-0" />
            {item.path}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <PipelineControl
            run={controllingRun}
            pending={pending}
            disabled={!!item.archived || runs.isPending || runs.isError}
            onRun={control}
            onCancel={control}
          />
          {isActive(controllingRun?.status) &&
            current?.id !== controllingRun?.id && (
              <Link
                className="text-xs text-accent"
                to={`${base}/run/${controllingRun!.id}`}
              >
                View active execution →
              </Link>
            )}
        </div>
      </div>
      {!!controlError && <ErrorNotice error={controlError} />}
      <nav
        aria-label="Project tabs"
        className="mb-7 flex gap-6 overflow-x-auto border-b border-line"
      >
        {[
          {
            id: "execution",
            name: "Execution",
            icon: <Terminal size={14} />,
            path: "",
          },
          {
            id: "actions",
            name: "Actions",
            icon: <Code2 size={14} />,
            path: "/actions",
          },
          {
            id: "export",
            name: "CI export",
            icon: <ArrowDownToLine size={14} />,
            path: "/export",
          },
          {
            id: "settings",
            name: "Settings",
            icon: <Settings2 size={14} />,
            path: "/settings",
          },
        ].map((item) => (
          <Link
            key={item.id}
            to={`${base}${item.path}`}
            aria-current={tab === item.id ? "page" : undefined}
            className={`flex items-center gap-2 whitespace-nowrap border-b-2 pb-3.5 text-xs transition-colors ${tab === item.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-text"}`}
          >
            {item.icon}
            {item.name}
          </Link>
        ))}
      </nav>
      {tab === "actions" ? (
        <ActionsEditor key={id} projectId={id} archived={!!item.archived} />
      ) : tab === "settings" ? (
        <ProjectSettings key={id} project={item} />
      ) : tab === "export" ? (
        <ExportView projectId={id} />
      ) : (
        <>
          <div className="grid min-w-0 gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
            <section
              className="min-w-0 self-start rounded-xl border border-line bg-panel p-3"
              aria-label="Run history"
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <h2 className="text-xs font-medium">Recent runs</h2>
                <span className="font-mono text-[10px] text-muted">
                  {runs.data?.length || 0} runs
                </span>
              </div>
              <HistoryBars
                compact
                runs={runs.data || []}
                projectId={id}
                selectedId={current?.id}
              />
              <Link
                className="my-3 block px-1 text-[11px] text-accent hover:underline"
                to={base}
              >
                Latest run
              </Link>
              <div className="max-h-64 space-y-1.5 overflow-y-auto xl:max-h-[60vh]">
                {runs.data?.map((run) => (
                  <Link
                    key={run.id}
                    to={`${base}/run/${run.id}`}
                    aria-current={current?.id === run.id ? "page" : undefined}
                    className={`block rounded-lg border p-2.5 transition-colors ${current?.id === run.id ? "border-accent/40 bg-accent/10" : "border-line hover:bg-elevated"}`}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <StatusIcon status={run.status} />
                      <span className="min-w-0 flex-1 truncate">
                        {run.title || run.id.slice(0, 8)}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted">
                        {duration(run.duration)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-muted">
                      <span>{statusLabel(run.status)}</span>
                      <span className="truncate">{date(run.date)}</span>
                    </div>
                  </Link>
                ))}
                {!runs.data?.length && (
                  <p className="p-2 text-xs text-muted">
                    Run your pipeline to start building a history.
                  </p>
                )}
              </div>
            </section>
            <div className="min-w-0">
              {runs.error ? (
                <ErrorNotice
                  error={runs.error}
                  retry={() => void runs.refetch()}
                />
              ) : runs.isPending ||
                (detail.isPending && !!(runId || runs.data?.length)) ? (
                <Loading />
              ) : detail.error ? (
                <ErrorNotice
                  error={detail.error}
                  retry={() => void detail.refetch()}
                />
              ) : runId && !current ? (
                <Empty icon={<Terminal size={24} />} title="Run not found">
                  Select another run from the build history.
                </Empty>
              ) : current && current.projectId !== id ? (
                <ErrorNotice error="This run belongs to another project." />
              ) : (
                <RunView run={current} />
              )}
            </div>
          </div>
          {current && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
              <div>
                <p className="text-[11px] text-muted">
                  Continue in your terminal
                </p>
                <code className="mt-1 block font-mono text-[11px] text-muted">
                  FLUENTCI_PROJECT_ID={id} fluentci run .
                </code>
              </div>
              <CopyButton
                value={`FLUENTCI_PROJECT_ID=${id} fluentci run .`}
                label="Copy command"
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NewProject({ onClose }: { onClose: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RepositoryValues>({
    resolver: zodResolver(repositorySchema),
    defaultValues: { repository: "" },
    mode: "onTouched",
  });
  const [mode, setMode] = useState<"local" | "clone">("local");
  const client = useQueryClient();
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: async ({ repository }: RepositoryValues) =>
      (
        await graphql<{ createProject: Project }>(
          `mutation($repository: String!) { createProject(fromRepository: $repository) { ${projectFields} } }`,
          { repository },
        )
      ).createProject,
    onSuccess: (project) => {
      void client.invalidateQueries({ queryKey: ["projects"] });
      navigate(`/project/${project.id}`);
      onClose();
    },
  });
  return (
    <Modal title="Add a project" onClose={onClose}>
      <div className="mb-6 flex rounded-lg border border-line bg-terminal p-1">
        {(["local", "clone"] as const).map((item) => (
          <button
            key={item}
            className={`flex-1 rounded-md px-4 py-2 text-xs ${mode === item ? "bg-elevated text-text" : "text-muted"}`}
            onClick={() => setMode(item)}
          >
            {item === "local" ? "Local directory" : "Clone repository"}
          </button>
        ))}
      </div>
      {mode === "local" ? (
        <>
          <p className="text-sm leading-6 text-muted">
            Open a terminal in your project directory and start Studio. Your
            project and its actions are detected automatically.
          </p>
          <div className="my-5 flex items-center justify-between rounded-lg border border-line bg-terminal p-3">
            <code className="font-mono text-sm text-accent">
              fluentci studio
            </code>
            <CopyButton value="fluentci studio" />
          </div>
          <p className="text-xs leading-5 text-muted">
            Already running Studio? Use the same database and select an
            available port with <code>fluentci studio --port 6077</code>.
            Projects appear in this workspace automatically.
          </p>
        </>
      ) : (
        <form
          noValidate
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
        >
          <label className="field-label">
            Git repository URL
            <input
              autoFocus
              className="input font-mono"
              placeholder="https://github.com/you/project.git"
              {...register("repository")}
              aria-invalid={!!errors.repository}
              aria-describedby={
                errors.repository ? "repository-error" : undefined
              }
            />
          </label>
          {errors.repository && (
            <p
              id="repository-error"
              role="alert"
              className="mt-2 text-xs text-danger"
            >
              {errors.repository.message}
            </p>
          )}
          <p className="mt-3 text-xs leading-5 text-muted">
            Cloned into ~/.fluentci/workspace. Uses your local Git credentials.
          </p>
          {mutation.error && <ErrorNotice error={mutation.error} />}
          <button
            type="submit"
            className="btn-primary mt-5 w-full"
            disabled={mutation.isPending}
          >
            <GitBranch size={15} />
            {mutation.isPending
              ? "Cloning repository…"
              : "Clone and add project"}
          </button>
        </form>
      )}
    </Modal>
  );
}
