import type { Meta, StoryObj } from "@storybook/react";
import { author } from "../../fixtures/registry";
import { Author } from "./index";

const meta = { title: "Registry/Author", component: Author } satisfies Meta<
  typeof Author
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: { profile: author, fallback: author.handle },
};
export const WithoutAvatar: Story = { args: { fallback: "alice.example" } };
