/* eslint-disable @typescript-eslint/no-explicit-any */
import { FC } from "react";
import styles, { Button, RepoLink, RepoRow, Tag } from "./styles";
import { Input } from "baseui/input";
import { SearchOutline } from "@styled-icons/evaicons-outline";
import { Globe } from "@styled-icons/entypo";
import { LockAlt } from "@styled-icons/boxicons-regular";
import { Repo } from "@styled-icons/octicons";

export type RepositoriesProps = {
  repos: any[];
  onLink: (repo: any) => void;
  onUnlink: (repo: any) => void;
  onSearch: (value: string) => void;
};

const Repositories: FC<RepositoriesProps> = ({ repos, onLink, onSearch }) => {
  return (
    <>
      <div style={{ marginBottom: 20, width: 300 }}>
        <Input
          placeholder="Search"
          overrides={styles.Input}
          onChange={(e) => onSearch(e.target.value.trim())}
          clearable
          clearOnEscape
          startEnhancer={<SearchOutline size={24} color="#ffffff5a" />}
        />
      </div>

      <RepoRow>
        <div style={{ color: "#8973b1e3", fontWeight: 500, fontSize: 16 }}>
          Repository
        </div>
      </RepoRow>
      {repos.map((item, index) => (
        <RepoRow key={index}>
          <Repo size={18} color="#ffffffae" style={{ marginRight: 15 }} />
          <div style={{ flex: 1, flexDirection: "row", display: "flex" }}>
            <RepoLink
              href={`https://github.com/${item.full_name}`}
              target="blank"
            >
              {item.full_name}
            </RepoLink>
            {!item.private && (
              <Tag>
                <Globe size={12} style={{ marginRight: 5 }} />
                <span>Public</span>
              </Tag>
            )}
            {item.private && (
              <Tag>
                <LockAlt size={14} style={{ marginRight: 5 }} />
                <span>Private</span>
              </Tag>
            )}
          </div>

          <Button onClick={() => onLink(item)}>Link</Button>
        </RepoRow>
      ))}
    </>
  );
};

export default Repositories;
