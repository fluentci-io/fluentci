const [command, ...args] = process.argv.slice(2);
if (command !== "dev" && command !== "build") {
  throw new Error("Expected dev or build");
}

const child = Bun.spawn(
  ["tauri", command, ...(command === "dev" ? ["--release", "--no-dev-server"] : []), ...args, "--", "--locked"],
  { stdin: "inherit", stdout: "inherit", stderr: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}
process.exit(await child.exited);
