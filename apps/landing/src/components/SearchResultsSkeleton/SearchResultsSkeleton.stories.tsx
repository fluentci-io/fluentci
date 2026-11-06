import type { Meta, StoryObj } from "@storybook/react";
import { SearchResultsSkeleton } from "./index";
const meta = {
  title: "Loading/SearchResultsSkeleton",
  component: SearchResultsSkeleton,
} satisfies Meta<typeof SearchResultsSkeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
