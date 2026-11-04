import { gql } from '@apollo/client';
import * as Apollo from '@apollo/client';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
const defaultOptions = {} as const;
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
};

export type AccessToken = {
  __typename?: 'AccessToken';
  created: Scalars['String'];
  id: Scalars['ID'];
  name: Scalars['String'];
  token: Scalars['String'];
};

export type Account = {
  __typename?: 'Account';
  company?: Maybe<Scalars['String']>;
  createdAt: Scalars['String'];
  email: Scalars['String'];
  github?: Maybe<Scalars['String']>;
  id: Scalars['ID'];
  name?: Maybe<Scalars['String']>;
  picture?: Maybe<Scalars['String']>;
  username: Scalars['String'];
};

/** An action is a command that is run in a job. */
export type Action = {
  __typename?: 'Action';
  commands: Scalars['String'];
  enabled: Scalars['Boolean'];
  env?: Maybe<Array<Scalars['String']>>;
  githubUrl?: Maybe<Scalars['String']>;
  id?: Maybe<Scalars['ID']>;
  logo?: Maybe<Scalars['String']>;
  name: Scalars['String'];
  plugin: Scalars['String'];
  useWasm: Scalars['Boolean'];
  workingDirectory?: Maybe<Scalars['String']>;
};

export type ActionInput = {
  commands: Scalars['String'];
  enabled: Scalars['Boolean'];
  env?: InputMaybe<Array<Scalars['String']>>;
  githubUrl?: InputMaybe<Scalars['String']>;
  logo?: InputMaybe<Scalars['String']>;
  name: Scalars['String'];
  plugin: Scalars['String'];
  useWasm: Scalars['Boolean'];
  workingDirectory?: InputMaybe<Scalars['String']>;
};

export type Category = {
  __typename?: 'Category';
  id: Scalars['ID'];
  name: Scalars['String'];
  slug: Scalars['String'];
};

/** A job is a task that is run in a project. */
export type Job = {
  __typename?: 'Job';
  createdAt: Scalars['String'];
  duration?: Maybe<Scalars['Int']>;
  id: Scalars['ID'];
  logs?: Maybe<Array<Log>>;
  name: Scalars['String'];
  startedAt?: Maybe<Scalars['String']>;
  status: Scalars['String'];
};

/** A log is a message that is created during a job. */
export type Log = {
  __typename?: 'Log';
  createdAt: Scalars['String'];
  id: Scalars['ID'];
  jobId?: Maybe<Scalars['ID']>;
  message: Scalars['String'];
};

export type Mutation = {
  __typename?: 'Mutation';
  archiveProject?: Maybe<Project>;
  cancelRun?: Maybe<Run>;
  changeProjectVisibility?: Maybe<Project>;
  createAccessToken: AccessToken;
  createOrganization?: Maybe<Organization>;
  createProject: Project;
  deleteAccessToken: Scalars['Boolean'];
  deleteProject: Scalars['Boolean'];
  linkRepository?: Maybe<Repository>;
  runJob: Job;
  runPipeline?: Maybe<Run>;
  saveActions?: Maybe<Array<Action>>;
  starPackage: Package;
  unarchiveProject?: Maybe<Project>;
  unlinkRepository?: Maybe<Repository>;
  unstarPackage: Package;
  updateProject?: Maybe<Project>;
};


export type MutationArchiveProjectArgs = {
  id: Scalars['ID'];
};


export type MutationCancelRunArgs = {
  id?: InputMaybe<Scalars['ID']>;
};


export type MutationChangeProjectVisibilityArgs = {
  id: Scalars['ID'];
  isPublic: Scalars['Boolean'];
};


export type MutationCreateAccessTokenArgs = {
  name: Scalars['String'];
};


export type MutationCreateOrganizationArgs = {
  name: Scalars['String'];
};


export type MutationCreateProjectArgs = {
  fromRepository?: InputMaybe<Scalars['String']>;
};


export type MutationDeleteAccessTokenArgs = {
  id: Scalars['ID'];
};


export type MutationDeleteProjectArgs = {
  id: Scalars['ID'];
};


export type MutationLinkRepositoryArgs = {
  projectId: Scalars['ID'];
  repoName: Scalars['String'];
};


export type MutationRunJobArgs = {
  jobName?: InputMaybe<Scalars['String']>;
  projectId?: InputMaybe<Scalars['ID']>;
};


export type MutationRunPipelineArgs = {
  projectId?: InputMaybe<Scalars['ID']>;
  wait?: InputMaybe<Scalars['Boolean']>;
};


export type MutationSaveActionsArgs = {
  actions: Array<ActionInput>;
  projectId: Scalars['ID'];
};


export type MutationStarPackageArgs = {
  id: Scalars['ID'];
};


export type MutationUnarchiveProjectArgs = {
  id: Scalars['ID'];
};


export type MutationUnlinkRepositoryArgs = {
  repoName: Scalars['String'];
};


export type MutationUnstarPackageArgs = {
  id: Scalars['ID'];
};


export type MutationUpdateProjectArgs = {
  description?: InputMaybe<Scalars['String']>;
  id: Scalars['ID'];
  name?: InputMaybe<Scalars['String']>;
  tags?: InputMaybe<Scalars['String']>;
};

export type Organization = {
  __typename?: 'Organization';
  createdAt: Scalars['String'];
  id: Scalars['ID'];
  name: Scalars['String'];
};

export type Package = {
  __typename?: 'Package';
  avatarUrl?: Maybe<Scalars['String']>;
  categories?: Maybe<Array<Category>>;
  createdAt: Scalars['String'];
  defaultBranch?: Maybe<Scalars['String']>;
  description: Scalars['String'];
  downloads: Scalars['Int'];
  githubUrl?: Maybe<Scalars['String']>;
  homepage?: Maybe<Scalars['String']>;
  id: Scalars['ID'];
  license?: Maybe<Scalars['String']>;
  licenseSpdx?: Maybe<Scalars['String']>;
  licenseUrl?: Maybe<Scalars['String']>;
  logoUrl?: Maybe<Scalars['String']>;
  name: Scalars['String'];
  owner: Scalars['String'];
  publisher?: Maybe<Scalars['String']>;
  readme: Scalars['String'];
  repoName?: Maybe<Scalars['String']>;
  updatedAt: Scalars['String'];
  version: Scalars['String'];
};

/** A project is a collection of projects. */
export type Project = {
  __typename?: 'Project';
  archived?: Maybe<Scalars['Boolean']>;
  buildsPerWeek?: Maybe<Scalars['Int']>;
  createdAt: Scalars['String'];
  cursor?: Maybe<Scalars['String']>;
  description?: Maybe<Scalars['String']>;
  displayName?: Maybe<Scalars['String']>;
  id: Scalars['ID'];
  isPrivate?: Maybe<Scalars['Boolean']>;
  logs?: Maybe<Log>;
  name: Scalars['String'];
  owner?: Maybe<Scalars['String']>;
  path?: Maybe<Scalars['String']>;
  picture: Scalars['String'];
  recentRuns?: Maybe<Array<Run>>;
  reliability?: Maybe<Scalars['Float']>;
  repositoryUrl?: Maybe<Scalars['String']>;
  speed?: Maybe<Scalars['Float']>;
  tags?: Maybe<Array<Scalars['String']>>;
};

export type ProjectFilters = {
  archived?: InputMaybe<Scalars['Boolean']>;
  org?: InputMaybe<Scalars['String']>;
  tags?: InputMaybe<Array<Scalars['String']>>;
  user?: InputMaybe<Scalars['String']>;
};

export type Query = {
  __typename?: 'Query';
  accessTokens: Array<AccessToken>;
  account?: Maybe<Account>;
  actions?: Maybe<Array<Action>>;
  countPackageStars: Scalars['Int'];
  countPackages: Scalars['Int'];
  countProjects: Scalars['Int'];
  countRuns: Scalars['Int'];
  exportActions: Scalars['String'];
  getRun?: Maybe<Run>;
  getRuns?: Maybe<Array<Run>>;
  job?: Maybe<Job>;
  jobs: Array<Job>;
  linkedRepository?: Maybe<Repository>;
  log?: Maybe<Log>;
  logs: Array<Log>;
  me?: Maybe<Account>;
  organizations: Array<Organization>;
  package?: Maybe<Package>;
  packages: Array<Package>;
  project?: Maybe<Project>;
  projects: Array<Project>;
  repositories: Array<Repository>;
  starredPackage: Scalars['Boolean'];
  versions: Array<Version>;
};


export type QueryAccountArgs = {
  github: Scalars['String'];
};


export type QueryActionsArgs = {
  projectId: Scalars['ID'];
};


export type QueryCountPackageStarsArgs = {
  id: Scalars['ID'];
};


export type QueryCountPackagesArgs = {
  all?: InputMaybe<Scalars['Boolean']>;
  category?: InputMaybe<Scalars['String']>;
  filter?: InputMaybe<Scalars['String']>;
};


export type QueryCountRunsArgs = {
  projectId: Scalars['ID'];
};


export type QueryExportActionsArgs = {
  plateform: Scalars['String'];
  projectId: Scalars['ID'];
};


export type QueryGetRunArgs = {
  id: Scalars['ID'];
};


export type QueryGetRunsArgs = {
  cursor?: InputMaybe<Scalars['String']>;
  limit?: InputMaybe<Scalars['Int']>;
  projectId: Scalars['ID'];
  reverse?: InputMaybe<Scalars['Boolean']>;
  skip?: InputMaybe<Scalars['Int']>;
};


export type QueryJobArgs = {
  id?: InputMaybe<Scalars['ID']>;
};


export type QueryLinkedRepositoryArgs = {
  projectId: Scalars['ID'];
};


export type QueryLogsArgs = {
  jobId?: InputMaybe<Scalars['ID']>;
  projectId?: InputMaybe<Scalars['ID']>;
};


export type QueryOrganizationsArgs = {
  provider?: InputMaybe<Scalars['String']>;
};


export type QueryPackageArgs = {
  id: Scalars['ID'];
};


export type QueryPackagesArgs = {
  all?: InputMaybe<Scalars['Boolean']>;
  category?: InputMaybe<Scalars['String']>;
  filter?: InputMaybe<Scalars['String']>;
  orderBy?: InputMaybe<Scalars['String']>;
  skip?: InputMaybe<Scalars['Int']>;
  take?: InputMaybe<Scalars['Int']>;
};


export type QueryProjectArgs = {
  id?: InputMaybe<Scalars['ID']>;
};


export type QueryProjectsArgs = {
  cursor?: InputMaybe<Scalars['String']>;
  filters?: InputMaybe<ProjectFilters>;
  limit?: InputMaybe<Scalars['Int']>;
  reverse?: InputMaybe<Scalars['Boolean']>;
  skip?: InputMaybe<Scalars['Int']>;
};


export type QueryRepositoriesArgs = {
  organization: Scalars['String'];
  provider: Scalars['String'];
};


export type QueryStarredPackageArgs = {
  id: Scalars['ID'];
};


export type QueryVersionsArgs = {
  id: Scalars['String'];
};

export type Repository = {
  __typename?: 'Repository';
  id: Scalars['ID'];
  isPrivate: Scalars['Boolean'];
  linked: Scalars['Boolean'];
  name: Scalars['String'];
  provider: Scalars['String'];
  repoUrl: Scalars['String'];
};

/** A Pipeline execution */
export type Run = {
  __typename?: 'Run';
  author?: Maybe<Scalars['String']>;
  branch?: Maybe<Scalars['String']>;
  commit?: Maybe<Scalars['String']>;
  cursor?: Maybe<Scalars['String']>;
  date: Scalars['String'];
  duration?: Maybe<Scalars['Int']>;
  id: Scalars['ID'];
  jobs: Array<Job>;
  message?: Maybe<Scalars['String']>;
  name: Scalars['String'];
  project: Scalars['String'];
  projectId: Scalars['String'];
  status?: Maybe<Scalars['String']>;
  title: Scalars['String'];
};

export type Version = {
  __typename?: 'Version';
  createdAt: Scalars['String'];
  id: Scalars['ID'];
  packageId: Scalars['Int'];
  version: Scalars['String'];
};

export type CreateAccessTokenMutationVariables = Exact<{
  name: Scalars['String'];
}>;


export type CreateAccessTokenMutation = { __typename?: 'Mutation', createAccessToken: { __typename?: 'AccessToken', id: string, name: string, token: string, created: string } };

export type DeleteAccessTokenMutationVariables = Exact<{
  id: Scalars['ID'];
}>;


export type DeleteAccessTokenMutation = { __typename?: 'Mutation', deleteAccessToken: boolean };

export type GetAccessTokensQueryVariables = Exact<{ [key: string]: never; }>;


export type GetAccessTokensQuery = { __typename?: 'Query', accessTokens: Array<{ __typename?: 'AccessToken', id: string, name: string, token: string, created: string }> };

export type GetMeQueryVariables = Exact<{ [key: string]: never; }>;


export type GetMeQuery = { __typename?: 'Query', me?: { __typename?: 'Account', id: string, username: string, email: string, createdAt: string, github?: string | null, name?: string | null, picture?: string | null } | null };

export type GetAccountQueryVariables = Exact<{
  github: Scalars['String'];
}>;


export type GetAccountQuery = { __typename?: 'Query', account?: { __typename?: 'Account', id: string, username: string, email: string, createdAt: string, github?: string | null, name?: string | null, picture?: string | null, company?: string | null } | null };

export type SaveActionsMutationVariables = Exact<{
  projectId: Scalars['ID'];
  actions: Array<ActionInput> | ActionInput;
}>;


export type SaveActionsMutation = { __typename?: 'Mutation', saveActions?: Array<{ __typename?: 'Action', id?: string | null, commands: string, enabled: boolean, logo?: string | null, name: string, plugin: string, useWasm: boolean, githubUrl?: string | null, env?: Array<string> | null, workingDirectory?: string | null }> | null };

export type GetActionsQueryVariables = Exact<{
  projectId: Scalars['ID'];
}>;


export type GetActionsQuery = { __typename?: 'Query', actions?: Array<{ __typename?: 'Action', id?: string | null, commands: string, enabled: boolean, logo?: string | null, name: string, plugin: string, useWasm: boolean, githubUrl?: string | null, env?: Array<string> | null, workingDirectory?: string | null }> | null };

export type ExportActionsQueryVariables = Exact<{
  projectId: Scalars['ID'];
  plateform: Scalars['String'];
}>;


export type ExportActionsQuery = { __typename?: 'Query', exportActions: string };

export type RunFragmentFragment = { __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> };

export type ProjectFragmentFragment = { __typename?: 'Project', id: string, name: string, displayName?: string | null, description?: string | null, tags?: Array<string> | null, path?: string | null, createdAt: string, picture: string, speed?: number | null, reliability?: number | null, buildsPerWeek?: number | null, isPrivate?: boolean | null, owner?: string | null, archived?: boolean | null, repositoryUrl?: string | null, recentRuns?: Array<{ __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> }> | null };

export type LogFragmentFragment = { __typename?: 'Log', id: string, message: string, createdAt: string };

export type JobFragmentFragment = { __typename?: 'Job', id: string, name: string, createdAt: string, duration?: number | null, status: string };

export type ActionFragmentFragment = { __typename?: 'Action', id?: string | null, commands: string, enabled: boolean, logo?: string | null, name: string, plugin: string, useWasm: boolean, githubUrl?: string | null, env?: Array<string> | null, workingDirectory?: string | null };

export type AccessTokenFragmentFragment = { __typename?: 'AccessToken', id: string, name: string, token: string, created: string };

export type RepositoryFragmentFragment = { __typename?: 'Repository', id: string, name: string, provider: string, repoUrl: string, isPrivate: boolean, linked: boolean };

export type OrganizationFragmentFragment = { __typename?: 'Organization', id: string, name: string, createdAt: string };

export type PackageFragmentFragment = { __typename?: 'Package', id: string, name: string, publisher?: string | null, description: string, version: string, owner: string, downloads: number, repoName?: string | null, logoUrl?: string | null, githubUrl?: string | null, license?: string | null, createdAt: string, updatedAt: string, categories?: Array<{ __typename?: 'Category', id: string, name: string, slug: string }> | null };

export type RunJobMutationVariables = Exact<{
  projectId?: InputMaybe<Scalars['ID']>;
  jobName?: InputMaybe<Scalars['String']>;
}>;


export type RunJobMutation = { __typename?: 'Mutation', runJob: { __typename?: 'Job', id: string, name: string, duration?: number | null, status: string, createdAt: string } };

export type GetJobsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetJobsQuery = { __typename?: 'Query', jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, duration?: number | null, status: string }> };

export type GetJobQueryVariables = Exact<{
  id?: InputMaybe<Scalars['ID']>;
}>;


export type GetJobQuery = { __typename?: 'Query', job?: { __typename?: 'Job', id: string, name: string, status: string, createdAt: string, duration?: number | null, logs?: Array<{ __typename?: 'Log', id: string, message: string, createdAt: string }> | null } | null };

export type GetLogsQueryVariables = Exact<{
  projectId?: InputMaybe<Scalars['ID']>;
  jobId?: InputMaybe<Scalars['ID']>;
}>;


export type GetLogsQuery = { __typename?: 'Query', logs: Array<{ __typename?: 'Log', id: string, message: string, createdAt: string }> };

export type CreateOrganizationMutationVariables = Exact<{
  name: Scalars['String'];
}>;


export type CreateOrganizationMutation = { __typename?: 'Mutation', createOrganization?: { __typename?: 'Organization', id: string, name: string, createdAt: string } | null };

export type GetOrganizationsQueryVariables = Exact<{
  provider: Scalars['String'];
}>;


export type GetOrganizationsQuery = { __typename?: 'Query', organizations: Array<{ __typename?: 'Organization', id: string, name: string, createdAt: string }> };

export type StarPackageMutationVariables = Exact<{
  id: Scalars['ID'];
}>;


export type StarPackageMutation = { __typename?: 'Mutation', starPackage: { __typename?: 'Package', id: string, name: string, publisher?: string | null, description: string, version: string, owner: string, downloads: number, repoName?: string | null, logoUrl?: string | null, githubUrl?: string | null, license?: string | null, createdAt: string, updatedAt: string, categories?: Array<{ __typename?: 'Category', id: string, name: string, slug: string }> | null } };

export type UnstarPackageMutationVariables = Exact<{
  id: Scalars['ID'];
}>;


export type UnstarPackageMutation = { __typename?: 'Mutation', unstarPackage: { __typename?: 'Package', id: string, name: string, publisher?: string | null, description: string, version: string, owner: string, downloads: number, repoName?: string | null, logoUrl?: string | null, githubUrl?: string | null, license?: string | null, createdAt: string, updatedAt: string, categories?: Array<{ __typename?: 'Category', id: string, name: string, slug: string }> | null } };

export type CreateProjectMutationVariables = Exact<{
  fromRepository?: InputMaybe<Scalars['String']>;
}>;


export type CreateProjectMutation = { __typename?: 'Mutation', createProject: { __typename?: 'Project', id: string, name: string, displayName?: string | null, description?: string | null, tags?: Array<string> | null, path?: string | null, createdAt: string, picture: string, speed?: number | null, reliability?: number | null, buildsPerWeek?: number | null, isPrivate?: boolean | null, owner?: string | null, archived?: boolean | null, repositoryUrl?: string | null, recentRuns?: Array<{ __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> }> | null } };

export type UpdateProjectMutationVariables = Exact<{
  id: Scalars['ID'];
  name?: InputMaybe<Scalars['String']>;
  description?: InputMaybe<Scalars['String']>;
  tags?: InputMaybe<Scalars['String']>;
}>;


export type UpdateProjectMutation = { __typename?: 'Mutation', updateProject?: { __typename?: 'Project', id: string, name: string, displayName?: string | null, description?: string | null, tags?: Array<string> | null, path?: string | null, createdAt: string, picture: string, speed?: number | null, reliability?: number | null, buildsPerWeek?: number | null, isPrivate?: boolean | null, owner?: string | null, archived?: boolean | null, repositoryUrl?: string | null, recentRuns?: Array<{ __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> }> | null } | null };

export type DeleteProjectMutationVariables = Exact<{
  id: Scalars['ID'];
}>;


export type DeleteProjectMutation = { __typename?: 'Mutation', deleteProject: boolean };

export type ArchiveProjectMutationVariables = Exact<{
  id: Scalars['ID'];
}>;


export type ArchiveProjectMutation = { __typename?: 'Mutation', archiveProject?: { __typename?: 'Project', id: string, name: string, displayName?: string | null, description?: string | null, tags?: Array<string> | null, path?: string | null, createdAt: string, picture: string, speed?: number | null, reliability?: number | null, buildsPerWeek?: number | null, isPrivate?: boolean | null, owner?: string | null, archived?: boolean | null, repositoryUrl?: string | null, recentRuns?: Array<{ __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> }> | null } | null };

export type UnarchiveProjectMutationVariables = Exact<{
  id: Scalars['ID'];
}>;


export type UnarchiveProjectMutation = { __typename?: 'Mutation', unarchiveProject?: { __typename?: 'Project', id: string, name: string, displayName?: string | null, description?: string | null, tags?: Array<string> | null, path?: string | null, createdAt: string, picture: string, speed?: number | null, reliability?: number | null, buildsPerWeek?: number | null, isPrivate?: boolean | null, owner?: string | null, archived?: boolean | null, repositoryUrl?: string | null, recentRuns?: Array<{ __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> }> | null } | null };

export type ChangeProjectVisibilityMutationVariables = Exact<{
  id: Scalars['ID'];
  isPublic: Scalars['Boolean'];
}>;


export type ChangeProjectVisibilityMutation = { __typename?: 'Mutation', changeProjectVisibility?: { __typename?: 'Project', id: string, name: string, displayName?: string | null, description?: string | null, tags?: Array<string> | null, path?: string | null, createdAt: string, picture: string, speed?: number | null, reliability?: number | null, buildsPerWeek?: number | null, isPrivate?: boolean | null, owner?: string | null, archived?: boolean | null, repositoryUrl?: string | null, recentRuns?: Array<{ __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> }> | null } | null };

export type GetProjectsQueryVariables = Exact<{
  cursor?: InputMaybe<Scalars['String']>;
  limit?: InputMaybe<Scalars['Int']>;
  skip?: InputMaybe<Scalars['Int']>;
  reverse?: InputMaybe<Scalars['Boolean']>;
  filters?: InputMaybe<ProjectFilters>;
}>;


export type GetProjectsQuery = { __typename?: 'Query', projects: Array<{ __typename?: 'Project', id: string, name: string, displayName?: string | null, description?: string | null, tags?: Array<string> | null, path?: string | null, createdAt: string, picture: string, speed?: number | null, reliability?: number | null, buildsPerWeek?: number | null, isPrivate?: boolean | null, owner?: string | null, archived?: boolean | null, repositoryUrl?: string | null, recentRuns?: Array<{ __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> }> | null }> };

export type GetProjectQueryVariables = Exact<{
  id: Scalars['ID'];
}>;


export type GetProjectQuery = { __typename?: 'Query', project?: { __typename?: 'Project', id: string, name: string, displayName?: string | null, description?: string | null, tags?: Array<string> | null, path?: string | null, createdAt: string, picture: string, speed?: number | null, reliability?: number | null, buildsPerWeek?: number | null, isPrivate?: boolean | null, owner?: string | null, archived?: boolean | null, repositoryUrl?: string | null, recentRuns?: Array<{ __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> }> | null } | null };

export type CountProjectsQueryVariables = Exact<{ [key: string]: never; }>;


export type CountProjectsQuery = { __typename?: 'Query', countProjects: number };

export type LinkRepositoryMutationVariables = Exact<{
  projectId: Scalars['ID'];
  repoName: Scalars['String'];
}>;


export type LinkRepositoryMutation = { __typename?: 'Mutation', linkRepository?: { __typename?: 'Repository', id: string, name: string, provider: string, repoUrl: string, isPrivate: boolean, linked: boolean } | null };

export type UnlinkRepositoryMutationVariables = Exact<{
  repoName: Scalars['String'];
}>;


export type UnlinkRepositoryMutation = { __typename?: 'Mutation', unlinkRepository?: { __typename?: 'Repository', id: string, name: string, provider: string, repoUrl: string, isPrivate: boolean, linked: boolean } | null };

export type GetRepositoriesQueryVariables = Exact<{
  provider: Scalars['String'];
  organization: Scalars['String'];
}>;


export type GetRepositoriesQuery = { __typename?: 'Query', repositories: Array<{ __typename?: 'Repository', id: string, name: string, provider: string, repoUrl: string, isPrivate: boolean, linked: boolean }> };

export type GetLinkedRepositoryQueryVariables = Exact<{
  projectId: Scalars['ID'];
}>;


export type GetLinkedRepositoryQuery = { __typename?: 'Query', linkedRepository?: { __typename?: 'Repository', id: string, name: string, provider: string, repoUrl: string, isPrivate: boolean, linked: boolean } | null };

export type RunPipelineMutationVariables = Exact<{
  projectId: Scalars['ID'];
}>;


export type RunPipelineMutation = { __typename?: 'Mutation', runPipeline?: { __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> } | null };

export type CancelRunMutationVariables = Exact<{
  id: Scalars['ID'];
}>;


export type CancelRunMutation = { __typename?: 'Mutation', cancelRun?: { __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> } | null };

export type GetRunQueryVariables = Exact<{
  id: Scalars['ID'];
}>;


export type GetRunQuery = { __typename?: 'Query', getRun?: { __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null, startedAt?: string | null, logs?: Array<{ __typename?: 'Log', id: string, message: string, createdAt: string }> | null }> } | null };

export type GetRunsQueryVariables = Exact<{
  projectId: Scalars['ID'];
  cursor?: InputMaybe<Scalars['String']>;
  limit?: InputMaybe<Scalars['Int']>;
  skip?: InputMaybe<Scalars['Int']>;
}>;


export type GetRunsQuery = { __typename?: 'Query', getRuns?: Array<{ __typename?: 'Run', id: string, branch?: string | null, commit?: string | null, date: string, project: string, projectId: string, duration?: number | null, message?: string | null, name: string, title: string, cursor?: string | null, status?: string | null, jobs: Array<{ __typename?: 'Job', id: string, name: string, createdAt: string, status: string, duration?: number | null }> }> | null };

export type CountRunsQueryVariables = Exact<{
  projectId: Scalars['ID'];
}>;


export type CountRunsQuery = { __typename?: 'Query', countRuns: number };

export const RunFragmentFragmentDoc = gql`
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
export const ProjectFragmentFragmentDoc = gql`
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
    ${RunFragmentFragmentDoc}`;
export const LogFragmentFragmentDoc = gql`
    fragment LogFragment on Log {
  id
  message
  createdAt
}
    `;
export const JobFragmentFragmentDoc = gql`
    fragment JobFragment on Job {
  id
  name
  createdAt
  duration
  status
}
    `;
export const ActionFragmentFragmentDoc = gql`
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
export const AccessTokenFragmentFragmentDoc = gql`
    fragment AccessTokenFragment on AccessToken {
  id
  name
  token
  created
}
    `;
export const RepositoryFragmentFragmentDoc = gql`
    fragment RepositoryFragment on Repository {
  id
  name
  provider
  repoUrl
  isPrivate
  linked
}
    `;
export const OrganizationFragmentFragmentDoc = gql`
    fragment OrganizationFragment on Organization {
  id
  name
  createdAt
}
    `;
export const PackageFragmentFragmentDoc = gql`
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
export const CreateAccessTokenDocument = gql`
    mutation CreateAccessToken($name: String!) {
  createAccessToken(name: $name) {
    ...AccessTokenFragment
  }
}
    ${AccessTokenFragmentFragmentDoc}`;
export type CreateAccessTokenMutationFn = Apollo.MutationFunction<CreateAccessTokenMutation, CreateAccessTokenMutationVariables>;

/**
 * __useCreateAccessTokenMutation__
 *
 * To run a mutation, you first call `useCreateAccessTokenMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateAccessTokenMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createAccessTokenMutation, { data, loading, error }] = useCreateAccessTokenMutation({
 *   variables: {
 *      name: // value for 'name'
 *   },
 * });
 */
export function useCreateAccessTokenMutation(baseOptions?: Apollo.MutationHookOptions<CreateAccessTokenMutation, CreateAccessTokenMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateAccessTokenMutation, CreateAccessTokenMutationVariables>(CreateAccessTokenDocument, options);
      }
export type CreateAccessTokenMutationHookResult = ReturnType<typeof useCreateAccessTokenMutation>;
export type CreateAccessTokenMutationResult = Apollo.MutationResult<CreateAccessTokenMutation>;
export type CreateAccessTokenMutationOptions = Apollo.BaseMutationOptions<CreateAccessTokenMutation, CreateAccessTokenMutationVariables>;
export const DeleteAccessTokenDocument = gql`
    mutation DeleteAccessToken($id: ID!) {
  deleteAccessToken(id: $id)
}
    `;
export type DeleteAccessTokenMutationFn = Apollo.MutationFunction<DeleteAccessTokenMutation, DeleteAccessTokenMutationVariables>;

/**
 * __useDeleteAccessTokenMutation__
 *
 * To run a mutation, you first call `useDeleteAccessTokenMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteAccessTokenMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteAccessTokenMutation, { data, loading, error }] = useDeleteAccessTokenMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteAccessTokenMutation(baseOptions?: Apollo.MutationHookOptions<DeleteAccessTokenMutation, DeleteAccessTokenMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteAccessTokenMutation, DeleteAccessTokenMutationVariables>(DeleteAccessTokenDocument, options);
      }
export type DeleteAccessTokenMutationHookResult = ReturnType<typeof useDeleteAccessTokenMutation>;
export type DeleteAccessTokenMutationResult = Apollo.MutationResult<DeleteAccessTokenMutation>;
export type DeleteAccessTokenMutationOptions = Apollo.BaseMutationOptions<DeleteAccessTokenMutation, DeleteAccessTokenMutationVariables>;
export const GetAccessTokensDocument = gql`
    query GetAccessTokens {
  accessTokens {
    id
    name
    token
    created
  }
}
    `;

/**
 * __useGetAccessTokensQuery__
 *
 * To run a query within a React component, call `useGetAccessTokensQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAccessTokensQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAccessTokensQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetAccessTokensQuery(baseOptions?: Apollo.QueryHookOptions<GetAccessTokensQuery, GetAccessTokensQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetAccessTokensQuery, GetAccessTokensQueryVariables>(GetAccessTokensDocument, options);
      }
export function useGetAccessTokensLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetAccessTokensQuery, GetAccessTokensQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetAccessTokensQuery, GetAccessTokensQueryVariables>(GetAccessTokensDocument, options);
        }
export type GetAccessTokensQueryHookResult = ReturnType<typeof useGetAccessTokensQuery>;
export type GetAccessTokensLazyQueryHookResult = ReturnType<typeof useGetAccessTokensLazyQuery>;
export type GetAccessTokensQueryResult = Apollo.QueryResult<GetAccessTokensQuery, GetAccessTokensQueryVariables>;
export const GetMeDocument = gql`
    query GetMe {
  me {
    id
    username
    email
    createdAt
    github
    name
    picture
  }
}
    `;

/**
 * __useGetMeQuery__
 *
 * To run a query within a React component, call `useGetMeQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetMeQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetMeQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetMeQuery(baseOptions?: Apollo.QueryHookOptions<GetMeQuery, GetMeQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetMeQuery, GetMeQueryVariables>(GetMeDocument, options);
      }
export function useGetMeLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetMeQuery, GetMeQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetMeQuery, GetMeQueryVariables>(GetMeDocument, options);
        }
export type GetMeQueryHookResult = ReturnType<typeof useGetMeQuery>;
export type GetMeLazyQueryHookResult = ReturnType<typeof useGetMeLazyQuery>;
export type GetMeQueryResult = Apollo.QueryResult<GetMeQuery, GetMeQueryVariables>;
export const GetAccountDocument = gql`
    query GetAccount($github: String!) {
  account(github: $github) {
    id
    username
    email
    createdAt
    github
    name
    picture
    company
  }
}
    `;

/**
 * __useGetAccountQuery__
 *
 * To run a query within a React component, call `useGetAccountQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetAccountQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetAccountQuery({
 *   variables: {
 *      github: // value for 'github'
 *   },
 * });
 */
export function useGetAccountQuery(baseOptions: Apollo.QueryHookOptions<GetAccountQuery, GetAccountQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetAccountQuery, GetAccountQueryVariables>(GetAccountDocument, options);
      }
export function useGetAccountLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetAccountQuery, GetAccountQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetAccountQuery, GetAccountQueryVariables>(GetAccountDocument, options);
        }
export type GetAccountQueryHookResult = ReturnType<typeof useGetAccountQuery>;
export type GetAccountLazyQueryHookResult = ReturnType<typeof useGetAccountLazyQuery>;
export type GetAccountQueryResult = Apollo.QueryResult<GetAccountQuery, GetAccountQueryVariables>;
export const SaveActionsDocument = gql`
    mutation SaveActions($projectId: ID!, $actions: [ActionInput!]!) {
  saveActions(projectId: $projectId, actions: $actions) {
    ...ActionFragment
  }
}
    ${ActionFragmentFragmentDoc}`;
export type SaveActionsMutationFn = Apollo.MutationFunction<SaveActionsMutation, SaveActionsMutationVariables>;

/**
 * __useSaveActionsMutation__
 *
 * To run a mutation, you first call `useSaveActionsMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useSaveActionsMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [saveActionsMutation, { data, loading, error }] = useSaveActionsMutation({
 *   variables: {
 *      projectId: // value for 'projectId'
 *      actions: // value for 'actions'
 *   },
 * });
 */
export function useSaveActionsMutation(baseOptions?: Apollo.MutationHookOptions<SaveActionsMutation, SaveActionsMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<SaveActionsMutation, SaveActionsMutationVariables>(SaveActionsDocument, options);
      }
export type SaveActionsMutationHookResult = ReturnType<typeof useSaveActionsMutation>;
export type SaveActionsMutationResult = Apollo.MutationResult<SaveActionsMutation>;
export type SaveActionsMutationOptions = Apollo.BaseMutationOptions<SaveActionsMutation, SaveActionsMutationVariables>;
export const GetActionsDocument = gql`
    query GetActions($projectId: ID!) {
  actions(projectId: $projectId) {
    ...ActionFragment
  }
}
    ${ActionFragmentFragmentDoc}`;

/**
 * __useGetActionsQuery__
 *
 * To run a query within a React component, call `useGetActionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetActionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetActionsQuery({
 *   variables: {
 *      projectId: // value for 'projectId'
 *   },
 * });
 */
export function useGetActionsQuery(baseOptions: Apollo.QueryHookOptions<GetActionsQuery, GetActionsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetActionsQuery, GetActionsQueryVariables>(GetActionsDocument, options);
      }
export function useGetActionsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetActionsQuery, GetActionsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetActionsQuery, GetActionsQueryVariables>(GetActionsDocument, options);
        }
export type GetActionsQueryHookResult = ReturnType<typeof useGetActionsQuery>;
export type GetActionsLazyQueryHookResult = ReturnType<typeof useGetActionsLazyQuery>;
export type GetActionsQueryResult = Apollo.QueryResult<GetActionsQuery, GetActionsQueryVariables>;
export const ExportActionsDocument = gql`
    query ExportActions($projectId: ID!, $plateform: String!) {
  exportActions(projectId: $projectId, plateform: $plateform)
}
    `;

/**
 * __useExportActionsQuery__
 *
 * To run a query within a React component, call `useExportActionsQuery` and pass it any options that fit your needs.
 * When your component renders, `useExportActionsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useExportActionsQuery({
 *   variables: {
 *      projectId: // value for 'projectId'
 *      plateform: // value for 'plateform'
 *   },
 * });
 */
export function useExportActionsQuery(baseOptions: Apollo.QueryHookOptions<ExportActionsQuery, ExportActionsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<ExportActionsQuery, ExportActionsQueryVariables>(ExportActionsDocument, options);
      }
export function useExportActionsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<ExportActionsQuery, ExportActionsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<ExportActionsQuery, ExportActionsQueryVariables>(ExportActionsDocument, options);
        }
export type ExportActionsQueryHookResult = ReturnType<typeof useExportActionsQuery>;
export type ExportActionsLazyQueryHookResult = ReturnType<typeof useExportActionsLazyQuery>;
export type ExportActionsQueryResult = Apollo.QueryResult<ExportActionsQuery, ExportActionsQueryVariables>;
export const RunJobDocument = gql`
    mutation RunJob($projectId: ID, $jobName: String) {
  runJob(projectId: $projectId, jobName: $jobName) {
    id
    name
    duration
    status
    createdAt
  }
}
    `;
export type RunJobMutationFn = Apollo.MutationFunction<RunJobMutation, RunJobMutationVariables>;

/**
 * __useRunJobMutation__
 *
 * To run a mutation, you first call `useRunJobMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRunJobMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [runJobMutation, { data, loading, error }] = useRunJobMutation({
 *   variables: {
 *      projectId: // value for 'projectId'
 *      jobName: // value for 'jobName'
 *   },
 * });
 */
export function useRunJobMutation(baseOptions?: Apollo.MutationHookOptions<RunJobMutation, RunJobMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RunJobMutation, RunJobMutationVariables>(RunJobDocument, options);
      }
export type RunJobMutationHookResult = ReturnType<typeof useRunJobMutation>;
export type RunJobMutationResult = Apollo.MutationResult<RunJobMutation>;
export type RunJobMutationOptions = Apollo.BaseMutationOptions<RunJobMutation, RunJobMutationVariables>;
export const GetJobsDocument = gql`
    query GetJobs {
  jobs {
    ...JobFragment
  }
}
    ${JobFragmentFragmentDoc}`;

/**
 * __useGetJobsQuery__
 *
 * To run a query within a React component, call `useGetJobsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetJobsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetJobsQuery({
 *   variables: {
 *   },
 * });
 */
export function useGetJobsQuery(baseOptions?: Apollo.QueryHookOptions<GetJobsQuery, GetJobsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetJobsQuery, GetJobsQueryVariables>(GetJobsDocument, options);
      }
export function useGetJobsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetJobsQuery, GetJobsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetJobsQuery, GetJobsQueryVariables>(GetJobsDocument, options);
        }
export type GetJobsQueryHookResult = ReturnType<typeof useGetJobsQuery>;
export type GetJobsLazyQueryHookResult = ReturnType<typeof useGetJobsLazyQuery>;
export type GetJobsQueryResult = Apollo.QueryResult<GetJobsQuery, GetJobsQueryVariables>;
export const GetJobDocument = gql`
    query GetJob($id: ID) {
  job(id: $id) {
    id
    name
    status
    createdAt
    duration
    logs {
      id
      message
      createdAt
    }
  }
}
    `;

/**
 * __useGetJobQuery__
 *
 * To run a query within a React component, call `useGetJobQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetJobQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetJobQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetJobQuery(baseOptions?: Apollo.QueryHookOptions<GetJobQuery, GetJobQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetJobQuery, GetJobQueryVariables>(GetJobDocument, options);
      }
export function useGetJobLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetJobQuery, GetJobQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetJobQuery, GetJobQueryVariables>(GetJobDocument, options);
        }
export type GetJobQueryHookResult = ReturnType<typeof useGetJobQuery>;
export type GetJobLazyQueryHookResult = ReturnType<typeof useGetJobLazyQuery>;
export type GetJobQueryResult = Apollo.QueryResult<GetJobQuery, GetJobQueryVariables>;
export const GetLogsDocument = gql`
    query GetLogs($projectId: ID, $jobId: ID) {
  logs(projectId: $projectId, jobId: $jobId) {
    ...LogFragment
  }
}
    ${LogFragmentFragmentDoc}`;

/**
 * __useGetLogsQuery__
 *
 * To run a query within a React component, call `useGetLogsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLogsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLogsQuery({
 *   variables: {
 *      projectId: // value for 'projectId'
 *      jobId: // value for 'jobId'
 *   },
 * });
 */
export function useGetLogsQuery(baseOptions?: Apollo.QueryHookOptions<GetLogsQuery, GetLogsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetLogsQuery, GetLogsQueryVariables>(GetLogsDocument, options);
      }
export function useGetLogsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetLogsQuery, GetLogsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetLogsQuery, GetLogsQueryVariables>(GetLogsDocument, options);
        }
export type GetLogsQueryHookResult = ReturnType<typeof useGetLogsQuery>;
export type GetLogsLazyQueryHookResult = ReturnType<typeof useGetLogsLazyQuery>;
export type GetLogsQueryResult = Apollo.QueryResult<GetLogsQuery, GetLogsQueryVariables>;
export const CreateOrganizationDocument = gql`
    mutation CreateOrganization($name: String!) {
  createOrganization(name: $name) {
    ...OrganizationFragment
  }
}
    ${OrganizationFragmentFragmentDoc}`;
export type CreateOrganizationMutationFn = Apollo.MutationFunction<CreateOrganizationMutation, CreateOrganizationMutationVariables>;

/**
 * __useCreateOrganizationMutation__
 *
 * To run a mutation, you first call `useCreateOrganizationMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateOrganizationMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createOrganizationMutation, { data, loading, error }] = useCreateOrganizationMutation({
 *   variables: {
 *      name: // value for 'name'
 *   },
 * });
 */
export function useCreateOrganizationMutation(baseOptions?: Apollo.MutationHookOptions<CreateOrganizationMutation, CreateOrganizationMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateOrganizationMutation, CreateOrganizationMutationVariables>(CreateOrganizationDocument, options);
      }
export type CreateOrganizationMutationHookResult = ReturnType<typeof useCreateOrganizationMutation>;
export type CreateOrganizationMutationResult = Apollo.MutationResult<CreateOrganizationMutation>;
export type CreateOrganizationMutationOptions = Apollo.BaseMutationOptions<CreateOrganizationMutation, CreateOrganizationMutationVariables>;
export const GetOrganizationsDocument = gql`
    query GetOrganizations($provider: String!) {
  organizations(provider: $provider) {
    ...OrganizationFragment
  }
}
    ${OrganizationFragmentFragmentDoc}`;

/**
 * __useGetOrganizationsQuery__
 *
 * To run a query within a React component, call `useGetOrganizationsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetOrganizationsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetOrganizationsQuery({
 *   variables: {
 *      provider: // value for 'provider'
 *   },
 * });
 */
export function useGetOrganizationsQuery(baseOptions: Apollo.QueryHookOptions<GetOrganizationsQuery, GetOrganizationsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetOrganizationsQuery, GetOrganizationsQueryVariables>(GetOrganizationsDocument, options);
      }
export function useGetOrganizationsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetOrganizationsQuery, GetOrganizationsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetOrganizationsQuery, GetOrganizationsQueryVariables>(GetOrganizationsDocument, options);
        }
export type GetOrganizationsQueryHookResult = ReturnType<typeof useGetOrganizationsQuery>;
export type GetOrganizationsLazyQueryHookResult = ReturnType<typeof useGetOrganizationsLazyQuery>;
export type GetOrganizationsQueryResult = Apollo.QueryResult<GetOrganizationsQuery, GetOrganizationsQueryVariables>;
export const StarPackageDocument = gql`
    mutation StarPackage($id: ID!) {
  starPackage(id: $id) {
    ...PackageFragment
  }
}
    ${PackageFragmentFragmentDoc}`;
export type StarPackageMutationFn = Apollo.MutationFunction<StarPackageMutation, StarPackageMutationVariables>;

/**
 * __useStarPackageMutation__
 *
 * To run a mutation, you first call `useStarPackageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useStarPackageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [starPackageMutation, { data, loading, error }] = useStarPackageMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useStarPackageMutation(baseOptions?: Apollo.MutationHookOptions<StarPackageMutation, StarPackageMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<StarPackageMutation, StarPackageMutationVariables>(StarPackageDocument, options);
      }
export type StarPackageMutationHookResult = ReturnType<typeof useStarPackageMutation>;
export type StarPackageMutationResult = Apollo.MutationResult<StarPackageMutation>;
export type StarPackageMutationOptions = Apollo.BaseMutationOptions<StarPackageMutation, StarPackageMutationVariables>;
export const UnstarPackageDocument = gql`
    mutation UnstarPackage($id: ID!) {
  unstarPackage(id: $id) {
    ...PackageFragment
  }
}
    ${PackageFragmentFragmentDoc}`;
export type UnstarPackageMutationFn = Apollo.MutationFunction<UnstarPackageMutation, UnstarPackageMutationVariables>;

/**
 * __useUnstarPackageMutation__
 *
 * To run a mutation, you first call `useUnstarPackageMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUnstarPackageMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [unstarPackageMutation, { data, loading, error }] = useUnstarPackageMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useUnstarPackageMutation(baseOptions?: Apollo.MutationHookOptions<UnstarPackageMutation, UnstarPackageMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UnstarPackageMutation, UnstarPackageMutationVariables>(UnstarPackageDocument, options);
      }
export type UnstarPackageMutationHookResult = ReturnType<typeof useUnstarPackageMutation>;
export type UnstarPackageMutationResult = Apollo.MutationResult<UnstarPackageMutation>;
export type UnstarPackageMutationOptions = Apollo.BaseMutationOptions<UnstarPackageMutation, UnstarPackageMutationVariables>;
export const CreateProjectDocument = gql`
    mutation CreateProject($fromRepository: String) {
  createProject(fromRepository: $fromRepository) {
    ...ProjectFragment
  }
}
    ${ProjectFragmentFragmentDoc}`;
export type CreateProjectMutationFn = Apollo.MutationFunction<CreateProjectMutation, CreateProjectMutationVariables>;

/**
 * __useCreateProjectMutation__
 *
 * To run a mutation, you first call `useCreateProjectMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCreateProjectMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [createProjectMutation, { data, loading, error }] = useCreateProjectMutation({
 *   variables: {
 *      fromRepository: // value for 'fromRepository'
 *   },
 * });
 */
export function useCreateProjectMutation(baseOptions?: Apollo.MutationHookOptions<CreateProjectMutation, CreateProjectMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CreateProjectMutation, CreateProjectMutationVariables>(CreateProjectDocument, options);
      }
export type CreateProjectMutationHookResult = ReturnType<typeof useCreateProjectMutation>;
export type CreateProjectMutationResult = Apollo.MutationResult<CreateProjectMutation>;
export type CreateProjectMutationOptions = Apollo.BaseMutationOptions<CreateProjectMutation, CreateProjectMutationVariables>;
export const UpdateProjectDocument = gql`
    mutation UpdateProject($id: ID!, $name: String, $description: String, $tags: String) {
  updateProject(id: $id, name: $name, description: $description, tags: $tags) {
    ...ProjectFragment
  }
}
    ${ProjectFragmentFragmentDoc}`;
export type UpdateProjectMutationFn = Apollo.MutationFunction<UpdateProjectMutation, UpdateProjectMutationVariables>;

/**
 * __useUpdateProjectMutation__
 *
 * To run a mutation, you first call `useUpdateProjectMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUpdateProjectMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [updateProjectMutation, { data, loading, error }] = useUpdateProjectMutation({
 *   variables: {
 *      id: // value for 'id'
 *      name: // value for 'name'
 *      description: // value for 'description'
 *      tags: // value for 'tags'
 *   },
 * });
 */
export function useUpdateProjectMutation(baseOptions?: Apollo.MutationHookOptions<UpdateProjectMutation, UpdateProjectMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UpdateProjectMutation, UpdateProjectMutationVariables>(UpdateProjectDocument, options);
      }
export type UpdateProjectMutationHookResult = ReturnType<typeof useUpdateProjectMutation>;
export type UpdateProjectMutationResult = Apollo.MutationResult<UpdateProjectMutation>;
export type UpdateProjectMutationOptions = Apollo.BaseMutationOptions<UpdateProjectMutation, UpdateProjectMutationVariables>;
export const DeleteProjectDocument = gql`
    mutation DeleteProject($id: ID!) {
  deleteProject(id: $id)
}
    `;
export type DeleteProjectMutationFn = Apollo.MutationFunction<DeleteProjectMutation, DeleteProjectMutationVariables>;

/**
 * __useDeleteProjectMutation__
 *
 * To run a mutation, you first call `useDeleteProjectMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useDeleteProjectMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [deleteProjectMutation, { data, loading, error }] = useDeleteProjectMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useDeleteProjectMutation(baseOptions?: Apollo.MutationHookOptions<DeleteProjectMutation, DeleteProjectMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<DeleteProjectMutation, DeleteProjectMutationVariables>(DeleteProjectDocument, options);
      }
export type DeleteProjectMutationHookResult = ReturnType<typeof useDeleteProjectMutation>;
export type DeleteProjectMutationResult = Apollo.MutationResult<DeleteProjectMutation>;
export type DeleteProjectMutationOptions = Apollo.BaseMutationOptions<DeleteProjectMutation, DeleteProjectMutationVariables>;
export const ArchiveProjectDocument = gql`
    mutation ArchiveProject($id: ID!) {
  archiveProject(id: $id) {
    ...ProjectFragment
  }
}
    ${ProjectFragmentFragmentDoc}`;
export type ArchiveProjectMutationFn = Apollo.MutationFunction<ArchiveProjectMutation, ArchiveProjectMutationVariables>;

/**
 * __useArchiveProjectMutation__
 *
 * To run a mutation, you first call `useArchiveProjectMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useArchiveProjectMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [archiveProjectMutation, { data, loading, error }] = useArchiveProjectMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useArchiveProjectMutation(baseOptions?: Apollo.MutationHookOptions<ArchiveProjectMutation, ArchiveProjectMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ArchiveProjectMutation, ArchiveProjectMutationVariables>(ArchiveProjectDocument, options);
      }
export type ArchiveProjectMutationHookResult = ReturnType<typeof useArchiveProjectMutation>;
export type ArchiveProjectMutationResult = Apollo.MutationResult<ArchiveProjectMutation>;
export type ArchiveProjectMutationOptions = Apollo.BaseMutationOptions<ArchiveProjectMutation, ArchiveProjectMutationVariables>;
export const UnarchiveProjectDocument = gql`
    mutation UnarchiveProject($id: ID!) {
  unarchiveProject(id: $id) {
    ...ProjectFragment
  }
}
    ${ProjectFragmentFragmentDoc}`;
export type UnarchiveProjectMutationFn = Apollo.MutationFunction<UnarchiveProjectMutation, UnarchiveProjectMutationVariables>;

/**
 * __useUnarchiveProjectMutation__
 *
 * To run a mutation, you first call `useUnarchiveProjectMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUnarchiveProjectMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [unarchiveProjectMutation, { data, loading, error }] = useUnarchiveProjectMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useUnarchiveProjectMutation(baseOptions?: Apollo.MutationHookOptions<UnarchiveProjectMutation, UnarchiveProjectMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UnarchiveProjectMutation, UnarchiveProjectMutationVariables>(UnarchiveProjectDocument, options);
      }
export type UnarchiveProjectMutationHookResult = ReturnType<typeof useUnarchiveProjectMutation>;
export type UnarchiveProjectMutationResult = Apollo.MutationResult<UnarchiveProjectMutation>;
export type UnarchiveProjectMutationOptions = Apollo.BaseMutationOptions<UnarchiveProjectMutation, UnarchiveProjectMutationVariables>;
export const ChangeProjectVisibilityDocument = gql`
    mutation ChangeProjectVisibility($id: ID!, $isPublic: Boolean!) {
  changeProjectVisibility(id: $id, isPublic: $isPublic) {
    ...ProjectFragment
  }
}
    ${ProjectFragmentFragmentDoc}`;
export type ChangeProjectVisibilityMutationFn = Apollo.MutationFunction<ChangeProjectVisibilityMutation, ChangeProjectVisibilityMutationVariables>;

/**
 * __useChangeProjectVisibilityMutation__
 *
 * To run a mutation, you first call `useChangeProjectVisibilityMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useChangeProjectVisibilityMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [changeProjectVisibilityMutation, { data, loading, error }] = useChangeProjectVisibilityMutation({
 *   variables: {
 *      id: // value for 'id'
 *      isPublic: // value for 'isPublic'
 *   },
 * });
 */
export function useChangeProjectVisibilityMutation(baseOptions?: Apollo.MutationHookOptions<ChangeProjectVisibilityMutation, ChangeProjectVisibilityMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<ChangeProjectVisibilityMutation, ChangeProjectVisibilityMutationVariables>(ChangeProjectVisibilityDocument, options);
      }
export type ChangeProjectVisibilityMutationHookResult = ReturnType<typeof useChangeProjectVisibilityMutation>;
export type ChangeProjectVisibilityMutationResult = Apollo.MutationResult<ChangeProjectVisibilityMutation>;
export type ChangeProjectVisibilityMutationOptions = Apollo.BaseMutationOptions<ChangeProjectVisibilityMutation, ChangeProjectVisibilityMutationVariables>;
export const GetProjectsDocument = gql`
    query GetProjects($cursor: String, $limit: Int, $skip: Int, $reverse: Boolean, $filters: ProjectFilters) {
  projects(
    cursor: $cursor
    limit: $limit
    skip: $skip
    reverse: $reverse
    filters: $filters
  ) {
    ...ProjectFragment
  }
}
    ${ProjectFragmentFragmentDoc}`;

/**
 * __useGetProjectsQuery__
 *
 * To run a query within a React component, call `useGetProjectsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProjectsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProjectsQuery({
 *   variables: {
 *      cursor: // value for 'cursor'
 *      limit: // value for 'limit'
 *      skip: // value for 'skip'
 *      reverse: // value for 'reverse'
 *      filters: // value for 'filters'
 *   },
 * });
 */
export function useGetProjectsQuery(baseOptions?: Apollo.QueryHookOptions<GetProjectsQuery, GetProjectsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProjectsQuery, GetProjectsQueryVariables>(GetProjectsDocument, options);
      }
export function useGetProjectsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProjectsQuery, GetProjectsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProjectsQuery, GetProjectsQueryVariables>(GetProjectsDocument, options);
        }
export type GetProjectsQueryHookResult = ReturnType<typeof useGetProjectsQuery>;
export type GetProjectsLazyQueryHookResult = ReturnType<typeof useGetProjectsLazyQuery>;
export type GetProjectsQueryResult = Apollo.QueryResult<GetProjectsQuery, GetProjectsQueryVariables>;
export const GetProjectDocument = gql`
    query GetProject($id: ID!) {
  project(id: $id) {
    ...ProjectFragment
  }
}
    ${ProjectFragmentFragmentDoc}`;

/**
 * __useGetProjectQuery__
 *
 * To run a query within a React component, call `useGetProjectQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetProjectQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetProjectQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetProjectQuery(baseOptions: Apollo.QueryHookOptions<GetProjectQuery, GetProjectQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetProjectQuery, GetProjectQueryVariables>(GetProjectDocument, options);
      }
export function useGetProjectLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetProjectQuery, GetProjectQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetProjectQuery, GetProjectQueryVariables>(GetProjectDocument, options);
        }
export type GetProjectQueryHookResult = ReturnType<typeof useGetProjectQuery>;
export type GetProjectLazyQueryHookResult = ReturnType<typeof useGetProjectLazyQuery>;
export type GetProjectQueryResult = Apollo.QueryResult<GetProjectQuery, GetProjectQueryVariables>;
export const CountProjectsDocument = gql`
    query CountProjects {
  countProjects
}
    `;

/**
 * __useCountProjectsQuery__
 *
 * To run a query within a React component, call `useCountProjectsQuery` and pass it any options that fit your needs.
 * When your component renders, `useCountProjectsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useCountProjectsQuery({
 *   variables: {
 *   },
 * });
 */
export function useCountProjectsQuery(baseOptions?: Apollo.QueryHookOptions<CountProjectsQuery, CountProjectsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<CountProjectsQuery, CountProjectsQueryVariables>(CountProjectsDocument, options);
      }
export function useCountProjectsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<CountProjectsQuery, CountProjectsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<CountProjectsQuery, CountProjectsQueryVariables>(CountProjectsDocument, options);
        }
export type CountProjectsQueryHookResult = ReturnType<typeof useCountProjectsQuery>;
export type CountProjectsLazyQueryHookResult = ReturnType<typeof useCountProjectsLazyQuery>;
export type CountProjectsQueryResult = Apollo.QueryResult<CountProjectsQuery, CountProjectsQueryVariables>;
export const LinkRepositoryDocument = gql`
    mutation LinkRepository($projectId: ID!, $repoName: String!) {
  linkRepository(projectId: $projectId, repoName: $repoName) {
    ...RepositoryFragment
  }
}
    ${RepositoryFragmentFragmentDoc}`;
export type LinkRepositoryMutationFn = Apollo.MutationFunction<LinkRepositoryMutation, LinkRepositoryMutationVariables>;

/**
 * __useLinkRepositoryMutation__
 *
 * To run a mutation, you first call `useLinkRepositoryMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useLinkRepositoryMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [linkRepositoryMutation, { data, loading, error }] = useLinkRepositoryMutation({
 *   variables: {
 *      projectId: // value for 'projectId'
 *      repoName: // value for 'repoName'
 *   },
 * });
 */
export function useLinkRepositoryMutation(baseOptions?: Apollo.MutationHookOptions<LinkRepositoryMutation, LinkRepositoryMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<LinkRepositoryMutation, LinkRepositoryMutationVariables>(LinkRepositoryDocument, options);
      }
export type LinkRepositoryMutationHookResult = ReturnType<typeof useLinkRepositoryMutation>;
export type LinkRepositoryMutationResult = Apollo.MutationResult<LinkRepositoryMutation>;
export type LinkRepositoryMutationOptions = Apollo.BaseMutationOptions<LinkRepositoryMutation, LinkRepositoryMutationVariables>;
export const UnlinkRepositoryDocument = gql`
    mutation UnlinkRepository($repoName: String!) {
  unlinkRepository(repoName: $repoName) {
    ...RepositoryFragment
  }
}
    ${RepositoryFragmentFragmentDoc}`;
export type UnlinkRepositoryMutationFn = Apollo.MutationFunction<UnlinkRepositoryMutation, UnlinkRepositoryMutationVariables>;

/**
 * __useUnlinkRepositoryMutation__
 *
 * To run a mutation, you first call `useUnlinkRepositoryMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useUnlinkRepositoryMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [unlinkRepositoryMutation, { data, loading, error }] = useUnlinkRepositoryMutation({
 *   variables: {
 *      repoName: // value for 'repoName'
 *   },
 * });
 */
export function useUnlinkRepositoryMutation(baseOptions?: Apollo.MutationHookOptions<UnlinkRepositoryMutation, UnlinkRepositoryMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<UnlinkRepositoryMutation, UnlinkRepositoryMutationVariables>(UnlinkRepositoryDocument, options);
      }
export type UnlinkRepositoryMutationHookResult = ReturnType<typeof useUnlinkRepositoryMutation>;
export type UnlinkRepositoryMutationResult = Apollo.MutationResult<UnlinkRepositoryMutation>;
export type UnlinkRepositoryMutationOptions = Apollo.BaseMutationOptions<UnlinkRepositoryMutation, UnlinkRepositoryMutationVariables>;
export const GetRepositoriesDocument = gql`
    query GetRepositories($provider: String!, $organization: String!) {
  repositories(provider: $provider, organization: $organization) {
    ...RepositoryFragment
  }
}
    ${RepositoryFragmentFragmentDoc}`;

/**
 * __useGetRepositoriesQuery__
 *
 * To run a query within a React component, call `useGetRepositoriesQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetRepositoriesQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetRepositoriesQuery({
 *   variables: {
 *      provider: // value for 'provider'
 *      organization: // value for 'organization'
 *   },
 * });
 */
export function useGetRepositoriesQuery(baseOptions: Apollo.QueryHookOptions<GetRepositoriesQuery, GetRepositoriesQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetRepositoriesQuery, GetRepositoriesQueryVariables>(GetRepositoriesDocument, options);
      }
export function useGetRepositoriesLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetRepositoriesQuery, GetRepositoriesQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetRepositoriesQuery, GetRepositoriesQueryVariables>(GetRepositoriesDocument, options);
        }
export type GetRepositoriesQueryHookResult = ReturnType<typeof useGetRepositoriesQuery>;
export type GetRepositoriesLazyQueryHookResult = ReturnType<typeof useGetRepositoriesLazyQuery>;
export type GetRepositoriesQueryResult = Apollo.QueryResult<GetRepositoriesQuery, GetRepositoriesQueryVariables>;
export const GetLinkedRepositoryDocument = gql`
    query GetLinkedRepository($projectId: ID!) {
  linkedRepository(projectId: $projectId) {
    ...RepositoryFragment
  }
}
    ${RepositoryFragmentFragmentDoc}`;

/**
 * __useGetLinkedRepositoryQuery__
 *
 * To run a query within a React component, call `useGetLinkedRepositoryQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetLinkedRepositoryQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetLinkedRepositoryQuery({
 *   variables: {
 *      projectId: // value for 'projectId'
 *   },
 * });
 */
export function useGetLinkedRepositoryQuery(baseOptions: Apollo.QueryHookOptions<GetLinkedRepositoryQuery, GetLinkedRepositoryQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetLinkedRepositoryQuery, GetLinkedRepositoryQueryVariables>(GetLinkedRepositoryDocument, options);
      }
export function useGetLinkedRepositoryLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetLinkedRepositoryQuery, GetLinkedRepositoryQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetLinkedRepositoryQuery, GetLinkedRepositoryQueryVariables>(GetLinkedRepositoryDocument, options);
        }
export type GetLinkedRepositoryQueryHookResult = ReturnType<typeof useGetLinkedRepositoryQuery>;
export type GetLinkedRepositoryLazyQueryHookResult = ReturnType<typeof useGetLinkedRepositoryLazyQuery>;
export type GetLinkedRepositoryQueryResult = Apollo.QueryResult<GetLinkedRepositoryQuery, GetLinkedRepositoryQueryVariables>;
export const RunPipelineDocument = gql`
    mutation RunPipeline($projectId: ID!) {
  runPipeline(projectId: $projectId) {
    ...RunFragment
  }
}
    ${RunFragmentFragmentDoc}`;
export type RunPipelineMutationFn = Apollo.MutationFunction<RunPipelineMutation, RunPipelineMutationVariables>;

/**
 * __useRunPipelineMutation__
 *
 * To run a mutation, you first call `useRunPipelineMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useRunPipelineMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [runPipelineMutation, { data, loading, error }] = useRunPipelineMutation({
 *   variables: {
 *      projectId: // value for 'projectId'
 *   },
 * });
 */
export function useRunPipelineMutation(baseOptions?: Apollo.MutationHookOptions<RunPipelineMutation, RunPipelineMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<RunPipelineMutation, RunPipelineMutationVariables>(RunPipelineDocument, options);
      }
export type RunPipelineMutationHookResult = ReturnType<typeof useRunPipelineMutation>;
export type RunPipelineMutationResult = Apollo.MutationResult<RunPipelineMutation>;
export type RunPipelineMutationOptions = Apollo.BaseMutationOptions<RunPipelineMutation, RunPipelineMutationVariables>;
export const CancelRunDocument = gql`
    mutation CancelRun($id: ID!) {
  cancelRun(id: $id) {
    ...RunFragment
  }
}
    ${RunFragmentFragmentDoc}`;
export type CancelRunMutationFn = Apollo.MutationFunction<CancelRunMutation, CancelRunMutationVariables>;

/**
 * __useCancelRunMutation__
 *
 * To run a mutation, you first call `useCancelRunMutation` within a React component and pass it any options that fit your needs.
 * When your component renders, `useCancelRunMutation` returns a tuple that includes:
 * - A mutate function that you can call at any time to execute the mutation
 * - An object with fields that represent the current status of the mutation's execution
 *
 * @param baseOptions options that will be passed into the mutation, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options-2;
 *
 * @example
 * const [cancelRunMutation, { data, loading, error }] = useCancelRunMutation({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useCancelRunMutation(baseOptions?: Apollo.MutationHookOptions<CancelRunMutation, CancelRunMutationVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useMutation<CancelRunMutation, CancelRunMutationVariables>(CancelRunDocument, options);
      }
export type CancelRunMutationHookResult = ReturnType<typeof useCancelRunMutation>;
export type CancelRunMutationResult = Apollo.MutationResult<CancelRunMutation>;
export type CancelRunMutationOptions = Apollo.BaseMutationOptions<CancelRunMutation, CancelRunMutationVariables>;
export const GetRunDocument = gql`
    query GetRun($id: ID!) {
  getRun(id: $id) {
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
      logs {
        id
        message
        createdAt
      }
      startedAt
    }
    message
    name
    title
    cursor
    status
  }
}
    `;

/**
 * __useGetRunQuery__
 *
 * To run a query within a React component, call `useGetRunQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetRunQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetRunQuery({
 *   variables: {
 *      id: // value for 'id'
 *   },
 * });
 */
export function useGetRunQuery(baseOptions: Apollo.QueryHookOptions<GetRunQuery, GetRunQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetRunQuery, GetRunQueryVariables>(GetRunDocument, options);
      }
export function useGetRunLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetRunQuery, GetRunQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetRunQuery, GetRunQueryVariables>(GetRunDocument, options);
        }
export type GetRunQueryHookResult = ReturnType<typeof useGetRunQuery>;
export type GetRunLazyQueryHookResult = ReturnType<typeof useGetRunLazyQuery>;
export type GetRunQueryResult = Apollo.QueryResult<GetRunQuery, GetRunQueryVariables>;
export const GetRunsDocument = gql`
    query GetRuns($projectId: ID!, $cursor: String, $limit: Int, $skip: Int) {
  getRuns(projectId: $projectId, cursor: $cursor, limit: $limit, skip: $skip) {
    ...RunFragment
  }
}
    ${RunFragmentFragmentDoc}`;

/**
 * __useGetRunsQuery__
 *
 * To run a query within a React component, call `useGetRunsQuery` and pass it any options that fit your needs.
 * When your component renders, `useGetRunsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useGetRunsQuery({
 *   variables: {
 *      projectId: // value for 'projectId'
 *      cursor: // value for 'cursor'
 *      limit: // value for 'limit'
 *      skip: // value for 'skip'
 *   },
 * });
 */
export function useGetRunsQuery(baseOptions: Apollo.QueryHookOptions<GetRunsQuery, GetRunsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<GetRunsQuery, GetRunsQueryVariables>(GetRunsDocument, options);
      }
export function useGetRunsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<GetRunsQuery, GetRunsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<GetRunsQuery, GetRunsQueryVariables>(GetRunsDocument, options);
        }
export type GetRunsQueryHookResult = ReturnType<typeof useGetRunsQuery>;
export type GetRunsLazyQueryHookResult = ReturnType<typeof useGetRunsLazyQuery>;
export type GetRunsQueryResult = Apollo.QueryResult<GetRunsQuery, GetRunsQueryVariables>;
export const CountRunsDocument = gql`
    query CountRuns($projectId: ID!) {
  countRuns(projectId: $projectId)
}
    `;

/**
 * __useCountRunsQuery__
 *
 * To run a query within a React component, call `useCountRunsQuery` and pass it any options that fit your needs.
 * When your component renders, `useCountRunsQuery` returns an object from Apollo Client that contains loading, error, and data properties
 * you can use to render your UI.
 *
 * @param baseOptions options that will be passed into the query, supported options are listed on: https://www.apollographql.com/docs/react/api/react-hooks/#options;
 *
 * @example
 * const { data, loading, error } = useCountRunsQuery({
 *   variables: {
 *      projectId: // value for 'projectId'
 *   },
 * });
 */
export function useCountRunsQuery(baseOptions: Apollo.QueryHookOptions<CountRunsQuery, CountRunsQueryVariables>) {
        const options = {...defaultOptions, ...baseOptions}
        return Apollo.useQuery<CountRunsQuery, CountRunsQueryVariables>(CountRunsDocument, options);
      }
export function useCountRunsLazyQuery(baseOptions?: Apollo.LazyQueryHookOptions<CountRunsQuery, CountRunsQueryVariables>) {
          const options = {...defaultOptions, ...baseOptions}
          return Apollo.useLazyQuery<CountRunsQuery, CountRunsQueryVariables>(CountRunsDocument, options);
        }
export type CountRunsQueryHookResult = ReturnType<typeof useCountRunsQuery>;
export type CountRunsLazyQueryHookResult = ReturnType<typeof useCountRunsLazyQuery>;
export type CountRunsQueryResult = Apollo.QueryResult<CountRunsQuery, CountRunsQueryVariables>;