import { z } from "zod";

export const schema = z.object({
  commands: z.string().min(1, { message: "Please enter at least one command" }),
  name: z.string().min(1, { message: "Please enter a name" }),
  useWasmPlugin: z.boolean().optional(),
});
