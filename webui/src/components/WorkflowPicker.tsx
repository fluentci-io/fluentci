import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconGitBranch,
  IconPlus,
  IconSettings,
  IconCopy,
  IconTrash,
} from "@tabler/icons-react";
import { graphql, workflowFields } from "../api";
import { workflowSchema, type WorkflowValues } from "../forms";
import type { Workflow } from "../types";
import { ErrorNotice, Modal } from "./ui";

type Mode = "create" | "edit" | "duplicate" | "delete";

export function WorkflowPicker({
  projectId,
  workflows,
  selected,
  archived,
  onSelect,
  compact = false,
}: {
  projectId: string;
  workflows: Workflow[];
  selected?: Workflow;
  archived: boolean;
  onSelect: (id: string) => void;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  return (
    <div
      className={
        compact ? "min-w-0" : "mb-6 rounded-xl border border-line bg-panel p-4"
      }
    >
      <div
        className={
          compact
            ? "flex items-center gap-1.5"
            : "flex flex-wrap items-center gap-3"
        }
      >
        {!compact && <IconGitBranch size={17} className="text-accent" />}
        <label
          className={
            compact
              ? "min-w-0 text-xs"
              : "flex min-w-0 basis-full flex-col items-start gap-2 text-xs text-muted sm:flex-1 sm:basis-auto sm:flex-row sm:items-center"
          }
        >
          <span className={compact ? "sr-only" : ""}>Workflow</span>
          <select
            aria-label="Workflow"
            className={
              compact
                ? "input w-24 truncate !py-1.5 text-xs sm:w-40"
                : "input w-full sm:w-auto sm:min-w-56"
            }
            value={selected?.id || ""}
            onChange={(event) => onSelect(event.target.value)}
          >
            {!selected && (
              <option value="" disabled>
                Select a workflow
              </option>
            )}
            {workflows.map((workflow) => (
              <option key={workflow.id} value={workflow.id}>
                {workflow.name}
                {workflow.enabled ? "" : " · Disabled"}
              </option>
            ))}
          </select>
        </label>
        {selected && !compact && (
          <span className="font-mono text-[10px] text-muted">
            {selected.stepCount} steps
          </span>
        )}
        <button
          className={compact ? "icon-btn" : "btn-secondary"}
          aria-label="New workflow"
          title="New workflow"
          disabled={archived}
          onClick={() => setMode("create")}
        >
          <IconPlus size={14} />
          {!compact && "New workflow"}
        </button>
        <button
          className="icon-btn scroll-mt-24"
          aria-label="Manage workflow"
          title="Manage workflow"
          disabled={archived || !selected}
          onClick={() => setMode("edit")}
        >
          <IconSettings size={16} />
        </button>
      </div>
      {selected && !compact && (
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
          {selected.description && <span>{selected.description}</span>}
          <code className="break-all">
            {selected.path ||
              "Default project actions · saved to a workflow file when edited"}
          </code>
        </div>
      )}
      {mode && (
        <WorkflowDialog
          key={`${mode}:${selected?.id}`}
          mode={mode}
          projectId={projectId}
          workflow={selected}
          workflows={workflows}
          onClose={() => setMode(null)}
          onMode={setMode}
          onSaved={(id) => {
            onSelect(id);
            setMode(null);
          }}
        />
      )}
    </div>
  );
}

function WorkflowDialog({
  mode,
  projectId,
  workflow,
  workflows,
  onClose,
  onMode,
  onSaved,
}: {
  mode: Mode;
  projectId: string;
  workflow?: Workflow;
  workflows: Workflow[];
  onClose: () => void;
  onMode: (mode: Mode) => void;
  onSaved: (id: string) => void;
}) {
  const client = useQueryClient();
  const editing = mode === "edit";
  const form = useForm<WorkflowValues>({
    resolver: zodResolver(workflowSchema),
    defaultValues: {
      id: editing
        ? workflow?.id
        : mode === "duplicate"
          ? `${workflow?.id}-copy`
          : "",
      name: editing
        ? workflow?.name
        : mode === "duplicate"
          ? `${workflow?.name} copy`
          : "",
      description: mode === "create" ? "" : workflow?.description || "",
      enabled: workflow?.enabled ?? true,
      env: workflow?.env.join("\n") || "",
    },
    mode: "onTouched",
  });
  // A form keeps the revision it opened with, even if polling sees a later edit.
  const [revision] = useState(workflow?.revision || "");
  const mutation = useMutation({
    mutationFn: async (values: WorkflowValues) => {
      if (!editing && workflows.some((item) => item.id === values.id)) {
        form.setError("id", {
          message: "A workflow with this ID already exists.",
        });
        throw new Error("Choose a unique workflow ID.");
      }
      if (editing) {
        await graphql(
          `mutation($id: ID!, $workflow: String!, $input: WorkflowUpdateInput!) { updateWorkflow(projectId: $id, workflowId: $workflow, input: $input) { ${workflowFields} } }`,
          {
            id: projectId,
            workflow: workflow!.id,
            input: {
              name: values.name,
              description: values.description,
              enabled: values.enabled,
              env: values.env.split("\n").filter((line) => line.trim()),
              expectedRevision: revision,
            },
          },
        );
      } else {
        await graphql(
          `mutation($id: ID!, $input: NewWorkflowInput!) { createWorkflow(projectId: $id, input: $input) { ${workflowFields} } }`,
          {
            id: projectId,
            input: {
              id: values.id,
              name: values.name,
              description: values.description,
              copyFrom: mode === "duplicate" ? workflow?.id : null,
            },
          },
        );
      }
      return values.id;
    },
    onSuccess: async (id) => {
      await client.invalidateQueries({ queryKey: ["workflows", projectId] });
      void client.invalidateQueries({ queryKey: ["actions", projectId, id] });
      void client.invalidateQueries({ queryKey: ["export", projectId, id] });
      onSaved(id);
    },
  });
  const deletion = useMutation({
    mutationFn: () =>
      graphql(
        "mutation($id: ID!, $workflow: String!, $revision: String) { deleteWorkflow(projectId: $id, workflowId: $workflow, expectedRevision: $revision) }",
        { id: projectId, workflow: workflow!.id, revision },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["workflows", projectId] });
      client.removeQueries({ queryKey: ["actions", projectId, workflow!.id] });
      onSaved("default");
    },
  });
  if (mode === "delete")
    return (
      <Modal title="Delete workflow" onClose={onClose}>
        <p className="text-sm leading-6 text-muted">
          Delete <strong className="text-text">{workflow?.name}</strong> and its
          workflow file? Existing run history will be preserved.
        </p>
        {deletion.error && <ErrorNotice error={deletion.error} />}
        <div className="mt-6 flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => onMode("edit")}>
            Back
          </button>
          <button
            className="btn-primary bg-danger text-white"
            disabled={deletion.isPending}
            onClick={() => deletion.mutate()}
          >
            {deletion.isPending ? "Deleting…" : "Delete workflow"}
          </button>
        </div>
      </Modal>
    );
  const { errors } = form.formState;
  return (
    <Modal
      title={
        editing
          ? "Manage workflow"
          : mode === "duplicate"
            ? "Duplicate workflow"
            : "New workflow"
      }
      onClose={onClose}
    >
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
        className="space-y-4"
      >
        <label className="field-label">
          Workflow ID
          <input
            autoFocus={!editing}
            className="input font-mono"
            placeholder="release"
            readOnly={editing}
            {...form.register("id")}
            aria-invalid={!!errors.id}
          />
        </label>
        {errors.id && (
          <p role="alert" className="text-xs text-danger">
            {errors.id.message}
          </p>
        )}
        <p className="text-[11px] text-muted">
          {editing
            ? "The ID stays fixed so links and history remain connected."
            : `Saved in .fluentci/workflows/${form.watch("id").trim() || "<id>"}.toml. Commit this file to share the workflow.`}
        </p>
        <label className="field-label">
          Name
          <input
            autoFocus={editing}
            className="input"
            placeholder="Release"
            {...form.register("name")}
            aria-invalid={!!errors.name}
          />
        </label>
        {errors.name && (
          <p role="alert" className="text-xs text-danger">
            {errors.name.message}
          </p>
        )}
        <label className="field-label">
          Description <span className="text-muted">(optional)</span>
          <textarea
            className="input min-h-20"
            {...form.register("description")}
            aria-invalid={!!errors.description}
          />
        </label>
        {errors.description && (
          <p role="alert" className="text-xs text-danger">
            {errors.description.message}
          </p>
        )}
        {editing && (
          <>
            <label className="field-label">
              Environment
              <textarea
                className="input min-h-24 font-mono"
                placeholder="NODE_ENV=production"
                {...form.register("env")}
                aria-invalid={!!errors.env}
              />
            </label>
            {errors.env && (
              <p role="alert" className="text-xs text-danger">
                {errors.env.message}
              </p>
            )}
            <p className="text-[11px] text-muted">
              KEY=value, one per line. Applied to all steps; step variables take
              precedence. Workflow files are version controlled—keep secrets in
              your local environment.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...form.register("enabled")} />
              Enable workflow
            </label>
          </>
        )}
        {mutation.error && <ErrorNotice error={mutation.error} />}
        <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4">
          <div className="flex gap-2">
            {editing && (
              <>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Duplicate workflow"
                  title="Duplicate workflow"
                  onClick={() => onMode("duplicate")}
                >
                  <IconCopy size={16} />
                </button>
                {workflow?.id !== "default" && (
                  <button
                    type="button"
                    className="icon-btn text-danger"
                    aria-label="Delete workflow"
                    title="Delete workflow"
                    onClick={() => onMode("delete")}
                  >
                    <IconTrash size={16} />
                  </button>
                )}
              </>
            )}
          </div>
          <div className="flex gap-3">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={mutation.isPending}
            >
              {mutation.isPending
                ? "Saving…"
                : editing
                  ? "Save workflow"
                  : mode === "duplicate"
                    ? "Duplicate workflow"
                    : "Create workflow"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
