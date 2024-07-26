import { open } from "../../deps.ts";

export default function community() {
  const DISCORD_INVITE = "https://discord.gg/V4U6dPskKc";
  console.log(DISCORD_INVITE);

  open(DISCORD_INVITE).catch((err) => {
    console.error(err);
    Deno.exit(1);
  });
}
