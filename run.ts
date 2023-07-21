async function run(pipeline: string) {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "-A",
      `--import-map=https://deno.land/x/${pipeline}/import_map.json`,
      `https://deno.land/x/${pipeline}/src/dagger/runner.ts`,
    ],
  });

  await command.output();
}

export default run;
