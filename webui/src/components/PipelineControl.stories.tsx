import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { PipelineControl } from "./PipelineControl";
import { makeRun } from "../mocks/fixtures";

const meta = {
  title: "Studio/Pipeline control",
  component: PipelineControl,
  args: { onRun: fn(), onCancel: fn() },
} satisfies Meta<typeof PipelineControl>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Ready: Story = {};
export const Running: Story = { args: { run: makeRun("RUNNING") } };
export const Queued: Story = { args: { run: makeRun("PENDING") } };
export const Passed: Story = { args: { run: makeRun("SUCCESS") } };
export const Failed: Story = { args: { run: makeRun("FAILURE") } };
export const Cancelled: Story = { args: { run: makeRun("CANCELLED") } };
export const Starting: Story = { args: { pending: true } };
export const Cancelling: Story = {
  args: { run: makeRun("RUNNING"), pending: true },
};
