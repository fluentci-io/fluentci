import { assertEquals } from "../../deps.ts";
import { generateYaml } from "./config.ts";

Deno.test(function generateGithubActionsWorkflowTest() {
  const workflow = generateYaml();
  const actual = workflow.toString();
  const expected = Deno.readTextFileSync("./fixtures/workflow.yml");
  assertEquals(actual, expected);
});
