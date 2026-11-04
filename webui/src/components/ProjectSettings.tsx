import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import hljs from "highlight.js/lib/core";
import yaml from "highlight.js/lib/languages/yaml";
import {
  IconArchive as Archive,
  IconDownload as Download,
  IconDeviceFloppy as Save,
  IconTrash as Trash2,
} from "@tabler/icons-react";
import { graphql } from "../api";
import type { Project } from "../types";
import { CopyButton, download, ErrorNotice, Loading, Modal } from "./ui";

export function ProjectSettings({ project }: { project: Project }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(project.displayName || project.name);
  const [description, setDescription] = useState(project.description || "");
  const [tags, setTags] = useState((project.tags || []).join(", "));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState("");
  const mutation = useMutation({
    mutationFn: async (action: "save" | "archive" | "delete") => {
      if (action === "save")
        await graphql(
          "mutation($id: ID!, $name: String!, $description: String!, $tags: String!) { updateProject(id: $id, name: $name, description: $description, tags: $tags) { id } }",
          { id: project.id, name, description, tags },
        );
      if (action === "archive")
        await graphql(
          `mutation($id: ID!) { ${project.archived ? "unarchiveProject" : "archiveProject"}(id: $id) { id } }`,
          { id: project.id },
        );
      if (action === "delete")
        await graphql("mutation($id: ID!) { deleteProject(id: $id) }", {
          id: project.id,
        });
      return action;
    },
    onSuccess: (action) => {
      void client.invalidateQueries({ queryKey: ["projects"] });
      void client.invalidateQueries({ queryKey: ["project", project.id] });
      setNotice("Changes saved.");
      if (action === "delete") navigate("/");
    },
  });
  return (
    <div className="max-w-2xl">
      <h2 className="mb-1 text-base font-medium">Project settings</h2>
      <p className="mb-6 text-sm text-muted">
        Your project metadata and local workspace.
      </p>
      {mutation.error && <ErrorNotice error={mutation.error} />}
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate("save");
        }}
      >
        <label className="field-label">
          Display name
          <input
            className="input"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="field-label">
          Description
          <textarea
            className="input min-h-24"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <label className="field-label">
          Tags
          <input
            className="input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="rust, backend, release"
          />
        </label>
        <label className="field-label">
          Workspace path
          <input
            className="input font-mono text-muted"
            readOnly
            value={project.path}
          />
        </label>
        <div className="flex items-center gap-4">
          <button className="btn-primary" disabled={mutation.isPending}>
            <Save size={14} />
            Save changes
          </button>
          <span role="status" className="text-xs text-accent">
            {notice}
          </span>
        </div>
      </form>
      <div className="mt-10 space-y-5 border-t border-line pt-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm">
              {project.archived ? "Restore project" : "Archive project"}
            </p>
            <p className="mt-1 text-xs text-muted">
              {project.archived
                ? "Bring this project back to your active workspace."
                : "Keep history and hide the project from your active workspace."}
            </p>
          </div>
          <button
            className="btn-secondary"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("archive")}
          >
            <Archive size={14} />
            {project.archived ? "Restore" : "Archive"}
          </button>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm">Delete project</p>
            <p className="mt-1 text-xs text-muted">
              Remove the project from Studio. Files on disk are kept.
            </p>
          </div>
          <button
            className="btn-secondary text-danger"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 size={14} />
            Delete
          </button>
        </div>
      </div>
      {confirmDelete && (
        <Modal title="Delete project?" onClose={() => setConfirmDelete(false)}>
          <p className="text-sm leading-6 text-muted">
            Remove{" "}
            <strong className="text-text">
              {project.displayName || project.name}
            </strong>{" "}
            from Studio? This cannot be undone. Your workspace files will remain
            on disk.
          </p>
          {mutation.error && <ErrorNotice error={mutation.error} />}
          <div className="mt-6 flex justify-end gap-2">
            <button
              className="btn-secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Keep project
            </button>
            <button
              className="btn-cancel"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("delete")}
            >
              Delete project
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

hljs.registerLanguage("yaml", yaml);

const providers = [
  { id: "github", name: "GitHub Actions", file: "ci.yml" },
  { id: "gitlab", name: "GitLab CI", file: ".gitlab-ci.yml" },
  { id: "azure", name: "Azure Pipelines", file: "azure-pipelines.yml" },
  { id: "circleci", name: "CircleCI", file: "config.yml" },
  { id: "aws", name: "AWS CodeBuild", file: "buildspec.yml" },
];

export function ExportView({ projectId }: { projectId: string }) {
  const [provider, setProvider] = useState(providers[0]);
  const query = useQuery({
    queryKey: ["export", projectId, provider.id],
    queryFn: async ({ signal }) =>
      (
        await graphql<{ exportActions: string }>(
          "query($id: ID!, $provider: String!) { exportActions(projectId: $id, plateform: $provider) }",
          { id: projectId, provider: provider.id },
          signal,
        )
      ).exportActions,
  });
  const highlighted = useMemo(
    () => hljs.highlight(query.data || "", { language: "yaml" }).value,
    [query.data],
  );
  return (
    <div>
      <div className="mb-6 flex flex-wrap justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">Run locally. Ship anywhere.</h2>
          <p className="mt-1 text-sm text-muted">
            Export your saved actions as a CI configuration.
          </p>
        </div>
        <select
          aria-label="CI provider"
          className="input w-auto"
          value={provider.id}
          onChange={(event) =>
            setProvider(
              providers.find((item) => item.id === event.target.value)!,
            )
          }
        >
          {providers.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorNotice error={query.error} retry={() => void query.refetch()} />
      ) : (
        <>
          <div className="flex items-center justify-between rounded-t-lg border border-line bg-panel px-4 py-3">
            <span className="font-mono text-xs text-muted">
              {provider.file}
            </span>
            <div className="flex gap-2">
              <CopyButton value={query.data || ""} />
              <button
                className="btn-secondary"
                onClick={() => download(provider.file, query.data || "")}
              >
                <Download size={14} />
                Download
              </button>
            </div>
          </div>
          <pre className="overflow-auto rounded-b-lg border border-t-0 border-line bg-terminal p-5 font-mono text-xs leading-6 text-log">
            {/* Highlight.js escapes source text before adding token markup. */}
            <code
              className="yaml-code language-yaml"
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          </pre>
        </>
      )}
    </div>
  );
}
