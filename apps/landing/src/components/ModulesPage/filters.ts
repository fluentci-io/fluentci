export const categories = [
  {
    value: "artifacts",
    label: "Artifacts",
    topics: ["artifact", "artifacts", "storage", "s3", "upload", "download"],
  },
  {
    value: "containers",
    label: "Containers",
    topics: [
      "container",
      "containers",
      "docker",
      "podman",
      "oci",
      "kubernetes",
      "k8s",
    ],
  },
  {
    value: "infrastructure",
    label: "Infrastructure",
    topics: [
      "infrastructure",
      "iac",
      "terraform",
      "opentofu",
      "pulumi",
      "ansible",
    ],
  },
  {
    value: "databases",
    label: "Databases",
    topics: [
      "database",
      "databases",
      "sql",
      "postgres",
      "postgresql",
      "mysql",
      "redis",
      "sqlite",
      "mongodb",
    ],
  },
  {
    value: "cloud",
    label: "Cloud",
    topics: ["cloud", "aws", "azure", "gcp", "cloudflare", "digitalocean"],
  },
  {
    value: "toolchains",
    label: "Toolchains",
    topics: ["setup", "toolchain", "runtime"],
  },
  {
    value: "build",
    label: "Build",
    topics: ["build", "compiler", "compilation", "nix"],
  },
  {
    value: "testing",
    label: "Testing",
    topics: ["test", "testing", "lint", "quality"],
  },
  {
    value: "deployment",
    label: "Deployment",
    topics: ["deploy", "deployment", "hosting"],
  },
  {
    value: "caching",
    label: "Caching",
    topics: ["cache", "caching", "sccache", "cachix"],
  },
  {
    value: "publishing",
    label: "Publishing",
    topics: ["publish", "publishing", "release", "registry"],
  },
] as const;
export const operatingSystems = [
  { value: "linux", label: "Linux" },
  { value: "macos", label: "macOS" },
  { value: "freebsd", label: "FreeBSD" },
  { value: "netbsd", label: "NetBSD" },
  { value: "openbsd", label: "OpenBSD" },
  { value: "windows", label: "Windows" },
];
export const architectures = [
  { value: "x86_64", label: "x86_64" },
  { value: "aarch64", label: "ARM64 (aarch64)" },
];
export const sorts = [
  { value: "downloads", label: "Most downloaded" },
  { value: "newest", label: "Recently published" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name (A–Z)" },
];
export type CatalogSearch = {
  q: string;
  sort: string;
  categories: string[];
  os: string[];
  arch: string[];
  official: boolean;
};
const select = (value: unknown, choices: readonly { value: string }[]) => {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return choices
    .filter((choice) => values.includes(choice.value))
    .map((choice) => choice.value);
};
export function validateCatalogSearch(
  search: Record<string, unknown>,
): CatalogSearch {
  return {
    q:
      typeof search.q === "string" || typeof search.q === "number"
        ? String(search.q).slice(0, 200)
        : "",
    sort: sorts.some((item) => item.value === search.sort)
      ? String(search.sort)
      : "downloads",
    categories: select(search.categories, categories),
    os: select(search.os, operatingSystems),
    arch: select(search.arch, architectures),
    official: search.official === true || search.official === "true",
  };
}
export function registryFilter(filters: CatalogSearch) {
  const topics = [
    ...new Set(
      categories
        .filter((item) => filters.categories.includes(item.value))
        .flatMap((item) => [...item.topics]),
    ),
  ];
  return [
    topics.length ? `topics=in=(${topics.join(",")})` : "",
    filters.os.length ? `os=in=(${filters.os.join(",")})` : "",
    filters.arch.length ? `arch=in=(${filters.arch.join(",")})` : "",
  ]
    .filter(Boolean)
    .join(";");
}
