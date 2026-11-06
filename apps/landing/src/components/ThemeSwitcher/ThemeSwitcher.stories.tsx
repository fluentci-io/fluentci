import type { Meta, StoryObj } from "@storybook/react";
import { ThemeSwitcher } from "./index";

const meta = {
  title: "Landing/ThemeSwitcher",
  component: ThemeSwitcher,
} satisfies Meta<typeof ThemeSwitcher>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
