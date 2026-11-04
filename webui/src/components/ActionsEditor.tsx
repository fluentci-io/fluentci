import { useEffect, useState } from "react";
import { useAtom } from "jotai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Controller,
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  IconArrowDown as ArrowDown,
  IconArrowUp as ArrowUp,
  IconCheck as Check,
  IconCode as Code2,
  IconPlus as Plus,
  IconDeviceFloppy as Save,
  IconTrash as Trash2,
} from "@tabler/icons-react";
import { actionFields, graphql, useActions } from "../api";
import type { Action, ModuleSuggestion } from "../types";
import { actionDraftsAtom } from "../state";
import { actionsSchema, type ActionsValues } from "../forms";
import { SuggestInput } from "./SuggestInput";
import { Empty, ErrorNotice, Loading } from "./ui";

const newAction = (): Action => ({
  name: "",
  plugin: ".",
  commands: "",
  enabled: true,
  useWasm: false,
  env: [],
  workingDirectory: null,
});

export function ActionsEditor({
  projectId,
  archived,
}: {
  projectId: string;
  archived: boolean;
}) {
  const query = useActions(projectId);
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorNotice error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <ActionsForm
      projectId={projectId}
      archived={archived}
      initialActions={query.data}
    />
  );
}

function ActionsForm({
  projectId,
  archived,
  initialActions,
}: {
  projectId: string;
  archived: boolean;
  initialActions: Action[];
}) {
  const client = useQueryClient();
  const [drafts, setDrafts] = useAtom(actionDraftsAtom);
  const [saved, setSaved] = useState(false);
  const form = useForm<ActionsValues>({
    resolver: zodResolver(actionsSchema),
    defaultValues: { actions: drafts[projectId] || initialActions },
    mode: "onTouched",
  });
  const { fields, append, remove, move } = useFieldArray({
    control: form.control,
    name: "actions",
  });
  const actions = useWatch({ control: form.control, name: "actions" });
  const comparable = (items: Action[]) =>
    JSON.stringify(
      items.map((action) => [
        action.name,
        action.plugin,
        action.commands,
        action.enabled,
        action.useWasm,
        action.env,
        action.workingDirectory,
      ]),
    );
  const dirty = comparable(actions) !== comparable(initialActions);
  useEffect(() => {
    const subscription = form.watch((_values, { name }) => {
      if (!name) return;
      setSaved(false);
      const values = form.getValues("actions");
      setDrafts((old) => ({ ...old, [projectId]: values }));
    });
    return () => subscription.unsubscribe();
  }, [form, projectId, setDrafts]);
  const discovery = useQuery({
    queryKey: ["actionSuggestions", projectId],
    queryFn: async ({ signal }) =>
      (
        await graphql<{ actionSuggestions: ModuleSuggestion[] }>(
          "query($id: ID!) { actionSuggestions(projectId: $id) { name functions } }",
          { id: projectId },
          signal,
        )
      ).actionSuggestions,
    staleTime: 60_000,
  });
  const directories = useQuery({
    queryKey: ["projectDirectories", projectId],
    queryFn: async ({ signal }) =>
      (
        await graphql<{ projectDirectories: string[] }>(
          "query($id: ID!) { projectDirectories(projectId: $id) }",
          { id: projectId },
          signal,
        )
      ).projectDirectories,
    staleTime: 30_000,
  });
  const suggestions = discovery.data || [];
  const modules = [
    ...new Set([
      ".",
      ...suggestions.map((module) => module.name),
      ...initialActions.map((action) => action.plugin).filter(Boolean),
    ]),
  ].sort();
  const save = useMutation({
    mutationFn: ({ actions }: ActionsValues) =>
      graphql<{ saveActions: Action[] }>(
        `mutation($id: ID!, $actions: [ActionInput!]!) { saveActions(projectId: $id, actions: $actions) { ${actionFields} } }`,
        { id: projectId, actions },
      ),
    onSuccess: (data) => {
      client.setQueryData(["actions", projectId], data.saveActions);
      void client.invalidateQueries({ queryKey: ["export", projectId] });
      void client.invalidateQueries({
        queryKey: ["actionSuggestions", projectId],
      });
      form.reset({ actions: data.saveActions });
      setDrafts((old) => {
        const next = { ...old };
        delete next[projectId];
        return next;
      });
      setSaved(true);
    },
  });
  return (
    <FormProvider {...form}>
      <form
        noValidate
        onSubmit={form.handleSubmit((values) => save.mutate(values))}
      >
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-medium">Pipeline actions</h2>
            <p className="mt-1 text-sm text-muted">
              Ordered steps, explicit commands. Executed locally in your
              project.
            </p>
          </div>
          <button
            type="submit"
            className="btn-primary"
            disabled={!dirty || save.isPending || archived}
          >
            {saved ? <Check size={15} /> : <Save size={15} />}
            {save.isPending ? "Saving…" : saved ? "Saved" : "Save actions"}
          </button>
        </div>
        {save.error && <ErrorNotice error={save.error} />}
        <p className="mb-4 text-xs text-muted">
          {discovery.isPending
            ? "Loading module and function suggestions…"
            : discovery.isError
              ? "Suggestions unavailable. You can still enter modules and commands."
              : "Suggestions include workspace modules, available Wasm exports, and saved actions. Custom values are welcome."}
        </p>
        {directories.isError && (
          <p role="status" className="mb-4 text-xs text-muted">
            Directory suggestions unavailable. You can still enter a path.
          </p>
        )}
        <fieldset
          disabled={archived || save.isPending}
          className="space-y-4 disabled:opacity-60"
        >
          {fields.map((field, index) => (
            <ActionRow
              key={field.id}
              index={index}
              count={fields.length}
              modules={modules}
              directories={directories.data || ["."]}
              functions={[
                ...new Set([
                  ...(suggestions.find(
                    (module) => module.name === actions[index]?.plugin,
                  )?.functions || []),
                  ...initialActions
                    .filter(
                      (action) => action.plugin === actions[index]?.plugin,
                    )
                    .flatMap((action) =>
                      action.commands
                        .split("\n")
                        .map((line) => line.trim().split(/\s+/)[0])
                        .filter(Boolean),
                    ),
                ]),
              ].sort()}
              onMove={(direction) => move(index, index + direction)}
              onRemove={() => remove(index)}
            />
          ))}
          {!fields.length && (
            <Empty icon={<Code2 size={26} />} title="Define your first action">
              Add a module and its commands, then run the pipeline from the
              Execution tab.
            </Empty>
          )}
          <button
            type="button"
            className="btn-secondary w-full border-dashed py-3"
            onClick={() => append(newAction())}
          >
            <Plus size={15} />
            Add action
          </button>
        </fieldset>
        {dirty && (
          <p role="status" className="mt-4 text-xs text-warning">
            Unsaved changes. Your draft is kept while switching tabs. Save
            before running.
          </p>
        )}
      </form>
    </FormProvider>
  );
}

function ActionRow({
  index,
  count,
  modules,
  directories,
  functions,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  modules: string[];
  directories: string[];
  functions: string[];
  onMove: (direction: number) => void;
  onRemove: () => void;
}) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<ActionsValues>();
  const error = errors.actions?.[index];
  const action = useWatch({ control, name: `actions.${index}` });
  const prefix = `action-${index}`;
  return (
    <section className="rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-3 border-b border-line px-5 py-3">
        <span className="font-mono text-xs text-muted">
          {String(index + 1).padStart(2, "0")}
        </span>
        <input
          aria-label={`Action ${index + 1} name`}
          aria-invalid={!!error?.name}
          aria-describedby={error?.name ? `${prefix}-name-error` : undefined}
          placeholder="Step name"
          className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
          {...register(`actions.${index}.name`)}
        />
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" {...register(`actions.${index}.enabled`)} />
          Enabled
        </label>
        <button
          className="icon-btn"
          type="button"
          aria-label={`Move action ${index + 1} up`}
          disabled={index === 0}
          onClick={() => onMove(-1)}
        >
          <ArrowUp size={14} />
        </button>
        <button
          className="icon-btn"
          type="button"
          aria-label={`Move action ${index + 1} down`}
          disabled={index === count - 1}
          onClick={() => onMove(1)}
        >
          <ArrowDown size={14} />
        </button>
        <button
          className="icon-btn hover:text-danger"
          type="button"
          aria-label={`Remove action ${index + 1}`}
          onClick={onRemove}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {error?.name && (
        <p
          id={`${prefix}-name-error`}
          role="alert"
          className="px-5 pt-3 text-xs text-danger"
        >
          {error.name.message}
        </p>
      )}
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <div>
          <p className="field-label">Pipeline / module</p>
          <Controller
            control={control}
            name={`actions.${index}.plugin`}
            render={({ field }) => (
              <SuggestInput
                {...field}
                label={`Action ${index + 1} module`}
                suggestions={modules}
                placeholder=". or a module name"
                invalid={!!error?.plugin}
                describedBy={
                  error?.plugin ? `${prefix}-module-error` : undefined
                }
              />
            )}
          />
          {error?.plugin && (
            <p
              id={`${prefix}-module-error`}
              role="alert"
              className="mt-2 text-xs text-danger"
            >
              {error.plugin.message}
            </p>
          )}
        </div>
        <div>
          <p className="field-label">Working directory</p>
          <Controller
            control={control}
            name={`actions.${index}.workingDirectory`}
            render={({ field }) => (
              <SuggestInput
                {...field}
                value={field.value || ""}
                onChange={(value) => field.onChange(value || null)}
                label={`Action ${index + 1} working directory`}
                suggestions={directories}
                placeholder="Project root"
              />
            )}
          />
        </div>
        <div className="md:col-span-2">
          <p className="field-label">Functions / commands</p>
          <Controller
            control={control}
            name={`actions.${index}.commands`}
            render={({ field }) => (
              <SuggestInput
                {...field}
                label={`Action ${index + 1} functions / commands`}
                multiline
                suggestions={functions}
                placeholder={"build\ntest"}
                invalid={!!error?.commands}
                describedBy={`${prefix}-commands-help${error?.commands ? ` ${prefix}-commands-error` : ""}`}
              />
            )}
          />
          <p id={`${prefix}-commands-help`} className="text-xs text-muted">
            One invocation per line, passed to{" "}
            <code>
              fluentci run {action.useWasm ? "--wasm " : ""}
              {action.plugin || "."} &lt;command&gt;
            </code>
            .
          </p>
          {error?.commands && (
            <p
              id={`${prefix}-commands-error`}
              role="alert"
              className="mt-2 text-xs text-danger"
            >
              {error.commands.message}
            </p>
          )}
        </div>
        <label className="field-label md:col-span-2">
          Environment variables
          <Controller
            control={control}
            name={`actions.${index}.env`}
            render={({ field }) => (
              <textarea
                className="input min-h-20 resize-y font-mono"
                spellCheck={false}
                placeholder="CI=true"
                ref={field.ref}
                onBlur={field.onBlur}
                value={(field.value || []).join("\n")}
                onChange={(event) =>
                  field.onChange(event.target.value.split("\n"))
                }
                aria-invalid={!!error?.env}
                aria-describedby={
                  error?.env ? `${prefix}-env-error` : undefined
                }
              />
            )}
          />
          <span className="font-normal text-muted">
            KEY=value, one per line. Stored locally with the project actions.
          </span>
          {error?.env && (
            <span
              id={`${prefix}-env-error`}
              role="alert"
              className="mt-2 block text-danger"
            >
              {error.env.message}
            </span>
          )}
        </label>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" {...register(`actions.${index}.useWasm`)} />
          Execute as WebAssembly
        </label>
      </div>
    </section>
  );
}
