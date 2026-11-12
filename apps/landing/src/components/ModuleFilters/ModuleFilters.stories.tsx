import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { ModuleFilters } from "./index";
import { validateCatalogSearch } from "../ModulesPage/filters";
const meta = {
  title: "Registry/ModuleFilters",
  component: ModuleFilters,
  args: {
    filters: validateCatalogSearch({ categories: ["caching"], os: ["linux"] }),
    onChange: () => {},
  },
  render: function Interactive(args) {
    const [filters, setFilters] = useState(args.filters);
    return (
      <div className="max-w-xs">
        <ModuleFilters filters={filters} onChange={setFilters} />
      </div>
    );
  },
} satisfies Meta<typeof ModuleFilters>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Dark: Story = {};
export const Light: Story = { parameters: { theme: "light" } };
