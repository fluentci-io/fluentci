async function repl({ quiet }: { quiet?: boolean }) {
  let command = new Deno.Command("dagger", {
    args: ["--progress", "plain", "run", "deno", "repl", "-A"],
    stdout: "inherit",
    stdin: "inherit",
    stderr: "inherit",
  });

  if (quiet) {
    command = new Deno.Command("deno", {
      args: ["repl", "-A"],
      stdout: "inherit",
      stdin: "inherit",
      stderr: "inherit",
    });
  }

  const process = command.spawn();
  await process.status;
}

export default repl;
