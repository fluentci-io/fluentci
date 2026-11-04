import { useState } from "react";
import { useAtom } from "jotai";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Code2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { actionFields, graphql, useActions } from "../api";
import type { Action } from "../types";
import { actionDraftsAtom } from "../state";
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
  const client = useQueryClient();
  const [drafts, setDrafts] = useAtom(actionDraftsAtom);
  const draft = drafts[projectId] || null;
  const setDraft = (value: Action[] | null) =>
    setDrafts((old) => {
      const next = { ...old };
      if (value) next[projectId] = value;
      else delete next[projectId];
      return next;
    });
  const [saved, setSaved] = useState(false);
  const actions = draft || query.data || [];
  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(query.data);
  const save = useMutation({
    mutationFn: () =>
      graphql<{ saveActions: Action[] }>(
        `mutation($id: ID!, $actions: [ActionInput!]!) { saveActions(projectId: $id, actions: $actions) { ${actionFields} } }`,
        { id: projectId, actions },
      ),
    onSuccess: (data) => {
      client.setQueryData(["actions", projectId], data.saveActions);
      void client.invalidateQueries({ queryKey: ["export", projectId] });
      setDraft(null);
      setSaved(true);
    },
  });
  const update = (index: number, change: Partial<Action>) => {
    setSaved(false);
    setDraft(
      actions.map((action, i) =>
        i === index ? { ...action, ...change } : action,
      ),
    );
  };
  const move = (index: number, direction: number) => {
    const copy = [...actions];
    [copy[index], copy[index + direction]] = [
      copy[index + direction],
      copy[index],
    ];
    setDraft(copy);
    setSaved(false);
  };
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorNotice error={query.error} retry={() => void query.refetch()} />
    );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Pipeline actions</h2>
          <p className="mt-1 text-sm text-muted">
            Ordered steps, explicit commands. Executed locally in your project.
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
      <fieldset
        disabled={archived || save.isPending}
        className="space-y-4 disabled:opacity-60"
      >
        {actions.map((action, index) => (
          <section
            key={index}
            className="rounded-xl border border-line bg-panel"
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-3">
              <span className="font-mono text-xs text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <input
                aria-label={`Action ${index + 1} name`}
                placeholder="Step name"
                required
                className="min-w-0 flex-1 bg-transparent text-sm font-medium outline-none"
                value={action.name}
                onChange={(event) =>
                  update(index, { name: event.target.value })
                }
              />
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={action.enabled}
                  onChange={(event) =>
                    update(index, { enabled: event.target.checked })
                  }
                />
                Enabled
              </label>
              <button
                className="icon-btn"
                type="button"
                aria-label={`Move action ${index + 1} up`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="icon-btn"
                type="button"
                aria-label={`Move action ${index + 1} down`}
                disabled={index === actions.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={14} />
              </button>
              <button
                className="icon-btn hover:text-danger"
                type="button"
                aria-label={`Remove action ${index + 1}`}
                onClick={() => setDraft(actions.filter((_, i) => i !== index))}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2">
              <label className="field-label">
                Pipeline / module
                <input
                  className="input font-mono"
                  required
                  value={action.plugin}
                  placeholder=". or a module name"
                  onChange={(event) =>
                    update(index, { plugin: event.target.value })
                  }
                />
              </label>
              <label className="field-label">
                Working directory
                <input
                  className="input font-mono"
                  value={action.workingDirectory || ""}
                  placeholder="Project root"
                  onChange={(event) =>
                    update(index, {
                      workingDirectory: event.target.value || null,
                    })
                  }
                />
              </label>
              <label className="field-label md:col-span-2">
                Functions / commands
                <textarea
                  className="input min-h-28 resize-y font-mono leading-6"
                  required
                  spellCheck={false}
                  value={action.commands}
                  placeholder="build\ntest"
                  onChange={(event) =>
                    update(index, { commands: event.target.value })
                  }
                />
                <span className="font-normal text-muted">
                  One invocation per line, passed to{" "}
                  <code>
                    fluentci run {action.useWasm ? "--wasm " : ""}
                    {action.plugin || "."} &lt;command&gt;
                  </code>
                  .
                </span>
              </label>
              <label className="field-label md:col-span-2">
                Environment variables
                <textarea
                  className="input min-h-20 resize-y font-mono"
                  spellCheck={false}
                  value={(action.env || []).join("\n")}
                  placeholder="CI=true"
                  onChange={(event) =>
                    update(index, { env: event.target.value.split("\n") })
                  }
                />
                <span className="font-normal text-muted">
                  KEY=value, one per line. Stored locally with the project
                  actions.
                </span>
              </label>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={action.useWasm}
                  onChange={(event) =>
                    update(index, { useWasm: event.target.checked })
                  }
                />
                Execute as WebAssembly
              </label>
            </div>
          </section>
        ))}
        {!actions.length && (
          <Empty icon={<Code2 size={26} />} title="Define your first action">
            Add a module and its commands, then run the pipeline from the
            Execution tab.
          </Empty>
        )}
        <button
          type="button"
          className="btn-secondary w-full border-dashed py-3"
          onClick={() => {
            setDraft([...actions, newAction()]);
            setSaved(false);
          }}
        >
          <Plus size={15} />
          Add action
        </button>
      </fieldset>
      {dirty && (
        <p role="status" className="mt-4 text-xs text-warning">
          Unsaved changes. Your draft is kept while switching tabs. Save before
          running.
        </p>
      )}
    </form>
  );
}
