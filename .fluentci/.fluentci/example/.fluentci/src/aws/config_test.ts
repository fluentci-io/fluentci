import { assertEquals } from "../../deps.ts";
import { generateYaml } from "./config.ts";

Deno.test(function generateAWSCodePipelineTest() {
  const buildspec = generateYaml();
  const actual = buildspec.toString();
  const expected = Deno.readTextFileSync("./fixtures/buildspec.yml");
  assertEquals(actual, expected);
});
