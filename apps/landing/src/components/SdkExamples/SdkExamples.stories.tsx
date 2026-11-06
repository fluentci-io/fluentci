import type { Meta, StoryObj } from "@storybook/react";
import { SdkExamples } from "./index";

const meta = {
  title: "Landing/SdkExamples",
  component: SdkExamples,
} satisfies Meta<typeof SdkExamples>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
