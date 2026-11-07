import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export async function dependencyInterfaces(root) {
  try {
    return JSON.parse(
      await readFile(
        join(root, ".fluentci/dependencies/interfaces.json"),
        "utf8",
      ),
    );
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function addDependencyInterfaces(root, directory, wit) {
  const interfaces = await dependencyInterfaces(root);
  for (const dependency of interfaces) {
    const path = join(directory, "deps", `dependency-${dependency.alias}`);
    await mkdir(path, { recursive: true });
    await writeFile(join(path, "dependency.wit"), dependency.wit);
  }
  return wit.replace(
    "world plugin {",
    `world plugin {\n${interfaces.map((dependency) => `  import ${dependency.import};`).join("\n")}`,
  );
}
