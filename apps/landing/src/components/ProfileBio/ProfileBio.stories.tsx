import type { Meta, StoryObj } from "@storybook/react";
import { ProfileBio } from "./ProfileBio";
const meta = {
  title: "Registry/ProfileBio",
  component: ProfileBio,
  args: {
    text: "Building @rocksky.app, @atradio.fm, @fluentci.io and https://github.com/tsirysndr/rockboxd\nSupport my work → https://github.com/sponsors/tsirysndr",
  },
} satisfies Meta<typeof ProfileBio>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const PlainText: Story = {
  args: { text: "Typed pipelines, built together." },
};
