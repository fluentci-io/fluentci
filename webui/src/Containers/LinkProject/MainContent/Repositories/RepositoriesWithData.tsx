import { FC, useEffect, useState } from "react";
import Repositories from "./Repositories";
import { useRecoilState, useRecoilValue } from "recoil";
import { RepositoriesState } from "./RepositoriesState";
import { useNavigate, useParams } from "react-router-dom";
import _ from "lodash";
import {
  useGetRepositoriesQuery,
  useLinkRepositoryMutation,
  useUnlinkRepositoryMutation,
} from "../../../../Hooks/GraphQL";
import { OrganizationsState } from "../Organizations/OrganizationsState";

const RepositoriesWithData: FC = () => {
  const { current } = useRecoilValue(OrganizationsState);
  const [linkRepository] = useLinkRepositoryMutation();
  const [unlinkRepository] = useUnlinkRepositoryMutation();
  const { data, refetch } = useGetRepositoriesQuery({
    variables: {
      provider: "GitHub",
      organization: _.get(current, "0.label", ""),
    },
  });
  const [repos, setRepos] = useRecoilState(RepositoriesState);
  const { id } = useParams();
  const navigate = useNavigate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [all, setAll] = useState<any[]>([]);

  useEffect(() => {
    if (!data) {
      return;
    }
    setRepos(
      data.repositories.map((x) => ({
        id: x.id,
        full_name: x.name,
        private: x.isPrivate,
        linked: x.linked,
      }))
    );
    setAll(
      data.repositories.map((x) => ({
        id: x.id,
        full_name: x.name,
        private: x.isPrivate,
        linked: x.linked,
      }))
    );
  }, [setRepos, data]);

  useEffect(() => {
    refetch({
      provider: "GitHub",
      organization: _.get(current, "0.label", ""),
    });
  }, [current, refetch]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onLink = (value: any) => {
    linkRepository({
      variables: {
        projectId: id!,
        repoName: value.full_name,
      },
    }).then(() => {
      setTimeout(() => {
        navigate(`/project/${id}`);
      }, 1000);
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onUnlink = (value: any) => {
    unlinkRepository({
      variables: {
        repoName: value.full_name,
      },
    }).then(() => {
      refetch({
        provider: "GitHub",
        organization: _.get(current, "0.label", ""),
      });
    });
  };

  const onSearch = (keyword: string) => {
    if (!keyword) {
      setRepos(all);
      return;
    }
    setRepos(
      _.filter(all, _.method("full_name.match", new RegExp(keyword, "i")))
    );
  };

  return (
    <Repositories
      repos={repos}
      onLink={onLink}
      onUnlink={onUnlink}
      onSearch={onSearch}
    />
  );
};

export default RepositoriesWithData;
