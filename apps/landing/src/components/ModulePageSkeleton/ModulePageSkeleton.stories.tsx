import type { Meta, StoryObj } from "@storybook/react";
import { ModulePageSkeleton } from "./index";
const meta = {
  title: "Loading/ModulePageSkeleton",
  component: ModulePageSkeleton,
} satisfies Meta<typeof ModulePageSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
