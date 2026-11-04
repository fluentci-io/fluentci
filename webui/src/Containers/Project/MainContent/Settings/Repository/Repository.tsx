import { FC } from "react";
import styles, {
  Label,
  Row,
  Section,
  UnlinkButton,
  Text,
  LinkGithubRepo,
} from "../styles";
import { Github } from "@styled-icons/bootstrap";
import { Spinner } from "baseui/spinner";
import {
  Organization,
  Repository as RepositoryType,
} from "../../../../../Hooks/GraphQL";
import { Link } from "react-router-dom";

export type RepositoryProps = {
  linkedRepository?: RepositoryType | null;
  onUnlinkRepository: (id: string) => Promise<void>;
  loadingLinkedRepository: boolean;
  projectId?: string;
  orgs: Organization[];
  displayRepositorySection: boolean;
  loadingUnlink: boolean;
};

const Repository: FC<RepositoryProps> = (props) => {
  const {
    linkedRepository,
    loadingLinkedRepository,
    projectId,
    orgs,
    onUnlinkRepository,
    loadingUnlink,
  } = props;
  return (
    <>
      <Section style={{ marginTop: 42 }}>
        <Label>Repository</Label>
        {!loadingLinkedRepository && linkedRepository && (
          <>
            <Row style={{ padding: 10 }}>
              <Github size={20} color="#fff" />
              <a
                href={linkedRepository.repoUrl}
                style={{ color: "#fff", marginLeft: 10, flex: 1 }}
                target="_blank"
              >
                {linkedRepository.repoUrl}
              </a>
              <UnlinkButton
                onClick={() => onUnlinkRepository(linkedRepository.name)}
              >
                {!loadingUnlink && <div>Unlink repository</div>}
                {loadingUnlink && (
                  <Spinner
                    $size={"15px"}
                    $borderWidth={"3px"}
                    style={styles.Spinner}
                  />
                )}
              </UnlinkButton>
            </Row>
          </>
        )}
        {!loadingLinkedRepository && !linkedRepository && (
          <>
            <Text style={{ marginTop: 10 }}>
              Link your GitHub repository to start running pipelines on every
              push to your repository.
            </Text>
            {orgs.length > 0 && (
              <Link
                to={`/link-project/${projectId}`}
                style={{
                  color: "#fff",
                }}
              >
                <LinkGithubRepo style={{ marginTop: 25 }}>
                  <div style={{ marginTop: 10 }}>
                    <Github size={22} color={"#fff"} />
                  </div>
                  <div
                    style={{
                      marginLeft: 15,
                      marginTop: 13,
                      fontSize: 15,
                    }}
                  >
                    Link your GitHub Repository
                  </div>
                </LinkGithubRepo>
              </Link>
            )}
            {orgs.length === 0 && (
              <a
                href="https://github.com/apps/fluentci-io/installations/new"
                style={{ color: "#fff" }}
              >
                <LinkGithubRepo style={{ marginTop: 25 }}>
                  <div style={{ marginTop: 10 }}>
                    <Github size={22} color={"#fff"} />
                  </div>
                  <div
                    style={{
                      marginLeft: 15,
                      marginTop: 13,
                      fontSize: 15,
                    }}
                  >
                    Link your GitHub Repository
                  </div>
                </LinkGithubRepo>
              </a>
            )}
          </>
        )}
      </Section>
    </>
  );
};

export default Repository;
