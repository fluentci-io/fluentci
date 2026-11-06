import type { Meta, StoryObj } from "@storybook/react";
import { plugin } from "../../fixtures/registry";
import { Downloads } from "./index";

const meta = {
  title: "Registry/Downloads",
  component: Downloads,
} satisfies Meta<typeof Downloads>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { plugin } };
export const Unavailable: Story = {
  args: { plugin: { ...plugin, dailyDownloads: undefined, downloads: 0 } },
};
export const Zero: Story = {
  args: {
    plugin: {
      ...plugin,
      downloads: 0,
      dailyDownloads: plugin.dailyDownloads!.map((day) => ({
        ...day,
        downloads: 0,
      })),
    },
  },
};
