import { introspect, brightGreen, z } from "../deps.ts";

const DaggerSchema = z.object({
  name: z.string(),
  sdk: z.string(),
  root: z.string().optional(),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  dependencies: z.array(z.string()).optional(),
  version: z.string().optional(),
});

export const validatePackage = (entries: string[]) => {
  const files = [];
  for (const entry of entries) {
    if (files.length === 2) {
      break;
    }
    if (entry === "dagger.json" || entry === "mod.ts") {
      files.push(entry);
    }
  }

  const ok =
    files.length === 2 &&
    files.includes("dagger.json") &&
    files.includes("mod.ts");

  return ok;
};

export const validateConfigFiles = () => {
  const metadata = introspect("mod.ts");

  if (!metadata.length) {
    console.error(`No functions found in ${brightGreen("mod.ts")}`);
    Deno.exit(1);
  }
  try {
    const dagger = Deno.readTextFileSync("dagger.json");
    DaggerSchema.parse(JSON.parse(dagger));
  } catch (e) {
    console.error(`Invalid ${brightGreen("dagger.json")}`);
    console.error(e.message);
    Deno.exit(1);
  }
};
