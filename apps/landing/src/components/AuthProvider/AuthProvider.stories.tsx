import type { Meta, StoryObj } from "@storybook/react";
import { AuthProvider } from "./index";
import { AccountMenu } from "../AccountMenu";
const meta = { title: "Registry/AuthProvider", component: AuthProvider, args: { children: <AccountMenu /> } } satisfies Meta<typeof AuthProvider>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
