import type { Meta, StoryObj } from "@storybook/react";
import { UserIcon } from "./UserIcon";
const meta = {
  title: "Registry/UserIcon",
  component: UserIcon,
  decorators: [
    (Story) => (
      <div className="flex size-16 items-center justify-center rounded-full bg-raised">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof UserIcon>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
