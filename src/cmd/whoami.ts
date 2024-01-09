import { isLogged } from "../utils.ts";
import { brightMagenta } from "../../deps.ts";

async function whoami() {
  if (!(await isLogged())) {
    console.log(`${brightMagenta("error")}: You are not logged in.`);
    Deno.exit(1);
  }

  const accessToken =
    Deno.env.get("FLUENTCI_ACCESS_TOKEN") ||
    Deno.readTextFileSync(`${Deno.env.get("HOME")}/.fluentci/access-token`);
  const id = await fetch(
    `https://api.fluentci.io/validate?token=${accessToken}`
  ).then((res) => res.text());
  const { login, name } = await fetch(`https://api.github.com/user/${id}`).then(
    (res) => res.json()
  );
  console.log(`You are logged in as ${login} (${name})`);
}

export default whoami;
