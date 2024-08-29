export async function getCommitInfos(cwd = Deno.cwd()) {
  const { stdout: commit } = await new Deno.Command("git", {
    args: ["log", "-1", "--pretty=%s"],
    stdout: "piped",
    stderr: "piped",
    cwd,
  }).output();
  const { stdout: branch } = await new Deno.Command("git", {
    args: ["rev-parse", "--abbrev-ref", "HEAD"],
    stdout: "piped",
    stderr: "piped",
    cwd,
  }).output();
  const { stdout: sha } = await new Deno.Command("git", {
    args: ["log", "-1", "--pretty=%h"],
    stdout: "piped",
    stderr: "piped",
    cwd,
  }).output();
  const { stdout: author } = await new Deno.Command("git", {
    args: ["log", "-1", "--pretty=%an"],
    stdout: "piped",
    stderr: "piped",
    cwd,
  }).output();
  return {
    commit: new TextDecoder().decode(commit).trim(),
    branch: new TextDecoder().decode(branch).trim(),
    sha: new TextDecoder().decode(sha).trim(),
    author: new TextDecoder().decode(author).trim(),
  };
}

export async function cloneRepository(
  url: string,
  cwd = Deno.cwd()
): Promise<boolean> {
  const status = await new Deno.Command("git", {
    args: ["clone", url],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    cwd,
  }).spawn().status;
  return status.success;
}
