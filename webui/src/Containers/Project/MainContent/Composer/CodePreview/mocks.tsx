export const code = `name: lint and test
on:
  push:
    branches:
      - main
jobs:
  tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Fluent CI
        uses: fluentci-io/setup-fluentci@v5
        with:
          wasm: true
          pipeline: deno
          args: |
            fmt
            lint
            test
            coverage
      - name: Upload to Codecov
        run: fluentci run --wasm codecov upload
        env:
          CODECOV_TOKEN: \${{ secrets.CODECOV_TOKEN }}`;
