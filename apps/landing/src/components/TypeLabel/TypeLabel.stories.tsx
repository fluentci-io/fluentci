import type { Meta, StoryObj } from "@storybook/react";
import { TypeLabel } from "./index";
const meta = {
  title: "Registry/TypeLabel",
  component: TypeLabel,
  args: { type: "Result(string[], integer | boolean)" },
} satisfies Meta<typeof TypeLabel>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
