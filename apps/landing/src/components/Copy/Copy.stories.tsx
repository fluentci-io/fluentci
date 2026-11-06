import type { Meta, StoryObj } from "@storybook/react";
import { Copy } from "./index";

const meta = { title: "Landing/Copy", component: Copy } satisfies Meta<
  typeof Copy
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: { text: "curl -fsSL https://cli.fluentci.io | sh" },
};
