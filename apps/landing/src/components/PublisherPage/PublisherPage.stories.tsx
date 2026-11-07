import type { Meta, StoryObj } from "@storybook/react";
import { PublisherPage } from "./index";
const meta = {
  title: "Registry/PublisherPage",
  component: PublisherPage,
  parameters: { path: "/fluentci.io" },
} satisfies Meta<typeof PublisherPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
