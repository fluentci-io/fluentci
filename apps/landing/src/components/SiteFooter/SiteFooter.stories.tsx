import type { Meta, StoryObj } from "@storybook/react";
import { SiteFooter } from "./index";
const meta = { title: "Site/Footer", component: SiteFooter } satisfies Meta<
  typeof SiteFooter
>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
