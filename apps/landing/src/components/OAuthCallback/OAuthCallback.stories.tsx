import type { Meta, StoryObj } from "@storybook/react";
import { OAuthCallback } from "./index";

const meta = { title: "Registry/OAuthCallback", component: OAuthCallback,  } satisfies Meta<typeof OAuthCallback>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
