import { z } from "zod";

export const schema = z.object({
  name: z.string().min(1, { message: "Please enter a name" }),
  description: z.string().optional().nullable(),
  tags: z.string().optional().nullable(),
});
