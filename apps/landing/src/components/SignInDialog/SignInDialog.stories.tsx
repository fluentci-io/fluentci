import type { Meta, StoryObj } from "@storybook/react";
import { SignInDialog } from "./index";

const meta = {
  title: "Registry/SignInDialog",
  component: SignInDialog,
  args: { close: () => {} },
} satisfies Meta<typeof SignInDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
