import { z } from "zod";

const requiredText = (message: string) =>
  z.string().refine((value) => value.trim().length > 0, message);
const environment = z
  .array(z.string())
  .nullable()
  .refine(
    (values) =>
      values?.every(
        (value) => !value.trim() || /^[A-Za-z_][A-Za-z0-9_]*=/.test(value),
      ) ?? true,
    "Use KEY=value, one variable per line.",
  );

export const actionsSchema = z.object({
  actions: z.array(
    z.object({
      name: requiredText("Enter a step name."),
      plugin: requiredText("Enter a module or pipeline."),
      commands: requiredText("Enter at least one function or command."),
      enabled: z.boolean(),
      useWasm: z.boolean(),
      env: environment,
      workingDirectory: z.string().nullable(),
    }),
  ),
});
export type ActionsValues = z.infer<typeof actionsSchema>;

export const projectSettingsSchema = z.object({
  projectName: z.string().trim().min(1, "Enter a project name."),
  name: requiredText("Enter a display name."),
  description: z.string(),
  tags: z.string(),
});
export type ProjectSettingsValues = z.infer<typeof projectSettingsSchema>;

export const repositorySchema = z.object({
  repository: z
    .string()
    .trim()
    .refine((value) => {
      if (/^[\w.-]+@[\w.-]+:[^\s]+$/.test(value)) return true;
      try {
        const url = new URL(value);
        return (
          ["https:", "http:", "ssh:", "git:"].includes(url.protocol) &&
          !!url.hostname &&
          url.pathname.length > 1
        );
      } catch {
        return false;
      }
    }, "Enter a Git repository URL (HTTPS or SSH)."),
});
export type RepositoryValues = z.infer<typeof repositorySchema>;

export const workflowSchema = z.object({
  id: z
    .string()
    .trim()
    .regex(
      /^[a-z][a-z0-9_-]{0,63}$/,
      "Use a lowercase letter followed by letters, digits, hyphens or underscores (up to 64 characters).",
    ),
  name: z.string().trim().min(1, "Enter a workflow name.").max(128),
  description: z.string().max(2048),
  enabled: z.boolean(),
  env: z
    .string()
    .refine(
      (value) =>
        value
          .split("\n")
          .every(
            (line) => !line.trim() || /^[A-Za-z_][A-Za-z0-9_]*=/.test(line),
          ),
      "Use KEY=value, one variable per line.",
    ),
});
export type WorkflowValues = z.infer<typeof workflowSchema>;

export const workflowEventsSchema = z
  .object({
    push: z.boolean(),
    pullRequest: z.boolean(),
    manual: z.boolean(),
    pushBranches: z.string(),
    pushTags: z.string(),
    pushPaths: z.string(),
    prBranches: z.string(),
    prPaths: z.string(),
    schedule: z
      .string()
      .refine(
        (value) =>
          value
            .split("\n")
            .every(
              (line) => !line.trim() || line.trim().split(/\s+/).length === 5,
            ),
        "Use one five-field UTC cron expression per line.",
      ),
  })
  .superRefine((value, ctx) => {
    for (const field of [
      "pushBranches",
      "pushTags",
      "pushPaths",
      "prBranches",
      "prPaths",
    ] as const) {
      if (
        value[field]
          .split("\n")
          .some(
            (line) =>
              line.trim() &&
              (line.length > 256 ||
                ["!", "[", "]", "{", "}", "+"].some((char) =>
                  line.includes(char),
                ) ||
                [...line].some((char) => char.charCodeAt(0) < 32)),
          )
      )
        ctx.addIssue({
          code: "custom",
          path: [field],
          message:
            "Use inclusive glob patterns with *, ** and ?, one per line.",
        });
    }
  });
export type WorkflowEventsValues = z.infer<typeof workflowEventsSchema>;
