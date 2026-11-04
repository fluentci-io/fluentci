import { FC } from "react";
import { TableBuilder, TableBuilderColumn } from "baseui/table-semantic";

type Row = {
  id: string;
  name: string;
  value: string;
  updated: string;
};

type Variable = {
  id: string;
  name: string;
  updated: string;
};

export type VariablesTabProps = {
  data: Variable[];
};

const VariablesTab: FC<VariablesTabProps> = (props) => {
  const { data } = props;
  return (
    <div style={{ overflow: "scroll", height: "calc(60vh - 52px)" }}>
      <TableBuilder
        data={data}
        overrides={{
          TableHeadCell: {
            style: ({ $theme }) => ({
              fontFamily: $theme.primaryFontFamily,
            }),
          },
          TableBodyRow: {
            style: {
              ":hover": {
                backgroundColor: "#140629",
              },
            },
          },
        }}
      >
        <TableBuilderColumn header="Name">
          {(row: Row) => <div>{row.name}</div>}
        </TableBuilderColumn>
        <TableBuilderColumn header="Value">
          {(row: Row) => <div>{row.value}</div>}
        </TableBuilderColumn>
        <TableBuilderColumn header="Last updated">
          {(row: Row) => <div>{row.updated}</div>}
        </TableBuilderColumn>
      </TableBuilder>
    </div>
  );
};

export default VariablesTab;
