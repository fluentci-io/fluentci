import type { Meta, StoryObj } from "@storybook/react";
import { CopyCommand } from "./index";

const meta = {
  title: "Registry/CopyCommand",
  component: CopyCommand,
} satisfies Meta<typeof CopyCommand>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: { command: "fluentci run @fluentci.io/sccache@0.1.0 setup" },
};
