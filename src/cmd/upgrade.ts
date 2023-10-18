/**
 * Upgrades FluentCI by installing the latest version from the Deno registry.
 * @returns {Promise<void>}
 */
async function upgrade() {
  const command = new Deno.Command("deno", {
    args: [
      "install",
      "-A",
      "-r",
      "--import-map=https://deno.land/x/fluentci/import_map.json",
      "https://deno.land/x/fluentci/main.ts",
      "-n",
      "fluentci",
      "-f",
    ],
  });

  const { stdout, stderr } = await command.output();

  console.log(new TextDecoder().decode(stdout));
  console.log(new TextDecoder().decode(stderr));
}

export default upgrade;
