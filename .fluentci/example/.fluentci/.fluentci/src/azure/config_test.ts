import { assertEquals } from "../../deps.ts";
import { generateYaml } from "./config.ts";

Deno.test(function generateAzurePipelinesTest() {
  const azurepipelines = generateYaml();
  const actual = azurepipelines.toString();
  const expected = Deno.readTextFileSync("./fixtures/azure-pipelines.yml");
  assertEquals(actual, expected);
});
