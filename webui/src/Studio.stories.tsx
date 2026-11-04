import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import App from "./App";
import { createMockApi } from "./mocks/handlers";

const meta = {
  title: "Studio/Workspace",
  component: App,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof App>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  parameters: { msw: { handlers: createMockApi().handlers } },
};
export const Running: Story = {
  parameters: {
    path: "/project/local-fluentci",
    msw: { handlers: createMockApi({ stream: true }).handlers },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: "Cancel pipeline" }),
    ).toBeVisible();
    await expect(
      await canvas.findByRole("button", { name: /Test engine/ }),
    ).toHaveAttribute("aria-expanded", "true");
  },
};
export const Failed: Story = {
  parameters: {
    path: "/project/local-fluentci",
    msw: { handlers: createMockApi({ status: "FAILURE" }).handlers },
  },
};
export const Passed: Story = {
  parameters: {
    path: "/project/local-fluentci",
    msw: { handlers: createMockApi({ status: "SUCCESS" }).handlers },
  },
};
export const Cancelled: Story = {
  parameters: {
    path: "/project/local-fluentci",
    msw: { handlers: createMockApi({ status: "CANCELLED" }).handlers },
  },
};
export const Queued: Story = {
  parameters: {
    path: "/project/local-fluentci",
    msw: { handlers: createMockApi({ status: "PENDING" }).handlers },
  },
};
export const EmptyWorkspace: Story = {
  parameters: { msw: { handlers: createMockApi({ empty: true }).handlers } },
};
export const FirstRun: Story = {
  parameters: {
    path: "/project/local-fluentci",
    msw: { handlers: createMockApi({ noRuns: true }).handlers },
  },
};
export const LargeOutput: Story = {
  parameters: {
    path: "/project/local-fluentci",
    msw: { handlers: createMockApi({ largeLogs: true }).handlers },
  },
};
export const Actions: Story = {
  parameters: {
    path: "/project/local-fluentci/actions",
    msw: { handlers: createMockApi().handlers },
  },
};
export const CIExport: Story = {
  parameters: {
    path: "/project/local-fluentci/export",
    msw: { handlers: createMockApi().handlers },
  },
};
export const QuickSearch: Story = {
  parameters: { msw: { handlers: createMockApi().handlers } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("Workspace overview", { exact: false });
    await userEvent.click(canvas.getByRole("button", { name: /Quick search/ }));
    await userEvent.type(
      within(document.body).getByRole("combobox"),
      "fluentci",
    );
  },
};
