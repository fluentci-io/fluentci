import type { Meta, StoryObj } from "@storybook/react";
import { HandleSuggestions } from "./index";
import { author } from "../../fixtures/registry";
const meta = {
  title: "Registry/HandleSuggestions",
  component: HandleSuggestions,
  args: {
    items: [{ ...author, displayName: "FluentCI" }],
    loading: false,
    active: 0,
    select: () => {},
  },
} satisfies Meta<typeof HandleSuggestions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
export const Loading: Story = { args: { loading: true } };
