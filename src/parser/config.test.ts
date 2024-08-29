import { assertEquals } from "../../deps.ts";
import { parseConfig } from "./config.ts";

Deno.test("config - android.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/android.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      name: "Run gradle build",
      commands: "assemble_release",
      enabled: true,
      logo: "https://upload.wikimedia.org/wikipedia/commons/3/31/Android_robot_head.svg",
      plugin: "android",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - bazel.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/bazel.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      name: "Run tests",
      commands: "test //...",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bazel.svg",
      plugin: "bazel",
      use_wasm: true,
    },
    {
      name: "Build",
      commands: "build //...",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bazel.svg",
      plugin: "bazel",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - buck.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/buck.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      name: "Run tests",
      commands: "test //...",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github@main/assets/buck.svg",
      plugin: "buck",
      use_wasm: true,
    },
    {
      name: "Build",
      commands: "build //...",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github@main/assets/buck.svg",
      plugin: "buck",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - cmake.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/cmake.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      name: "Run tests",
      commands:
        "bash fluentci run --wasm cmake generate\n" +
        "bash fluentci run --wasm make test",
      enabled: true,
      plugin: "shell",
      use_wasm: true,
    },
    {
      name: "Build",
      commands:
        "bash fluentci run --wasm cmake generate\n" +
        "bash fluentci run --wasm cmake make",
      enabled: true,
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - cypress.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/cypress.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "install",
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bun.svg",
      name: "Install dependencies",
      enabled: true,
      plugin: "bun",
      use_wasm: true,
    },
    {
      name: "Run e2e tests",
      commands:
        "bash fluentci run --wasm cypress verify\n" +
        "bash fluentci run --wasm cypress info\n" +
        "bash fluentci run --wasm bun run test:ci",
      enabled: true,
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - deno.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/deno.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands:
        "bash fluentci run --wasm postgres start\n" +
        "bash fluentci run --wasm deno task test",
      enabled: true,
      env: { POSTGRES_USER: "postgres", POSTGRES_DB: "demo" },
      name: "Run tests",
      plugin: "shell",
      use_wasm: true,
    },
    {
      commands:
        "compile -A --target x86_64-unknown-linux-gnu --output=app main.ts",
      enabled: true,
      logo: "https://avatars.githubusercontent.com/u/42048915",
      name: "Compile",
      plugin: "deno",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - elixir-phoenix.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/elixir-phoenix.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "start",
      enabled: true,
      env: {
        MARIADB_USER: "user",
        MARIADB_PASSWORD: "password",
        MARIADB_DATABASE: "example_test",
      },
      logo: "https://avatars.githubusercontent.com/u/4739304",
      name: "Start MariaDB",
      plugin: "mariadb",
      use_wasm: true,
    },
    {
      commands:
        "bash fluentci run --wasm elixir test\n" +
        "bash fluentci run --wasm elixir compile",
      enabled: true,
      env: {
        MYSQL_DATABASE: "example_test",
        MYSQL_USER: "root",
        MYSQL_HOST: "127.0.0.1",
      },
      name: "Run tests",
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - fastlane.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/fastlane.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "setup",
      enabled: true,
      logo: "https://upload.wikimedia.org/wikipedia/commons/3/31/Android_robot_head.svg",
      name: "Setup Android SDK",
      plugin: "android",
      use_wasm: true,
    },
    {
      commands:
        "bash fluentci run --wasm bun install\n" +
        "bash fluentci run --wasm fastlane android buildRelease",
      enabled: true,
      name: "Build",
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - flutter.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/flutter.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands:
        "bash fluentci run --wasm flutter code_quality\n" +
        "bash fluentci run --wasm flutter test",
      enabled: true,
      name: "Run tests",
      plugin: "shell",
      use_wasm: true,
    },
    {
      commands: "build apk --release",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/flutter-original.svg",
      name: "Build",
      plugin: "flutter",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - gleam.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/gleam.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "test",
      enabled: true,
      logo: "https://avatars.githubusercontent.com/u/36161205",
      name: "Run tests",
      plugin: "gleam",
      use_wasm: true,
    },
    {
      commands: "build",
      enabled: true,
      logo: "https://avatars.githubusercontent.com/u/36161205",
      name: "Build",
      plugin: "gleam",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - go.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/go.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "install go",
      enabled: true,
      name: "Setup go",
      plugin: "pkgx",
      use_wasm: true,
    },
    {
      commands: "bash go get\nbash go build -o ./bin/main",
      enabled: true,
      name: "go get & build",
      plugin: "shell",
      use_wasm: true,
    },
    {
      commands: "bash gofmt main.go | diff --ignore-tab-expansion main.go -",
      enabled: true,
      name: "Check code style",
      plugin: "shell",
      use_wasm: true,
    },
    {
      commands:
        "bash fluentci run --wasm postgres start\n" +
        "bash go install gotest.tools/gotestsum@latest\n" +
        "bash PATH=$HOME/go/bin:$PATH gotestsum --junitfile junit.xml ./...",
      enabled: true,
      env: {
        POSTGRES_DB: "s2",
        POSTGRES_USER: "postgres",
      },
      name: "Run tests",
      plugin: "shell",
      use_wasm: true,
    },
    {
      commands:
        "bash ./bin/main 8001 &\n" +
        'bash curl --silent localhost:8001/time | grep "The current time is"',
      enabled: true,
      name: "Test web server",
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - java-spring.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/java-spring.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "setup zulu-17.46.16",
      enabled: true,
      name: "Setup Java",
      plugin: "java",
      use_wasm: true,
    },
    {
      commands: "setup",
      enabled: true,
      name: "Setup maven",
      plugin: "maven",
      use_wasm: true,
    },
    {
      commands: "bash mvn -q package jmeter:configure -Dmaven.test.skip-true",
      enabled: true,
      env: {
        JAVA_HOME: "$HOME/.local/share/mise/installs/java/zulu-17.46.16",
      },
      name: "Build",
      plugin: "shell",
      use_wasm: true,
    },
    {
      commands:
        "bash java -version\nbash mvn -q test-compile -Dmaven.test.skip=true",
      enabled: true,
      env: {
        JAVA_HOME: "$HOME/.local/share/mise/installs/java/zulu-17.46.16",
      },
      name: "Run tests",
      plugin: "shell",
      use_wasm: true,
    },
    {
      commands:
        "bash java -version\n" +
        "bash java -jar target/spring-pipeline-demo.jar > /dev/null &\n" +
        "bash sleep 20\n" +
        "bash mvn -q jmeter:jmeter\n" +
        "bash mvn jmeter:results",
      enabled: true,
      env: {
        JAVA_HOME: "$HOME/.local/share/mise/installs/java/zulu-17.46.16",
      },
      name: "Performance tests",
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - javascript.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/javascript.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "run lint",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bun.svg",
      name: "Client lint",
      plugin: "bun",
      use_wasm: true,
      working_directory: "src/client",
    },
    {
      commands: "run lint",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bun.svg",
      name: "Server lint",
      plugin: "bun",
      use_wasm: true,
      working_directory: "src/server",
    },
    {
      commands: "run test",
      enabled: true,
      env: {
        CI: "true",
        NODE_ENV: "test",
      },
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bun.svg",
      name: "Client Unit Tests",
      plugin: "bun",
      use_wasm: true,
      working_directory: "src/client",
    },
    {
      commands: "run test",
      enabled: true,
      env: {
        CI: "true",
        NODE_ENV: "test",
      },
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bun.svg",
      name: "Server Unit Tests",
      plugin: "bun",
      use_wasm: true,
      working_directory: "src/server",
    },
    {
      commands:
        "bash cd src/client && fluentci run --wasm cypress install && cd ../.. && fluentci run --wasm . e2e",
      enabled: true,
      name: "End to End Tests",
      plugin: "shell",
      use_wasm: true,
    },
    {
      commands:
        "bash fluentci run --wasm postgres start\n" +
        "bash pkgx psql ---host=localhost -d postgres -U `whoami` -c 'CREATE DATABASE test;'\n" +
        "bash fluentci run --wasm . server_e2e",
      enabled: true,
      name: "End to End Tests (Server)",
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - kotlin.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/kotlin.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "test",
      enabled: true,
      name: "test",
      plugin: "gradle",
      use_wasm: true,
      logo: "https://avatars.githubusercontent.com/u/124156",
    },
    {
      commands: "build",
      enabled: true,
      name: "build",
      plugin: "gradle",
      use_wasm: true,
      logo: "https://avatars.githubusercontent.com/u/124156",
    },
  ]);
});

Deno.test("config - php-laravel.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/php-laravel.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "start",
      enabled: true,
      env: {
        MARIADB_DATABASE: "laravel",
        MARIADB_PASSWORD: "password",
        MARIADB_USER: "user",
      },
      logo: "https://avatars.githubusercontent.com/u/4739304",
      name: "Start MariaDB",
      plugin: "mariadb",
      use_wasm: true,
    },
    {
      commands: "test",
      enabled: true,
      env: {
        MARIADB_DATABASE: "laravel",
        MARIADB_PASSWORD: "password",
        MARIADB_USER: "user",
      },
      logo: "https://avatars.githubusercontent.com/u/958072",
      name: "Run tests",
      plugin: "laravel",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - php.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/php.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands:
        "bash fluentci run --wasm php composer_install --no-interaction\n" +
        "bash fluentci run --wasm php test",
      enabled: true,
      name: "Run tests",
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - playwright.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/playwright.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "install",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bun.svg",
      name: "Install dependencies",
      plugin: "bun",
      use_wasm: true,
    },
    {
      commands:
        "bash fluentci run --wasm playwright install --with-deps\n" +
        "bash fluentci run --wasm playwright test -j $(nproc)",
      enabled: true,
      env: {
        CI: "true",
      },
      name: "Run playwright tests",
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - python-django.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/python-django.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "start",
      enabled: true,
      env: {
        MARIADB_DATABSE: "todo",
        MARIADB_PASSWORD: "testrootpass",
        MARIADB_USER: "user",
      },
      logo: "https://avatars.githubusercontent.com/u/4739304",
      name: "Start MariaDB",
      plugin: "mariadb",
      use_wasm: true,
    },
    {
      commands: "test",
      enabled: true,
      env: {
        MARIADB_DATABSE: "todo",
        MARIADB_HOST: "127.0.0.1",
        MARIADB_PASSWORD: "testrootpass",
        MARIADB_ROOT_PASSWORD: "root",
        MARIADB_USER: "user",
      },
      logo: "https://avatars.githubusercontent.com/u/27804",
      name: "Run tests",
      plugin: "django",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - python-flask.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/python-flask.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "start",
      enabled: true,
      logo: "https://avatars.githubusercontent.com/u/45120",
      name: "Start MongoDB",
      plugin: "mongo",
      use_wasm: true,
    },
    {
      commands:
        "bash fluentci run --wasm devbox run pip install -r requirements.txt\n" +
        "bash fluentci run --wasm devbox run python run.py &\n" +
        "bash sleep 2\n" +
        "bash fluentci run --wasm devbox run python -m unittest",
      enabled: true,
      env: {
        DB: "mongodb://localhost:27017/tasks",
        PORT: "5000",
      },
      name: "Run tests",
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - react-native.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/react-native.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "install",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/bun.svg",
      name: "Install dependencies",
      plugin: "bun",
      use_wasm: true,
    },
    {
      commands: "assemble_release",
      enabled: true,
      logo: "https://upload.wikimedia.org/wikipedia/commons/3/31/Android_robot_head.svg",
      name: "Run gradle assemble",
      plugin: "android",
      use_wasm: true,
      working_directory: "android",
    },
  ]);
});

Deno.test("config - ruby-on-rails.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/ruby-on-rails.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "start",
      enabled: true,
      env: {
        POSTGRES_DB: "demo_rails_test",
        POSTGRES_USER: "postgres",
      },
      logo: "https://upload.wikimedia.org/wikipedia/commons/2/29/Postgresql_elephant.svg",
      name: "Start Postgres",
      plugin: "postgres",
      use_wasm: true,
    },
    {
      commands: "bundle_exec rubocop",
      enabled: true,
      env: {
        RUBY_VERSION: "3.1.4",
      },
      logo: "https://avatars.githubusercontent.com/u/210414",
      name: "Check style + security",
      plugin: "ruby",
      use_wasm: true,
    },
    {
      commands:
        "bash fluentci run --wasm ruby bundle_exec rails db:migrate\n" +
        "bash fluentci run --wasm ruby bundle_exec rails db:seed\n" +
        "bash fluentci run --wasm ruby bundle_exec rails test\n" +
        "bash fluentci run --wasm ruby bundle_exec rails spec",
      enabled: true,
      env: {
        RAILS_ENV: "test",
      },
      name: "Run tests",
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - ruby.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/ruby.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "bundle_exec rspec",
      enabled: true,
      logo: "https://avatars.githubusercontent.com/u/210414",
      name: "Run tests",
      plugin: "ruby",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - rust.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/rust.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "setup",
      enabled: true,
      logo: "https://avatars.githubusercontent.com/u/5430905",
      name: "Setup Rust",
      plugin: "rust",
      use_wasm: true,
    },
    {
      commands:
        "bash fluentci run --wasm postgres start\n" +
        "bash curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash\n" +
        "bash cargo-binstall sqlx-cli -y\n" +
        "bash sqlx migrate run\n" +
        "bash cargo sqlx prepare\n" +
        "bash cargo test",
      enabled: true,
      env: {
        DATABASE_URL: "postgres://postgres@localhost/demo",
        POSTGRES_DB: "demo",
        POSTGRES_USER: "postgres",
      },
      name: "Run tests",
      plugin: "shell",
      use_wasm: true,
    },
    {
      commands: "build",
      enabled: true,
      env: {
        DATABASE_URL: "postgres://postgres@localhost/demo",
      },
      logo: "https://avatars.githubusercontent.com/u/5430905",
      name: "Run build",
      plugin: "rust",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - swift.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/swift.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "test",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/swift.svg",
      name: "Run tests",
      plugin: "swift",
      use_wasm: true,
    },
    {
      commands: "build",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/swift.svg",
      name: "Build",
      plugin: "swift",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - symfony.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/symfony.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands:
        "bash fluentci run --wasm symfony container_lint\n" +
        "bash fluentci run --wasm symfony doctrine_lint\n" +
        "bash fluentci run --wasm symfony phpstan\n" +
        "bash fluentci run --wasm symfony phpunit\n" +
        "bash fluentci run --wasm symfony twig_lint\n" +
        "bash fluentci run --wasm symfony xliff_lint\n" +
        "bash fluentci run --wasm symfony yaml_lint",
      enabled: true,
      name: "Run lint checks and tests",
      plugin: "shell",
      use_wasm: true,
    },
  ]);
});

Deno.test("config - zig.fluentci.toml", () => {
  const data = Deno.readFileSync("fixtures/zig.fluentci.toml");
  const config = parseConfig(new TextDecoder().decode(data));
  assertEquals(config, [
    {
      commands: "test",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/zig-original.svg",
      name: "test",
      plugin: "zig",
      use_wasm: true,
    },
    {
      commands: "build",
      enabled: true,
      logo: "https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github/assets/zig-original.svg",
      name: "build",
      plugin: "zig",
      use_wasm: true,
    },
  ]);
});
