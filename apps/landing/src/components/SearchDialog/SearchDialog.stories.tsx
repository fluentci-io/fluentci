import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { SearchDialog } from "./index";

const meta = {
  title: "Registry/SearchDialog",
  component: SearchDialog,
} satisfies Meta<typeof SearchDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { close: fn() } };
