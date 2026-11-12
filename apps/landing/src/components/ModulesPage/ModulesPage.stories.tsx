import type { Meta, StoryObj } from "@storybook/react";
import { ModulesPage } from "./index";
const meta = {
  title: "Registry/ModulesPage",
  component: ModulesPage,
  parameters: { path: "/modules" },
} satisfies Meta<typeof ModulesPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = { parameters: { theme: "dark" } };
export const Light: Story = { parameters: { theme: "light" } };
