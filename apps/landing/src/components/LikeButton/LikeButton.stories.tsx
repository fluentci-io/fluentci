import type { Meta, StoryObj } from "@storybook/react";
import { LikeButton } from "./index";
import { plugin } from "../../fixtures/registry";
const meta = {
  title: "Registry/LikeButton",
  component: LikeButton,
  args: { plugin },
} satisfies Meta<typeof LikeButton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
