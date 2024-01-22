# Deno Pipeline

[![fluentci pipeline](https://img.shields.io/badge/dynamic/json?label=pkg.fluentci.io&labelColor=%23000&color=%23460cf1&url=https%3A%2F%2Fapi.fluentci.io%2Fv1%2Fpipeline%2Fdeno_pipeline&query=%24.version)](https://pkg.fluentci.io/deno_pipeline)
[![deno module](https://shield.deno.dev/x/deno_pipeline)](https://deno.land/x/deno_pipeline)
![deno compatibility](https://shield.deno.dev/deno/^1.37)
[![](https://img.shields.io/codecov/c/gh/fluent-ci-templates/deno-pipeline)](https://codecov.io/gh/fluent-ci-templates/deno-pipeline)

A ready-to-use CI/CD Pipeline for your Deno projects.

## 🚀 Usage

Run the following command:

```bash
fluentci run deno_pipeline
```

Or, if you want to use it as a template:

```bash
fluentci init -t deno
```

This will create a `.fluentci` folder in your project.

Now you can run the pipeline with:

```bash
fluentci run .
```

## Environment variables (Deno Deploy)

| Variable          | Description               | Default    |
| ----------------- | ------------------------- | ---------- |
| DENO_PROJECT      | Your project name         |            |
| NO_STATIC         | Disable static assets     | `false`    |
| EXCLUDE           | Exclude files from deploy |            |
| DENO_DEPLOY_TOKEN | Your Deno Deploy token    |            |
| DENO_MAIN_SCRIPT  | Your main script          | `main.tsx` |

## Jobs

| Job     | Description                                               | Options                |
| ------- | --------------------------------------------------------- | ---------------------- |
| fmt     | Format your code                                          |                        |
| lint    | Lint your code                                            |                        |
| test    | Run your tests                                            | `{ ignore: string[] }` |
| compile | Compile the given script into a self contained executable |                        |
| deploy  | Deploy your app to Deno Deploy                            |                        |

```graphql
compile(
  file: String!, 
  output: String!, 
  src: String!, 
  target: String!
): String

deploy(
  main: String!, 
  noStatic: Boolean!, 
  project: String!, 
  src: String!, 
  token: String!
): String

fmt(src: String!): String

lint(src: String!): String

test(src: String!): String
```

## Programmatic usage

You can also use this pipeline programmatically:

```ts
import { fmt, lint, test } from "https://deno.land/x/deno_pipeline/mod.ts";

await fmt();
await lint();
await test();
```
