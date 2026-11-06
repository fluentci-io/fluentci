import type { Meta, StoryObj } from "@storybook/react";
import { SiteHeader } from "./index";

const meta = {
  title: "Landing/SiteHeader",
  component: SiteHeader,
} satisfies Meta<typeof SiteHeader>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
