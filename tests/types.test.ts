import {
  LabelSchema,
  Pipeline,
  PipelineSchema,
  LogEvent,
  LogEventSchema,
  Label,
} from "../src/types.ts";
import { assertEquals } from "https://deno.land/std@0.206.0/assert/mod.ts";

Deno.test("LabelSchema", () => {
  const label: Label = {
    name: "test",
    value: "test",
  };
  const result = LabelSchema.safeParse(label);
  assertEquals(result.success, true);
});

Deno.test("LabelSchema - invalid", () => {
  const label: Label = {
    name: "test",
    // deno-lint-ignore no-explicit-any
    value: 1 as any,
  };
  const result = LabelSchema.safeParse(label);
  assertEquals(result.success, false);
});

Deno.test("PipelineSchema", () => {
  const pipeline: Pipeline = {
    name: "test",
    labels: [
      {
        name: "test",
        value: "test",
      },
    ],
    weak: true,
  };
  const result = PipelineSchema.safeParse(pipeline);
  assertEquals(result.success, true);
});

Deno.test("PipelineSchema - invalid", () => {
  const pipeline: Pipeline = {
    name: "test",
    labels: [
      {
        name: "test",
        value: "test",
      },
    ],
    // deno-lint-ignore no-explicit-any
    weak: "true" as any,
  };
  const result = PipelineSchema.safeParse(pipeline);
  assertEquals(result.success, false);
});

Deno.test("LogEventSchema", () => {
  const logEvent: LogEvent = {
    v: "1",
    ts: "2021-08-04T18:00:00.000Z",
    run_id: "e1b0a0e0-4f3a-4b1a-9b0a-0e04f3a4b1a9",
    type: "op",
    payload: {
      op_id: "f1b0a0e0-4f3a-4b1a-9b0a-0e04f3a4b1a9",
      op_name: "test",
      pipeline: [
        {
          name: "test",
          labels: [
            {
              name: "test",
              value: "test",
            },
          ],
          weak: true,
        },
      ],
      internal: true,
      inputs: ["test"],
      started: "2021-08-04T18:00:00.000Z",
      completed: "2021-08-04T18:00:00.000Z",
      cached: true,
      error: "test",
    },
  };
  const result = LogEventSchema.safeParse(logEvent);
  assertEquals(result.success, true);
});
