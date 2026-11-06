import type { Meta, StoryObj } from "@storybook/react";
import { Code } from "./index";

const meta = { title: "Landing/Code", component: Code } satisfies Meta<
  typeof Code
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: {
    children: "fluentci run @fluentci.io/sccache@0.1.0 setup",
    language: "bash",
  },
};
