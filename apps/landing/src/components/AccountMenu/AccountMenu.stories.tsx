import type { Meta, StoryObj } from "@storybook/react";
import { AccountMenu } from "./index";
import { AuthContext } from "../../auth/context";
import type { Account } from "../../auth/client";
import { author } from "../../fixtures/registry";
const meta = {
  title: "Registry/AccountMenu",
  component: AccountMenu,
} satisfies Meta<typeof AccountMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
export const SignedOut: Story = {};
export const SignedIn: Story = {
  decorators: [
    (Story) => (
      <AuthContext.Provider
        value={{
          account: {
            did: author.did,
            profile: { ...author, displayName: "FluentCI" },
          } as Account,
          loading: false,
          error: "",
          openSignIn: () => {},
          logout: () => {},
        }}
      >
        <Story />
      </AuthContext.Provider>
    ),
  ],
};
