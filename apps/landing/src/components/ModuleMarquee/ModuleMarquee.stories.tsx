import type { Meta, StoryObj } from "@storybook/react";
import { ModuleMarquee } from "./index";
const meta = {
  title: "Landing/ModuleMarquee",
  component: ModuleMarquee,
} satisfies Meta<typeof ModuleMarquee>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = { parameters: { theme: "dark" } };
export const Light: Story = { parameters: { theme: "light" } };
