import { FC, useEffect } from "react";
import Placeholder from "./Placeholder";
import { Run } from "../../../../Hooks/GraphQL";
import styles, { RunItem, Branch, Title } from "./styles";
import { Link } from "react-router-dom";
import { CheckCircle } from "@styled-icons/boxicons-solid";
import { GitBranch } from "@styled-icons/boxicons-regular";
import { Spinner } from "baseui/spinner";
import { CloseCircle } from "@styled-icons/ionicons-sharp";
import dayjs from "dayjs";
import duration from "dayjs/plugin/duration";
import Duration from "../../../../Components/Duration";
import { Pagination } from "baseui/pagination";
import ContentLoader from "react-content-loader";

dayjs.extend(duration);

export type RunsProps = {
  data: Run[];
  pagination: {
    cursor?: string;
    currentPage: number;
    limit: number;
    numPages: number;
  };
  setCurrentPage: (page: number) => void;
  loading: boolean;
  total: number;
};

const Runs: FC<RunsProps> = (props) => {
  const {
    data,
    pagination: { currentPage, numPages, limit },
    setCurrentPage,
    loading,
    total,
  } = props;

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <>
      {loading && (
        <ContentLoader
          speed={2}
          width={1200}
          height={500}
          viewBox="0 0 1200 500"
          backgroundColor="#170234"
          foregroundColor="#2f0272"
          {...props}
        >
          <circle cx="10" cy="40" r="8" />
          <rect x="35" y="35" rx="5" ry="5" width="1000" height="10" />
          <circle cx="10" cy="90" r="8" />
          <rect x="35" y="85" rx="5" ry="5" width="1000" height="10" />
          <circle cx="10" cy="140" r="8" />
          <rect x="35" y="135" rx="5" ry="5" width="1000" height="10" />
          <circle cx="10" cy="190" r="8" />
          <rect x="35" y="185" rx="5" ry="5" width="1000" height="10" />
        </ContentLoader>
      )}
      {data.length === 0 && !loading && <Placeholder />}
      {data.length > 0 && !loading && (
        <div>
          {data.map((item, index) => (
            <Link to={`/run/${item.id}`} key={item.id}>
              <RunItem showBorder={index !== data.length - 1}>
                {!item.status && (
                  <div style={{ marginRight: 15, width: 15, height: 15 }}></div>
                )}
                {item.status === "RUNNING" && (
                  <Spinner
                    $size={"15px"}
                    $borderWidth={"3px"}
                    style={{
                      borderRightColor: "#ffffff22",
                      borderLeftColor: "#ffffff22",
                      borderTopColor: "#ffffff22",
                      borderBottomColor: "#24ffd7",
                      marginRight: 15,
                    }}
                  />
                )}
                {item.status === "SUCCESS" && (
                  <div style={{ marginRight: 15 }}>
                    <CheckCircle size={"24px"} color="#24ffa0" />
                  </div>
                )}
                {item.status === "FAILURE" && (
                  <div style={{ marginRight: 15 }}>
                    <CloseCircle size={"24px"} color="#ff246d" />
                  </div>
                )}
                <div style={{ minWidth: 54, marginRight: 10 }}>
                  {item.name}:
                </div>
                <Title>{item.title}</Title>
                <div style={{ marginLeft: 15, flex: 1 }}>
                  {item.branch && (
                    <Branch>
                      <GitBranch
                        size={15}
                        color="#00e3f9"
                        style={{ marginRight: 5 }}
                      />
                      {item.branch}
                    </Branch>
                  )}
                </div>
                {item.status === "RUNNING" && (
                  <Duration startDate={item.date} />
                )}
                {item.status !== "RUNNING" && (
                  <Duration value={item.duration} />
                )}
              </RunItem>
            </Link>
          ))}
          {total > limit && (
            <Pagination
              overrides={styles.Pagination}
              numPages={numPages}
              currentPage={currentPage}
              onPageChange={({ nextPage }) => {
                setCurrentPage(Math.min(Math.max(nextPage, 1), numPages));
              }}
            />
          )}
        </div>
      )}
    </>
  );
};

export default Runs;
