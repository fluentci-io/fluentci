import { gql } from "@apollo/client";
import { OrganizationFragment } from "../Fragment";

export const GET_ORGANIZATIONS = gql`
  query GetOrganizations($provider: String!) {
    organizations(provider: $provider) {
      ...OrganizationFragment
    }
  }
  ${OrganizationFragment}
`;
