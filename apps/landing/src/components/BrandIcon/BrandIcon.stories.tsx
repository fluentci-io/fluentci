import type { Meta, StoryObj } from "@storybook/react";
import { BrandIcon } from "./index";

const meta = {
  title: "Landing/BrandIcon",
  component: BrandIcon,
} satisfies Meta<typeof BrandIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { brand: "github" } };
