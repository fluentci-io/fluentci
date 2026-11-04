import { FC } from "react";
import Variables from "./Variables";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const VariablesWithData: FC = () => {
  const variables = [
    {
      id: "1",
      name: "OTEL_EXPORTER_OTLP_ENDPOINT",
      value: "https://otel.baselime.io/v1/",
      updated: dayjs(dayjs().subtract(2, "days")).fromNow(),
    },
  ];
  return <Variables data={variables} />;
};

export default VariablesWithData;
