import { useRef, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { FunctionSearch } from "./index";
const meta = {
  title: "Registry/FunctionSearch",
  component: FunctionSearch,
  render: function Example() {
    const [value, onChange] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    return (
      <FunctionSearch
        value={value}
        onChange={onChange}
        inputRef={inputRef}
        onFocus={() => {}}
        onBlur={() => {}}
      />
    );
  },
} satisfies Meta<typeof FunctionSearch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  args: {
    value: "",
    onChange: () => {},
    inputRef: { current: null },
    onFocus: () => {},
    onBlur: () => {},
  },
};
export const Light: Story = { ...Default, parameters: { theme: "light" } };
