const navigation = [
  {
    title: "Start here",
    items: [
      { title: "Introduction", url: "/" },
      { title: "Installation", url: "/getting-started/installation/" },
      { title: "First pipeline", url: "/getting-started/quick-start/" },
      { title: "Core concepts", url: "/getting-started/concepts/" },
    ],
  },
  {
    title: "Build pipelines",
    items: [
      { title: "AI agent skills", url: "/guides/agent-skills/" },
      { title: "Pipeline configuration", url: "/guides/pipelines/" },
      { title: "Workspace modules", url: "/guides/modules/" },
      { title: "Module dependencies", url: "/guides/module-dependencies/" },
      { title: "Typed module arguments", url: "/guides/module-arguments/" },
      { title: "WebAssembly components", url: "/guides/components/" },
      { title: "Environment and providers", url: "/guides/environment/" },
      { title: "Native plans and matrices", url: "/guides/native-plans/" },
      { title: "Host and transfer primitives", url: "/guides/primitives/" },
      { title: "Caching", url: "/guides/caching/" },
      { title: "Services", url: "/guides/services/" },
      { title: "CI and exports", url: "/guides/ci/" },
    ],
  },
  {
    title: "Language SDKs",
    items: [
      { title: "Choose an SDK", url: "/sdks/" },
      { title: "ClojureScript", url: "/sdks/clojurescript/" },
      { title: "PureScript", url: "/sdks/purescript/" },
      { title: "Rust", url: "/sdks/rust/" },
      { title: "TypeScript", url: "/sdks/typescript/" },
      { title: "Python", url: "/sdks/python/" },
      { title: "Gleam", url: "/sdks/gleam/" },
      { title: "Elixir", url: "/sdks/elixir/" },
      { title: "ReScript", url: "/sdks/rescript/" },
    ],
  },
  {
    title: "Studio and publishing",
    items: [
      { title: "Studio", url: "/studio/" },
      { title: "Desktop app", url: "/studio/desktop/" },
      { title: "Account and Tangled", url: "/registry/authentication/" },
      { title: "Publish a plugin", url: "/registry/publishing/" },
      { title: "Find and run plugins", url: "/registry/using-plugins/" },
      { title: "Logs and tracing", url: "/guides/observability/" },
    ],
  },
  {
    title: "Reference",
    items: [
      { title: "CLI commands", url: "/reference/cli/" },
      { title: "fluentci.toml", url: "/reference/configuration/" },
      { title: "fluentci.lock", url: "/reference/lockfile/" },
      { title: "Environment variables", url: "/reference/environment/" },
      { title: "GraphQL and events", url: "/reference/graphql/" },
      { title: "Registry XRPC API", url: "/reference/registry-api/" },
      { title: "Troubleshooting", url: "/reference/troubleshooting/" },
    ],
  },
  {
    title: "Contribute and deploy",
    items: [
      { title: "Architecture", url: "/development/architecture/" },
      { title: "Local development", url: "/development/" },
      { title: "Deploy the registry", url: "/development/registry/" },
      { title: "Build these docs", url: "/development/documentation/" },
    ],
  },
];

export default {
  layout: "docs.vto",
  navigation,
  repo: "https://github.com/fluentci-io/fluentci",
  siteName: "FluentCI Docs",
};
