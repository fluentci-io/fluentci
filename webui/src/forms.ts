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
