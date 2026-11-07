import type { Meta, StoryObj } from "@storybook/react";
import { ModuleDocs } from "./index";
import { typedPlugin } from "../../fixtures/registry";

const meta = {
  title: "Registry/ModuleDocs",
  component: ModuleDocs,
  args: { plugin: typedPlugin, handle: "fluentci.io" },
} satisfies Meta<typeof ModuleDocs>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
export const Empty: Story = {
  args: { plugin: { ...typedPlugin, functions: [] } },
};
