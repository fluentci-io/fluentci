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
