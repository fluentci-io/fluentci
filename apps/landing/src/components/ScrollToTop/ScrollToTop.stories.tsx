import type { Meta, StoryObj } from "@storybook/react";
import { ScrollToTop } from "./index";
const meta = {
  title: "Registry/ScrollToTop",
  component: ScrollToTop,
  decorators: [
    (Story) => (
      <div className="min-h-[200vh]">
        <p className="text-muted">Scroll down to reveal the button.</p>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ScrollToTop>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
