import type { Meta, StoryObj } from "@storybook/react";
import { ModuleGridSkeleton } from "./index";
const meta = {
  title: "Registry/ModuleGridSkeleton",
  component: ModuleGridSkeleton,
  parameters: { path: "/modules" },
} satisfies Meta<typeof ModuleGridSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = { parameters: { theme: "dark" } };
export const Light: Story = { parameters: { theme: "light" } };
