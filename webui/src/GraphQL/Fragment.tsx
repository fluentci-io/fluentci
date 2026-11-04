import { gql } from "@apollo/client";

export const RunFragment = gql`
  fragment RunFragment on Run {
    id
    branch
    commit
    date
    project
    projectId
    duration
    jobs {
      id
      name
      createdAt
      status
      duration
    }
    message
    name
    title
    cursor
    status
  }
`;

export const ProjectFragment = gql`
  fragment ProjectFragment on Project {
    id
    name
    displayName
    description
    tags
    path
    createdAt
    picture
    speed
    reliability
    buildsPerWeek
    recentRuns {
      ...RunFragment
    }
    isPrivate
    owner
    archived
    repositoryUrl
  }
  ${RunFragment}
`;

export const LogFragment = gql`
  fragment LogFragment on Log {
    id
    message
    createdAt
  }
`;

export const JobFragment = gql`
  fragment JobFragment on Job {
    id
    name
    createdAt
    duration
    status
  }
`;

export const ActionFragment = gql`
  fragment ActionFragment on Action {
    id
    commands
    enabled
    logo
    name
    plugin
    useWasm
    githubUrl
    env
    workingDirectory
  }
`;

export const AccessTokenFragment = gql`
  fragment AccessTokenFragment on AccessToken {
    id
    name
    token
    created
  }
`;

export const RepositoryFragment = gql`
  fragment RepositoryFragment on Repository {
    id
    name
    provider
    repoUrl
    isPrivate
    linked
  }
`;

export const OrganizationFragment = gql`
  fragment OrganizationFragment on Organization {
    id
    name
    createdAt
  }
`;

export const PackageFragment = gql`
  fragment PackageFragment on Package {
    id
    name
    publisher
    description
    version
    owner
    downloads
    repoName
    logoUrl
    githubUrl
    license
    createdAt
    updatedAt
    categories {
      id
      name
      slug
    }
  }
`;
