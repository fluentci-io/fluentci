import { FC } from "react";
import { Github } from "@styled-icons/bootstrap";
import { EllipsisVertical } from "@styled-icons/fa-solid";
import { StatefulPopover } from "baseui/popover";
import { StatefulMenu } from "baseui/menu";
import { Breadcrumbs } from "baseui/breadcrumbs";
import styles, {
  Link,
  Container,
  RunButton,
  PopoverButton,
  GithubLink,
  Visibility,
  Archive,
} from "./styles";
import { Spinner } from "baseui/spinner";
import { Project, Repository } from "../../Hooks/GraphQL";

export type HeaderProps = {
  id: string;
  onRun: (id: string) => void;
  menu?: string[];
  breadcrumbs?: { title: string; link?: string }[];
  showRunButton?: boolean;
  loading?: boolean;
  linkedRepository?: Repository | null;
  project?: Project | null;
  isPublic?: boolean;
  isArchived?: boolean;
  running?: boolean;
  onCancelRun?: () => void;
};

const Header: FC<HeaderProps> = (props) => {
  const {
    id,
    breadcrumbs,
    onRun,
    menu,
    showRunButton,
    linkedRepository,
    onCancelRun,
    running,
  } = props;
  return (
    <Container>
      <div
        style={{
          marginRight: 15,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <img
          src={props.project?.picture}
          style={{ maxHeight: 34, maxWidth: 34 }}
        />
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            flex: 1,
            alignItems: "center",
          }}
        >
          <Breadcrumbs
            overrides={{
              Root: {
                style: {
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                },
              },
              ListItem: {
                style: ({ $theme }) => ({
                  fontFamily: $theme.primaryFontFamily,
                }),
              },
            }}
          >
            {breadcrumbs?.map(({ title, link }, index) => {
              if (link) {
                return (
                  <Link key={index} to={link} style={{ color: "#ffffffb0" }}>
                    {title}
                  </Link>
                );
              }
              return <span key={index}>{title}</span>;
            })}
          </Breadcrumbs>
          {props.isPublic && <Visibility>Public</Visibility>}
          {props.isArchived && <Archive>Archive</Archive>}
        </div>
        <p
          style={{
            fontSize: 14,
            margin: 0,
            marginTop: 3,
            color: "rgba(255, 255, 255, 0.75)",
          }}
        >
          {props.project?.description}
        </p>
      </div>
      {linkedRepository && (
        <div style={{ display: "flex", alignItems: "center", marginRight: 20 }}>
          <GithubLink href={linkedRepository.repoUrl} target="_blank">
            <Github size={20} />
          </GithubLink>
        </div>
      )}
      {!!menu?.length && (
        <StatefulPopover
          placement="bottomRight"
          content={({ close }) => (
            <StatefulMenu
              items={menu.map((label) => ({ label }))}
              onItemSelect={() => {
                close();
              }}
              overrides={styles.StatefulMenu}
            />
          )}
        >
          <PopoverButton onClick={(e) => e.stopPropagation()}>
            <EllipsisVertical size={20} />
          </PopoverButton>
        </StatefulPopover>
      )}
      {showRunButton && (
        <>
          {!props.loading && running && (
            <RunButton onClick={() => onCancelRun!()}>Cancel Run</RunButton>
          )}
          {!props.loading && !running && (
            <RunButton onClick={() => onRun(id)} disabled={props.isArchived}>
              Run
            </RunButton>
          )}
          {props.loading && (
            <RunButton disabled>
              <Spinner
                $size={"15px"}
                $borderWidth={"3px"}
                style={{
                  borderRightColor: "#ffffff22",
                  borderLeftColor: "#ffffff22",
                  borderTopColor: "#ffffff22",
                  borderBottomColor: "#000",
                }}
              />
            </RunButton>
          )}
        </>
      )}
    </Container>
  );
};

Header.defaultProps = {
  menu: [],
  breadcrumbs: [
    {
      title: "Projects",
      link: "/",
    },
  ],
};

export default Header;
