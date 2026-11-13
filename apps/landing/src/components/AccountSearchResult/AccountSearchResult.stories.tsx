import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "@storybook/test";
import { author } from "../../fixtures/registry";
import { AccountSearchResult } from "./AccountSearchResult";
const meta = {
  title: "Registry/AccountSearchResult",
  component: AccountSearchResult,
  args: {
    profile: { ...author, displayName: "FluentCI" },
    index: 0,
    selected: false,
    select: fn(),
    close: fn(),
  },
} satisfies Meta<typeof AccountSearchResult>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = { args: { selected: true } };
export const Placeholder: Story = {
  args: { profile: { ...author, avatar: undefined, displayName: undefined } },
};
