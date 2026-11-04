import { FC } from "react";
import {
  Container,
  RunButton,
  Header,
  Title,
  ProjectWrapper,
  Picture,
  PictureWrapper,
  Path,
  Row,
  Visibility,
  Tag,
  Avatar,
  Separator,
  GithubUserName,
  Archive,
  LinkGithubRepo,
} from "./styles";
import { Account, Project } from "../../../Hooks/GraphQL";
import { Link } from "react-router-dom";
import BuildHistory from "./BuildHistory";
import _ from "lodash";
import { Github, Calendar } from "@styled-icons/bootstrap";
import { Buildings } from "@styled-icons/boxicons-regular";
import { LockClosed } from "@styled-icons/ionicons-outline";
import { GithubOutline } from "@styled-icons/evaicons-outline";
import dayjs from "dayjs";
import Loader from "./Loader";

export type MainContentProps = {
  projects?: Project[];
  onNewProject: () => void;
  displayNewProjectButton: boolean;
  profile?: Account | null;
  loading: boolean;
};

const MainContent: FC<MainContentProps> = (props) => {
  const { projects, onNewProject, profile, loading } = props;
  return (
    <div>
      <Container>
        {profile && (
          <>
            <Row>
              <Avatar src={profile.picture!} />
              <div style={{ marginLeft: 16 }}>
                <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 3 }}>
                  {profile.name || profile.github}
                </div>
                <a
                  href={`https://github.com/${profile.github}`}
                  target="_blank"
                >
                  <Row>
                    <Github size={18} color="rgba(115, 146, 177, 0.7)" />
                    <GithubUserName>{profile.github}</GithubUserName>
                  </Row>
                </a>
              </div>
            </Row>
            <Separator />
          </>
        )}
        <Row style={{ alignItems: "flex-start" }}>
          {profile && (
            <div style={{ flex: 0.3, color: "rgba(115, 146, 177, 0.7)" }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Profile</div>
              <Row style={{ marginTop: 24 }}>
                <Calendar size={16} />
                <div style={{ fontSize: 14, marginLeft: 16 }}>
                  Joined on {dayjs(profile?.createdAt).format("MMM DD, YYYY")}
                </div>
              </Row>
              {profile?.company && (
                <Row style={{ marginTop: 24 }}>
                  <Buildings size={20} />
                  <div style={{ fontSize: 14, marginLeft: 14 }}>
                    {profile?.company}
                  </div>
                </Row>
              )}
            </div>
          )}
          {loading && (
            <div style={{ flex: 1 }}>
              <Loader />
            </div>
          )}
          {!loading && (
            <div style={{ flex: 1 }}>
              <Header>
                <Title>Projects</Title>
                {props.displayNewProjectButton && (
                  <RunButton onClick={onNewProject}>New Project</RunButton>
                )}
              </Header>
              {projects!.map((item, index) => (
                <div
                  key={index}
                  style={{ marginBottom: 25, position: "relative" }}
                >
                  <ProjectWrapper>
                    <PictureWrapper>
                      <Picture src={item.picture} />
                    </PictureWrapper>
                    <div style={{ width: "calc(50% - 40px)" }}>
                      <Link
                        to={`/project/${item.id}`}
                        style={{ color: "#fff" }}
                      >
                        <Row>
                          <div>{item.displayName || item.name}</div>
                          {item.isPrivate === false && (
                            <Visibility>Public</Visibility>
                          )}
                          {item.archived === true && <Archive>Archive</Archive>}
                        </Row>
                        {item.path !== "empty" && !!item.path && (
                          <Path
                            style={{
                              marginBottom: item.repositoryUrl ? 0 : 10,
                            }}
                          >
                            {item.path}
                          </Path>
                        )}
                      </Link>

                      {item.repositoryUrl && (
                        <div style={{ marginBottom: 10, marginTop: 5 }}>
                          <GithubOutline
                            size={18}
                            color={"#fff"}
                            style={{ marginRight: 10 }}
                          />
                          <LinkGithubRepo
                            href={item.repositoryUrl!}
                            target="_blank"
                          >
                            {item.repositoryUrl.replace(
                              "https://github.com/",
                              ""
                            )}
                          </LinkGithubRepo>
                        </div>
                      )}
                      <div>
                        {item.tags
                          ?.filter((x) => x)
                          .map((tag, index) => (
                            <Tag key={index}>{tag}</Tag>
                          ))}
                      </div>
                    </div>
                    {_.get(item, "recentRuns.0.status") && (
                      <BuildHistory
                        status={_.last(item.recentRuns)?.status || "PENDING"}
                        reliability={item.reliability || 0}
                        speed={item.speed || 0}
                        buildsPerWeek={item.buildsPerWeek || 0}
                        builds={
                          Array.from(Array(18).keys()).map((i) => ({
                            status: _.get(item, `recentRuns.${i}.status`, ""),
                            duration: _.get(
                              item,
                              `recentRuns.${i}.duration`,
                              0
                            ),
                          })) || []
                        }
                      />
                    )}
                  </ProjectWrapper>
                </div>
              ))}
              {!projects?.length && (
                <>
                  {!profile && !loading && (
                    <div style={{ color: "rgba(115, 146, 177, 0.7)" }}>
                      No projects found. Create a new project to get started.
                    </div>
                  )}
                  {profile && !loading && (
                    <div
                      style={{
                        color: "#7392b1b2",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <LockClosed size={60} color="#7392b17d" />
                      <div style={{ marginTop: 10 }}>
                        This user has no public projects.
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </Row>
      </Container>
      <div style={{ height: 100 }} />
    </div>
  );
};

MainContent.defaultProps = {
  projects: [],
};

export default MainContent;
