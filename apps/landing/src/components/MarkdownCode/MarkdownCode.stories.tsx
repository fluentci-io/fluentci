import type { Meta, StoryObj } from "@storybook/react";
import { MarkdownCode } from "./index";

const meta = {
  title: "Registry/MarkdownCode",
  component: MarkdownCode,
  decorators: [
    (Story) => (
      <div className="module-markdown">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MarkdownCode>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {
  args: {
    language: "ruby",
    code: 'def greeting(name)\n  puts "Hello, #{name}!"\nend',
  },
};
export const Light: Story = { ...Dark, parameters: { theme: "light" } };
export const YAML: Story = {
  args: {
    language: "yaml",
    code: "name: build\non: [push]\nsteps:\n  - run: nix build",
  },
};
export const Nginx: Story = {
  args: {
    language: "nginx",
    code: "server {\n  listen 443 ssl;\n  location / { proxy_pass http://localhost:3001; }\n}",
  },
};
export const UnknownLanguage: Story = {
  args: {
    language: "unknown",
    code: "<script>This remains escaped text.</script>",
  },
};
