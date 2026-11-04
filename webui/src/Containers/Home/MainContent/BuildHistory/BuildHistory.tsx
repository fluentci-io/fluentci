import { FC, useMemo } from "react";
import { CheckCircle, Clock } from "@styled-icons/bootstrap";
import { CloseOutline } from "@styled-icons/evaicons-outline";
import { Bar, Bars, Info, Status, Unit, Value, Container } from "./styles";
import { nanoid } from "nanoid";

export type BuildHistoryProps = {
  builds: {
    duration: number;
    status: string;
  }[];
  status: string;
  reliability: number;
  speed: number;
  buildsPerWeek: number;
};

const BuildHistory: FC<BuildHistoryProps> = (props) => {
  const { builds, status, reliability, speed, buildsPerWeek } = props;

  const max = useMemo(() => {
    return Math.max(...builds.map(({ duration }) => duration));
  }, [builds]);

  const _builds = useMemo(
    () =>
      builds.map(({ duration, status }) => ({
        duration: (duration * 100) / max,
        status,
      })),
    [builds, max]
  );

  const convertSpeed = (speed: number) => {
    if (speed < 60) return speed;
    if (speed < 3600) return Math.floor(speed / 60);
    return Math.floor(speed / 3600);
  };

  const convertSpeedUnit = (speed: number) => {
    if (speed < 60) return "s";
    if (speed < 3600) return "m";
    return "h";
  };

  return (
    <Container>
      <Bars>
        <div style={{ position: "relative", width: 179 }}>
          {_builds.map(({ duration, status }, i) => (
            <Bar
              key={nanoid()}
              max={duration}
              n={i + 1}
              success={status === "SUCCESS"}
            />
          ))}
        </div>
      </Bars>
      <Info>
        <div>Speed</div>
        <Value>
          {convertSpeed(Math.round((speed / 1000) * 100) / 100)}
          <Unit>{convertSpeedUnit(speed / 1000)}</Unit>
        </Value>
      </Info>
      <Info>
        <div>Reliability</div>
        <Value>
          {Math.round(reliability * 100) / 100}
          <Unit>%</Unit>
        </Value>
      </Info>
      <Info>
        <div>Builds</div>
        <Value>
          {buildsPerWeek}
          <Unit>/ week</Unit>
        </Value>
      </Info>
      <Status status={status}>
        {status === "SUCCESS" && <CheckCircle size="24" color="#05f076" />}
        {status === "PENDING" && <Clock size={"24"} color="orange" />}
        {status === "FAILURE" && <CloseOutline size={"24"} color="#ff006a" />}
      </Status>
    </Container>
  );
};

export default BuildHistory;
