import { gql } from "../../deps.ts";

export const fmt = gql`
  query fmt($src: String!) {
    fmt(src: $src)
  }
`;

export const lint = gql`
  query lint($src: String!) {
    lint(src: $src)
  }
`;

export const test = gql`
  query test($src: String!) {
    test(src: $src)
  }
`;

export const deploy = gql`
  query deploy(
    $src: String!
    $token: String!
    $project: String!
    $main: String!
    $noStatic: Boolean!
  ) {
    deploy(
      src: $src
      token: $token
      project: $project
      main: $main
      noStatic: $noStatic
    )
  }
`;

export const compile = gql`
  query compile(
    $src: String!
    $file: String!
    $output: String!
    $target: String!
  ) {
    compile(src: $src, file: $file, output: $output, target: $target)
  }
`;
