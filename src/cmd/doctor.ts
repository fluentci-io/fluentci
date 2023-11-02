import { green, red } from "../../deps.ts";

async function doctor() {
  console.log("Doctor summary:");
  const glowOk = await verifyGlow();
  const denoOk = await verifyDeno();
  const daggerOk = await verifyDagger();
  const dockerOk = await verifyDocker();

  if (!glowOk || !denoOk || !daggerOk || !dockerOk) {
    console.log(`${red("!")} Please fix the issues above and try again.`);
    Deno.exit(1);
  }

  console.log(`\n${green("•")} No issues found!`);
}

const verifyDocker = async () => {
  const command = new Deno.Command("docker", {
    args: ["--version"],
    stdout: "piped",
    stderr: "piped",
  });

  const { stdout, code } = await command.output();

  if (code !== 0) {
    console.log(`${red("[✗]")} Docker (not installed)`);
    return false;
  }

  console.log(
    `${green("[✓]")} Docker (${new TextDecoder().decode(stdout).trimEnd()})`
  );
  return true;
};

const verifyGlow = async () => {
  const command = new Deno.Command("glow", {
    args: ["--version"],
    stdout: "piped",
    stderr: "piped",
  });

  try {
    const { stdout, code } = await command.output();

    if (code !== 0) {
      console.log(`${red("[✗]")} Glow (not installed)`);
      return false;
    }

    console.log(
      `${green("[✓]")} Glow (${new TextDecoder().decode(stdout).trimEnd()})`
    );
  } catch (_) {
    console.log(`${red("[✗]")} Glow (not installed)`);
    return false;
  }
  return true;
};

const verifyDeno = async () => {
  const command = new Deno.Command("deno", {
    args: ["--version"],
    stdout: "piped",
    stderr: "piped",
  });

  try {
    const { stdout, code } = await command.output();

    if (code !== 0) {
      console.log(`${red("[✗]")} Deno (not installed)`);
      return false;
    }

    const version = new TextDecoder().decode(stdout).split("\n")[0].trimEnd();

    console.log(`${green("[✓]")} Deno (${version})`);
  } catch (_) {
    console.log(`${red("[✗]")} Deno (not installed)`);
    return false;
  }

  return true;
};

const verifyDagger = async () => {
  const command = new Deno.Command("dagger", {
    args: ["version"],
    stdout: "piped",
    stderr: "piped",
  });

  try {
    const { stdout, code } = await command.output();

    if (code !== 0) {
      console.log(`${red("[✗]")} Dagger (not installed)`);
      return false;
    }

    console.log(
      `${green("[✓]")} Dagger (${new TextDecoder().decode(stdout).trimEnd()})`
    );
  } catch (_) {
    console.log(`${red("[✗]")} Dagger (not installed)`);
    return false;
  }

  return true;
};

export default doctor;
