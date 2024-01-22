import { gql } from "../../deps.ts";

export const fmt = gql`
  query Fmt($src: String!) {
    fmt(src: $src)
  }
`;

export const lint = gql`
  query Lint($src: String!) {
    lint(src: $src)
  }
`;

export const test = gql`
  query Test($src: String!) {
    test(src: $src)
  }
`;

export const deploy = gql`
  query Deploy($src: String!) {
    deploy(src: $src)
  }
`;
