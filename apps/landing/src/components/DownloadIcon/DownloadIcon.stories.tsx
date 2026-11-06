import type { Meta, StoryObj } from "@storybook/react";
import { DownloadIcon } from "./index";

const meta = {
  title: "Registry/DownloadIcon",
  component: DownloadIcon,
} satisfies Meta<typeof DownloadIcon>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
