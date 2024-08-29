import { toml, _ } from "../../deps.ts";
import logos from "../logos.ts";
import { Actions, ActionsSchema, ConfigSchema } from "../types.ts";

export function parseConfig(content: string): Actions {
  const data = ConfigSchema.parse(toml.parse(content));

  const actions = ActionsSchema.parse(
    data.steps?.map((step) => {
      const action: Record<string, unknown> = {
        name: step.name,
        use_wasm: true,
        enabled: true,
      };

      if (step.env) {
        step.env
          .filter((env) => env.split("=").length === 2)
          .forEach((env) => {
            const [key, value] = env.split("=");
            _.set(action, ["env", key], value);
          });
      }

      if (step.working_directory) {
        action.working_directory = step.working_directory;
      }

      if (
        Array.isArray(step.command) &&
        step.command.length === 1 &&
        step.command[0].startsWith("fluentci")
      ) {
        const plugin = step.command[0]
          .replaceAll("fluentci run", "")
          .replaceAll("--wasm", "")
          .trim()
          .split(" ")[0];
        const commands = step.command[0]
          .replaceAll("fluentci run", "")
          .replaceAll("--wasm", "")
          .trim()
          .split(" ")
          .slice(1)
          .join(" ");

        if (logos[plugin]) {
          action.logo = logos[plugin];
        }

        return {
          ...action,
          commands,
          plugin,
        };
      }

      if (
        typeof step.command === "string" &&
        step.command.startsWith("fluentci")
      ) {
        const plugin = step.command
          .replaceAll("fluentci run", "")
          .replaceAll("--wasm", "")
          .trim()
          .split(" ")[0];
        const commands = step.command
          .replaceAll("fluentci run", "")
          .replaceAll("--wasm", "")
          .trim()
          .split(" ")
          .slice(1)
          .join(" ");

        if (logos[plugin]) {
          action.logo = logos[plugin];
        }

        return {
          ...action,
          commands,
          plugin,
        };
      }

      return {
        ...action,
        commands:
          "bash " +
          (Array.isArray(step.command)
            ? (step.command as string[])
                .map((command) => `"${command}"`)
                .join("\nbash ")
            : `"${step.command}"`),
        plugin: "shell",
      };
    })
  );

  return actions;
}
