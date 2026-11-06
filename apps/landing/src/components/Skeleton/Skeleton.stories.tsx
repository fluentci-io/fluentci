import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton } from "./index";
const meta = { title: "Loading/Skeleton", component: Skeleton } satisfies Meta<
  typeof Skeleton
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { className: "h-6 w-48" } };
