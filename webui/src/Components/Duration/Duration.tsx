import { FC, useEffect, useState } from "react";
import { Container } from "./styles";
import { useFormat } from "../../Hooks/useFormat";
import dayjs from "dayjs";
import durationPlugin from "dayjs/plugin/duration";
import { interval } from "rxjs";

dayjs.extend(durationPlugin);

export type DurationProps = {
  startDate?: string | null;
  value?: number | null;
};

const Duration: FC<DurationProps> = (props) => {
  const { startDate, value } = props;
  const { formatDuration } = useFormat();
  const [duration, setDuration] = useState<number>();

  useEffect(() => {
    const subscription = interval(1).subscribe(() => {
      if (startDate) {
        setDuration(dayjs().diff(dayjs(startDate), "milliseconds"));
      }
    });
    return () => subscription.unsubscribe();
  }, [startDate]);

  return (
    <>
      {startDate && (
        <Container>
          {duration ? formatDuration(dayjs.duration(duration)) : ""}
        </Container>
      )}
      {!startDate && (
        <Container>
          {value ? formatDuration(dayjs.duration(value)) : ""}
        </Container>
      )}
    </>
  );
};

export default Duration;
