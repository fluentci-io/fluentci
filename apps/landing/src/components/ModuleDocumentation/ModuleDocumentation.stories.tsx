import type { Meta, StoryObj } from "@storybook/react";
import { ModuleDocumentation } from "./index";
import { typedPlugin } from "../../fixtures/registry";

const meta = {
  title: "Registry/ModuleDocumentation",
  component: ModuleDocumentation,
  args: { plugin: typedPlugin, handle: "fluentci.io" },
} satisfies Meta<typeof ModuleDocumentation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
export const Empty: Story = {
  args: { plugin: { ...typedPlugin, functions: [] } },
};
