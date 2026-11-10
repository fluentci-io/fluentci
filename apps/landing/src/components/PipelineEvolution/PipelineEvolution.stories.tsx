import type { Meta, StoryObj } from "@storybook/react";
import { PipelineEvolution } from "./index";

const meta = {
  title: "Landing/PipelineEvolution",
  component: PipelineEvolution,
} satisfies Meta<typeof PipelineEvolution>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = { parameters: { theme: "dark" } };
export const Light: Story = { parameters: { theme: "light" } };
