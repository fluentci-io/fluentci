import { FC, useState, useCallback, useEffect } from "react";
import NewActionModal from "./NewActionModal";
import { useForm, FormProvider } from "react-hook-form";

const BASE_URL = "https://api.fluentci.io/v1";
const SEARCH_API = "https://search.fluentci.io";

const filters = [
  "buildx",
  "nixpacks",
  "oxc",
  "moon",
  "uv",
  "biome",
  "java",
  "ruff",
  "rye",
  "apko",
  "sbt",
  "pkl",
  "cue",
  "trufflehog",
  "yamllint",
  "jsonlint",
  "sqlfluff",
  "sqruff",
  "dhall",
  "tinygo",
  "maven",
  "ansible",
  "ansible-lint",
  "open-policy-agent",
  "dagger",
  "teller",
  "black",
  "kubeconform",
  "purescript",
  "haskell",
  "base_pipeline",
  "bazel_pipeline",
  "buf_pipeline",
  "atlas_pipeline",
  "terraform_pipeline",
  "deno_pipeline",
  "android_pipeline",
  "fastlane_pipeline",
  "elixir_pipeline",
  "symfony_pipeline",
  "laravel_pipeline",
  "ruby_pipeline",
  "django_pipeline",
  "gradle_pipeline",
  "dotnet_pipeline",
  "bun_pipeline",
  "nodejs_pipeline",
  "gleam_pipeline",
  "php_pipeline",
  "python_pipeline",
  "swift_pipeline",
  "rust_pipeline",
  "go_pipeline",
  "zig_pipeline",
  "flutter_pipeline",
  "heroku_pipeline",
  "codecov_pipeline",
  "cloudflare_pipeline",
  "render_pipeline",
  "fly_pipeline",
  "netlify_pipeline",
  "shuttle_pipeline",
  "railway_pipeline",
  "chromatic_pipeline",
  "spin_pipeline",
  "clojure_pipeline",
  "sonar_pipeline",
  "drizzlekit_pipeline",
  "prisma_pipeline",
  "terragrunt_pipeline",
  "pulumi_pipeline",
  "wiremock_pipeline",
  "trivy_pipeline",
  "snyk_pipeline",
  "grype_pipeline",
  "syft_pipeline",
  "github_pipeline",
  "gitlab_pipeline",
  "firebase_pipeline",
  "supabase_pipeline",
  "aws_sls_pipeline",
  "wasmer_pipeline",
  "terraform_docs_pipeline",
  "gitleaks_pipeline",
  "microcks_pipeline",
  "flakestry_pipeline",
  "scorecard_pipeline",
  "conftest_pipeline",
  "packer",
  "playwright",
  "cypress",
  "flipt",
  "depot",
  "nix",
  "devenv",
  "devbox",
  "pkgx",
  "vfox",
  "mise",
  "ssh",
  "shell",
  "apache",
  "caddy",
  "cassandra",
  "clickhouse",
  "cockroachdb",
  "confd",
  "consul-template",
  "consul",
  "couchdb",
  "daemon",
  "dgraph",
  "dragonflydb",
  "dynamodb-local",
  "elasticmq",
  "etcd",
  "httpbin",
  "influxdb",
  "jaeger",
  "mailcatcher",
  "mailpit",
  "mariadb",
  "meilisearch",
  "memcached",
  "minikube",
  "minio",
  "mongo",
  "mysql",
  "nats",
  "nginx",
  "nsq",
  "opentelemetry-collector",
  "postgres",
  "quickwit",
  "rabbitmq",
  "redis",
  "rethinkdb",
  "spicedb",
  "stripe-mock",
  "temporal",
  "tidb",
  "typesense",
  "vault",
  "zipkin",
];

export type Pipeline = {
  id: string;
  name: string;
  actionName?: string;
  active?: boolean;
  useWasmPlugin?: boolean;
  command: string;
  description: string;
  githubUrl: string;
  logo: string;
  packageId: string;
  downloads: number;
  version: string;
  license: string;
  defaultBranch: string;
  updatedAt: string;
  comingSoon: boolean;
  env?: string[] | null;
  workingDirectory?: string | null;
};

type NewActionModalWithDataProps = {
  onClose: () => void;
  onAdd: (item: Pipeline) => void;
  isOpen: boolean;
};

const NewActionModalWithData: FC<NewActionModalWithDataProps> = (props) => {
  const [pipelines, setPipelines] = useState<{ all: Pipeline[] }>();
  const methods = useForm({
    defaultValues: {
      search: "",
    },
  });

  const loadPipelines = () => {
    fetch(`${BASE_URL}/pipelines?q=${filters.join(",")}`)
      .then((res) => res.json())
      .then((data) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const results = data.map((x: any) => ({
          id: x.id,
          name: x.name,
          command: x.command,
          description: x.description,
          githubUrl: x.github_url,
          logo: x.logo_url,
          packageId: x.name,
          downloads: x.downloads,
          version: x.version,
          license: x.license,
          defaultBranch: x.default_branch,
          updatedAt: x.updatedAt,
          comingSoon: false,
        }));
        setPipelines({
          all: results,
        });
      })
      .catch((err) => console.log(err));
  };

  const onSearch = useCallback(async (keyword: string) => {
    if (keyword?.length === 0) {
      await loadPipelines();
      return;
    }

    if (keyword?.length < 2) {
      return;
    }

    await fetch(`${SEARCH_API}?q=${keyword}`)
      .then((res) => res.json())
      .then((data) =>
        setPipelines({
          all: data?.results?.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (x: any) =>
              ({
                id: x.id,
                name: x.name,
                command: x.command,
                description: x.description,
                githubUrl: x.github_url,
                logo: x.logo_url,
                packageId: x.name,
                downloads: x.downloads,
                version: x.version,
                license: x.license,
                defaultBranch: x.default_branch,
                updatedAt: x.updatedAt,
                comingSoon: false,
              } || [])
          ),
        })
      );
  }, []);

  const onClose = () => {
    props.onClose();
    loadPipelines();
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => methods.reset(), [props.isOpen]);

  return (
    <FormProvider {...methods}>
      <NewActionModal
        pipelines={pipelines}
        {...props}
        onClose={onClose}
        onSearch={onSearch}
      />
    </FormProvider>
  );
};

export default NewActionModalWithData;
