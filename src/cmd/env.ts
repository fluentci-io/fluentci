import { brightGreen, load } from "../../deps.ts";

async function showEnvs() {
  const envs = await load({
    envPath: ".fluentci/.env",
    export: true,
  });

  for (const [key, value] of Object.entries(envs)) {
    console.log(`${brightGreen(key)} ${brightGreen("=")} ${value}`);
  }
}

export default showEnvs;
