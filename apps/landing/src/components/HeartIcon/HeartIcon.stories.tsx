import type { Meta, StoryObj } from "@storybook/react";
import { HeartIcon } from "./index";

const meta = {
  title: "Registry/HeartIcon",
  component: HeartIcon,
} satisfies Meta<typeof HeartIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
