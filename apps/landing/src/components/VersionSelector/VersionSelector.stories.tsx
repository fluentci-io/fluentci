import type { Meta, StoryObj } from "@storybook/react";
import { plugin } from "../../fixtures/registry";
import { VersionSelector } from "./index";

const meta = {
  title: "Registry/VersionSelector",
  component: VersionSelector,
} satisfies Meta<typeof VersionSelector>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { plugin, handle: "fluentci.io" } };
