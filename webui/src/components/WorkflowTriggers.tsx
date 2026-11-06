import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  IconGitBranch,
  IconGitPullRequest,
  IconHandClick,
  IconClock,
  IconDeviceFloppy,
} from "@tabler/icons-react";
import { graphql, workflowFields } from "../api";
import { workflowEventsSchema, type WorkflowEventsValues } from "../forms";
import type { Workflow, WorkflowEvents } from "../types";
import { ErrorNotice } from "./ui";

const lines = (value: string) =>
  value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
const defaults = (workflow: Workflow): WorkflowEventsValues => {
  const events = workflow.events || {
    push: { branches: ["main"], tags: [], paths: [] },
    pullRequest: null,
    manual: true,
    schedule: [],
  };
  return {
    push: !!events.push,
    pullRequest: !!events.pullRequest,
    manual: events.manual,
    pushBranches: events.push?.branches.join("\n") || "",
    pushTags: events.push?.tags.join("\n") || "",
    pushPaths: events.push?.paths.join("\n") || "",
    prBranches: events.pullRequest?.branches.join("\n") || "",
    prPaths: events.pullRequest?.paths.join("\n") || "",
    schedule: events.schedule.join("\n"),
  };
};

export function WorkflowTriggers({
  projectId,
  workflow,
  disabled,
  onSaved,
}: {
  projectId: string;
  workflow: Workflow;
  disabled: boolean;
  onSaved: (revision: string) => void;
}) {
  const client = useQueryClient();
  const form = useForm<WorkflowEventsValues>({
    resolver: zodResolver(workflowEventsSchema),
    defaultValues: defaults(workflow),
    mode: "onTouched",
  });
  const {
    register,
    watch,
    formState: { errors, isDirty },
    reset,
  } = form;
  const [revision, setRevision] = useState(workflow.revision || "");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!isDirty) {
      reset(defaults(workflow));
      setRevision(workflow.revision || "");
    }
  }, [workflow, reset, isDirty]);
  const mutation = useMutation({
    mutationFn: async (values: WorkflowEventsValues) => {
      const events: WorkflowEvents = {
        push: values.push
          ? {
              branches: lines(values.pushBranches),
              tags: lines(values.pushTags),
              paths: lines(values.pushPaths),
            }
          : null,
        pullRequest: values.pullRequest
          ? {
              branches: lines(values.prBranches),
              tags: [],
              paths: lines(values.prPaths),
            }
          : null,
        manual: values.manual,
        schedule: lines(values.schedule),
      };
      return (
        await graphql<{ updateWorkflow: Workflow }>(
          `mutation($id: ID!, $workflow: String!, $input: WorkflowUpdateInput!) { updateWorkflow(projectId: $id, workflowId: $workflow, input: $input) { ${workflowFields} } }`,
          {
            id: projectId,
            workflow: workflow.id,
            input: { events, expectedRevision: revision },
          },
        )
      ).updateWorkflow;
    },
    onSuccess: (next) => {
      reset(defaults(next));
      setRevision(next.revision || "");
      setSaved(true);
      onSaved(next.revision || "");
      client.setQueryData<Workflow[]>(["workflows", projectId], (old) =>
        old?.map((item) => (item.id === next.id ? next : item)),
      );
      void client.invalidateQueries({
        queryKey: ["export", projectId, workflow.id],
      });
    },
  });
  const push = watch("push"),
    pullRequest = watch("pullRequest");
  const filters = (
    fields: {
      name:
        "pushBranches" | "pushTags" | "pushPaths" | "prBranches" | "prPaths";
      label: string;
      placeholder: string;
    }[],
  ) => (
    <div className="mt-4 grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.name}>
          <label className="field-label">
            {field.label}
            <textarea
              className="input min-h-20 font-mono text-xs"
              placeholder={field.placeholder}
              {...register(field.name)}
              aria-invalid={!!errors[field.name]}
            />
          </label>
          {errors[field.name] && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {errors[field.name]?.message}
            </p>
          )}
        </div>
      ))}
    </div>
  );
  return (
    <section
      aria-label="Workflow event triggers"
      className="mb-8 rounded-xl border border-line bg-panel p-5"
    >
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
      >
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium">Event triggers</h2>
            <p className="mt-1 text-xs leading-5 text-muted">
              Choose when CI providers run this workflow. Local runs always
              start manually and ignore these conditions.
            </p>
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={disabled || !isDirty || mutation.isPending}
          >
            <IconDeviceFloppy size={14} />
            {mutation.isPending
              ? "Saving…"
              : saved && !isDirty
                ? "Saved triggers"
                : "Save triggers"}
          </button>
        </div>
        {disabled && (
          <p className="mb-4 text-xs text-muted">
            Save or discard action drafts before editing triggers. Archived
            projects are read-only.
          </p>
        )}
        {mutation.error && <ErrorNotice error={mutation.error} />}
        <fieldset
          disabled={disabled || mutation.isPending}
          className="grid gap-4 disabled:opacity-60 lg:grid-cols-2"
        >
          <div className="rounded-lg border border-line bg-canvas p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <IconGitBranch size={16} className="text-accent" />
              <span className="flex-1">Push</span>
              <input
                type="checkbox"
                {...register("push")}
                aria-label="On push"
              />
            </label>
            <p className="mt-2 text-[11px] text-muted">
              A branch or tag is pushed.
            </p>
            {push &&
              filters([
                {
                  name: "pushBranches",
                  label: "Push branches",
                  placeholder: "main\nrelease/**",
                },
                { name: "pushTags", label: "Push tags", placeholder: "v*" },
                {
                  name: "pushPaths",
                  label: "Push paths",
                  placeholder: "src/**\nfluentci.toml",
                },
              ])}
          </div>
          <div className="rounded-lg border border-line bg-canvas p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <IconGitPullRequest size={16} className="text-accent" />
              <span className="flex-1">Pull request</span>
              <input
                type="checkbox"
                {...register("pullRequest")}
                aria-label="On pull request"
              />
            </label>
            <p className="mt-2 text-[11px] text-muted">
              A pull request is opened, reopened, or updated; merge requests on
              GitLab.
            </p>
            {pullRequest &&
              filters([
                {
                  name: "prBranches",
                  label: "Target branches",
                  placeholder: "main",
                },
                {
                  name: "prPaths",
                  label: "Pull request paths",
                  placeholder: "src/**",
                },
              ])}
          </div>
          <div className="rounded-lg border border-line bg-canvas p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <IconHandClick size={16} className="text-accent" />
              <span className="flex-1">Manual CI dispatch</span>
              <input
                type="checkbox"
                {...register("manual")}
                aria-label="Manual CI dispatch"
              />
            </label>
            <p className="mt-2 text-[11px] text-muted">
              Allow manual dispatch in the exported CI configuration. Local runs
              remain manual regardless of this setting.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-canvas p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <IconClock size={16} className="text-accent" />
              Schedule
            </div>
            <label className="field-label">
              UTC cron expressions
              <textarea
                className="input min-h-20 font-mono text-xs"
                placeholder="0 6 * * 1-5"
                {...register("schedule")}
                aria-invalid={!!errors.schedule}
              />
            </label>
            {errors.schedule && (
              <p role="alert" className="mt-1 text-xs text-danger">
                {errors.schedule.message}
              </p>
            )}
            <p className="mt-2 text-[11px] text-muted">
              Five fields, one schedule per line. Leave empty to disable.
            </p>
          </div>
        </fieldset>
        <p className="mt-4 text-[11px] leading-5 text-muted">
          Filters use inclusive globs (*, **, ?), one per line. Empty filters
          match all; branch-only push filters exclude tags, and tag-only filters
          exclude branches. Branch and path filters both must match. Provider
          setup notes appear in CI exports.
        </p>
      </form>
    </section>
  );
}
