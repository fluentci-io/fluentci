import { gql } from "@apollo/client";
import { ProjectFragment } from "../Fragment";

export const GET_PROJECTS = gql`
  query GetProjects(
    $cursor: String
    $limit: Int
    $skip: Int
    $reverse: Boolean
    $filters: ProjectFilters
  ) {
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
  ${ProjectFragment}
`;

export const GET_PROJECT = gql`
  query GetProject($id: ID!) {
    project(id: $id) {
      ...ProjectFragment
    }
  }

  ${ProjectFragment}
`;

export const COUNT_PROJECTS = gql`
  query CountProjects {
    countProjects
  }
`;
