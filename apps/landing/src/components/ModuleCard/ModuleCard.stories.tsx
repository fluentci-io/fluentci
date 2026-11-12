import type { Meta, StoryObj } from "@storybook/react";
import { ModuleCard } from "./index";
import { plugin, author } from "../../fixtures/registry";
const meta = {
  title: "Registry/ModuleCard",
  component: ModuleCard,
  args: { plugin, profile: author },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ModuleCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
export const Placeholder: Story = {
  args: { plugin: { ...plugin, logo: undefined } },
};
