import { Secret, brightGreen, dir, red } from "../../deps.ts";

async function login() {
  console.log(
    `You can generate an access token from ${brightGreen(
      "https://app.fluentci.io/settings/tokens"
    )}`
  );
  const accessToken: string = await Secret.prompt("Enter your access token: ");
  const status = await fetch(
    `https://api.fluentci.io/validate?token=${accessToken}`
  ).then((res) => res.status);

  if (status !== 200) {
    console.log(`${red("[✗]")} Invalid access token`);
    Deno.exit(1);
  }

  Deno.mkdirSync(`${dir("home")}/.fluentci`, { recursive: true });
  Deno.writeTextFileSync(`${dir("home")}/.fluentci/access-token`, accessToken);
  console.log(`${brightGreen("[✓]")} Logged in successfully`);
}

export default login;
