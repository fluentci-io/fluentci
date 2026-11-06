import type { Meta, StoryObj } from "@storybook/react";
import { plugin } from "../../fixtures/registry";
import { Readme } from "./index";

const meta = { title: "Registry/Readme", component: Readme } satisfies Meta<
  typeof Readme
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = { args: { plugin } };
