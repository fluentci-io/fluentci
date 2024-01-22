import { assertEquals } from "../../deps.ts";
import { generateYaml } from "./config.ts";

Deno.test(function generateGitlabCITest() {
  const gitlabci = generateYaml();
  const actual = gitlabci.toString();
  const expected = Deno.readTextFileSync("./fixtures/.gitlab-ci.yml");
  assertEquals(actual, expected);
});
