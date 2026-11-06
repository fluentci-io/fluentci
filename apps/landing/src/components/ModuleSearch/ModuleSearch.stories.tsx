import type { Meta, StoryObj } from "@storybook/react";
import { ModuleSearch } from "./index";

const meta = {
  title: "Registry/ModuleSearch",
  component: ModuleSearch,
} satisfies Meta<typeof ModuleSearch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
