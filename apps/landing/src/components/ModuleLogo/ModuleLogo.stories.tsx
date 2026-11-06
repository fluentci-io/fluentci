import type { Meta, StoryObj } from "@storybook/react";
import { plugin } from "../../fixtures/registry";
import { ModuleLogo } from "./index";

const meta = {
  title: "Registry/ModuleLogo",
  component: ModuleLogo,
} satisfies Meta<typeof ModuleLogo>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { plugin } };
export const Placeholder: Story = {
  args: { plugin: { ...plugin, logo: undefined } },
};

export const LargePlaceholder: Story = {
  args: { plugin: { ...plugin, logo: undefined }, large: true },
};
