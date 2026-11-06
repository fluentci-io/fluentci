import type { Meta, StoryObj } from "@storybook/react";
import { ModulePage } from "./index";

const meta = {
  title: "Registry/ModulePage",
  component: ModulePage,
  parameters: { path: "/fluentci.io/plugin/sccache-0.1.0" },
} satisfies Meta<typeof ModulePage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
