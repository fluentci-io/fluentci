import type { Meta, StoryObj } from "@storybook/react";
import { LandingPage } from "./index";

const meta = {
  title: "Landing/LandingPage",
  component: LandingPage,
} satisfies Meta<typeof LandingPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
