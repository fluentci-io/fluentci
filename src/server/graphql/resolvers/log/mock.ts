export const logs = `
/usr/bin/sh -c curl -fsSL https://deno.land/x/install/install.sh | sh
#=#=#                                                                         

##########                                                                15.2%
################################################                          67.0%
######################################################################## 100.0%
Archive:  /home/runner/.deno/bin/deno.zip
  inflating: /home/runner/.deno/bin/deno  
Deno was installed successfully to /home/runner/.deno/bin/deno
Manually add the directory to your $HOME/.bashrc (or similar)
  export DENO_INSTALL="/home/runner/.deno"
  export PATH="$DENO_INSTALL/bin:$PATH"
Run '/home/runner/.deno/bin/deno --help' to get started

Stuck? Join our Discord https://discord.gg/deno
/home/runner/.deno/bin/deno install -A -r https://cli.fluentci.io -n fluentci
Download https://cli.fluentci.io/
✅ Successfully installed fluentci
/home/runner/.deno/bin/fluentci
/usr/bin/sh -c curl -L https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=0.8.8 sh
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100  8674  100  8674    0     0  51457      0 --:--:-- --:--:-- --:--:-- 51630
sh debug downloading files into /tmp/tmp.o9EPu2TXni
sh debug http_download https://dl.dagger.io/dagger/releases/0.8.8/dagger_v0.8.8_linux_amd64.tar.gz
sh debug http_download https://dl.dagger.io/dagger/releases/0.8.8/checksums.txt
sh debug display shell completion instructions

dagger has built-in shell completion. This is how you can install it for:

  BASH:

    1. Ensure that you install bash-completion using your package manager.

    2. Add dagger completion to your personal bash completions dir

      mkdir -p /bash-completion/completions
      dagger completion bash > /bash-completion/completions/dagger

  ZSH:

    1. Generate a _dagger completion script and write it to a file within your $FPATH, e.g.:

      dagger completion zsh > /usr/local/share/zsh/site-functions/_dagger

    2. Ensure that the following is present in your ~/.zshrc:

      autoload -U compinit
      compinit -i

    zsh version 5.7 or later is recommended.

  FISH:

    1. Generate a dagger.fish completion script and write it to a file within fish completions, e.g.:

      dagger completion fish > ~/.config/fish/completions/dagger.fish
    
sh info installed ./bin/dagger
/usr/bin/sudo mv bin/dagger /usr/local/bin
/home/runner/.deno/bin/fluentci --version
Download https://deno.land/x/fluentci/import_map.json
Warning Implicitly using latest version (v0.11.6) for https://deno.land/x/fluentci/import_map.json
Download https://deno.land/x/fluentci@v0.11.6/import_map.json
Download https://deno.land/x/fluentci/main.ts
Warning Implicitly using latest version (v0.11.6) for https://deno.land/x/fluentci/main.ts
Download https://deno.land/x/fluentci@v0.11.6/main.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/mod.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/run.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/init.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/search.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/upgrade.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/list.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/github.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/gitlab.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/aws.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/azure.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/circleci.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/docs.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/cache.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/doctor.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/env.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/login.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/publish.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/agent.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/whoami.ts
Download https://deno.land/x/fluentci@v0.11.6/deps.ts
Download https://deno.land/x/fluentci@v0.11.6/src/consts.ts
Download https://deno.land/x/fluentci@v0.11.6/src/cmd/repl.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/command.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/types/action_list.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/types/boolean.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/types/child_command.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/types/command.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/types/enum.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/types/file.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/types/integer.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/types/number.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/types/string.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/type.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/_errors.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/help/mod.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/upgrade/mod.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/completions/mod.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/deprecated.ts
Download https://deno.land/x/fluentci@v0.11.6/src/git.ts
Download https://deno.land/x/fluentci@v0.11.6/src/utils.ts
Download https://deno.land/x/fluentci@v0.11.6/src/validate.ts
Download https://deno.land/x/xhr@0.1.0/mod.ts
Download https://deno.land/x/fluentci@v0.11.6/src/types.ts
Download https://deno.land/std@0.212.0/semver/mod.ts
Download https://deno.land/std@0.192.0/fmt/colors.ts
Download https://deno.land/x/zod@v3.22.2/mod.ts
Download https://deno.land/x/zip@v1.2.5/mod.ts
Download https://deno.land/std@0.203.0/fs/exists.ts
Download https://deno.land/std@0.205.0/dotenv/mod.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/secret.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/mod.ts
Download https://deno.land/x/dir@1.5.2/mod.ts
Download https://deno.land/std@0.210.0/fs/walk.ts
Download https://deno.land/x/zipjs@v2.7.32/index.js
Download https://cdn.jsdelivr.net/gh/fluentci-io/daggerverse@main/deno-sdk/sdk/src/mod/introspect.ts
Download https://deno.land/x/wait@0.1.13/mod.ts
Download https://cdn.skypack.dev/lodash
Download https://deno.land/x/logger@v1.1.3/logger.ts
Download https://deno.land/x/docker_names@v1.1.0/mod.ts
Download https://deno.land/std@0.211.0/streams/merge_readable_streams.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/table/mod.ts
Download https://deno.land/x/spinners@v1.1.2/mod.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/flags/_errors.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/flags/_utils.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/flags/flags.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/_utils.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/deps.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/_type_utils.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/help/_help_generator.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/_argument_types.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/upgrade/_check_version.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/flags/types/boolean.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/flags/types/integer.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/flags/types/number.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/flags/types/string.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/types.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/help/help_command.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/upgrade/provider/deno_land.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/upgrade/provider/github.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/upgrade/provider/nest_land.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/upgrade/provider.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/upgrade/upgrade_command.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/completions/bash.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/completions/fish.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/completions/zsh.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/completions/completions_command.ts
Download https://deno.land/x/media_types@v2.9.0/mod.ts
Download https://deno.land/std@0.212.0/semver/comparator_format.ts
Download https://deno.land/std@0.212.0/semver/comparator_intersects.ts
Download https://deno.land/std@0.212.0/semver/comparator_max.ts
Download https://deno.land/std@0.212.0/semver/comparator_min.ts
Download https://deno.land/std@0.212.0/semver/compare_build.ts
Download https://deno.land/std@0.212.0/semver/compare.ts
Download https://deno.land/std@0.212.0/semver/constants.ts
Download https://deno.land/std@0.212.0/semver/difference.ts
Download https://deno.land/std@0.212.0/semver/eq.ts
Download https://deno.land/std@0.212.0/semver/format.ts
Download https://deno.land/std@0.212.0/semver/gt.ts
Download https://deno.land/std@0.212.0/semver/gte.ts
Download https://deno.land/std@0.212.0/semver/gtr.ts
Download https://deno.land/std@0.212.0/semver/test_comparator.ts
Download https://deno.land/std@0.212.0/semver/test_range.ts
Download https://deno.land/std@0.212.0/semver/increment.ts
Download https://deno.land/std@0.212.0/semver/is_semver_range.ts
Download https://deno.land/std@0.212.0/semver/is_semver.ts
Download https://deno.land/std@0.212.0/semver/lt.ts
Download https://deno.land/std@0.212.0/semver/lte.ts
Download https://deno.land/std@0.212.0/semver/ltr.ts
Download https://deno.land/std@0.212.0/semver/max_satisfying.ts
Download https://deno.land/std@0.212.0/semver/min_satisfying.ts
Download https://deno.land/std@0.212.0/semver/neq.ts
Download https://deno.land/std@0.212.0/semver/outside.ts
Download https://deno.land/std@0.212.0/semver/parse_comparator.ts
Download https://deno.land/std@0.212.0/semver/parse_range.ts
Download https://deno.land/std@0.212.0/semver/parse.ts
Download https://deno.land/std@0.212.0/semver/range_format.ts
Download https://deno.land/std@0.212.0/semver/range_intersects.ts
Download https://deno.land/std@0.212.0/semver/range_max.ts
Download https://deno.land/std@0.212.0/semver/range_min.ts
Download https://deno.land/std@0.212.0/semver/rsort.ts
Download https://deno.land/std@0.212.0/semver/sort.ts
Download https://deno.land/std@0.212.0/semver/types.ts
Download https://deno.land/x/zod@v3.22.2/index.ts
Download https://deno.land/x/zip@v1.2.5/compress.ts
Download https://deno.land/x/zip@v1.2.5/decompress.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/_generic_prompt.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/deps.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/_generic_input.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/_generic_list.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/checkbox.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/confirm.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/input.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/list.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/number.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/select.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/toggle.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/prompt.ts
Download https://deno.land/x/dir@1.5.2/home_dir/mod.ts
Download https://deno.land/x/dir@1.5.2/cache_dir/mod.ts
Download https://deno.land/x/dir@1.5.2/config_dir/mod.ts
Download https://deno.land/x/dir@1.5.2/data_dir/mod.ts
Download https://deno.land/x/dir@1.5.2/data_local_dir/mod.ts
Download https://deno.land/x/dir@1.5.2/download_dir/mod.ts
Download https://deno.land/x/dir@1.5.2/tmp_dir/mod.ts
Download https://deno.land/std@0.210.0/path/join.ts
Download https://deno.land/std@0.210.0/path/normalize.ts
Download https://deno.land/std@0.210.0/fs/_to_path_string.ts
Download https://deno.land/std@0.210.0/fs/_create_walk_entry.ts
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/codecs/deflate.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/codecs/inflate.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/configuration.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/util/mime-type.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/codec-pool.js
Download https://deno.land/x/zipjs@v2.7.32/lib/zip-fs.js
Download https://cdn.jsdelivr.net/gh/fluentci-io/daggerverse@main/deno-sdk/sdk/deps.ts
Download https://deno.land/x/wait@0.1.13/deps.ts
Download https://deno.land/x/wait@0.1.13/spinners.ts
Download https://deno.land/x/wait@0.1.13/log_symbols.ts
Download https://cdn.skypack.dev/-/lodash@v4.17.21-K6GEbP02mWFnLA45zAmi/dist=es2019,mode=imports/optimized/lodash.js
Download https://deno.land/x/logger@v1.1.3/stdout.ts
Download https://deno.land/x/logger@v1.1.3/writer.ts
Download https://deno.land/x/logger@v1.1.3/eol.ts
Download https://deno.land/x/logger@v1.1.3/fs.ts
Download https://deno.land/x/logger@v1.1.3/date.ts
Download https://deno.land/x/logger@v1.1.3/deps.ts
Download https://deno.land/x/logger@v1.1.3/interface.ts
Download https://deno.land/x/logger@v1.1.3/types.ts
Download https://deno.land/x/docker_names@v1.1.0/generator.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/table/border.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/table/cell.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/table/column.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/table/consume_words.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/table/row.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/table/table.ts
Download https://deno.land/x/spinners@v1.1.2/spinner-types.ts
Download https://deno.land/x/spinners@v1.1.2/terminal-spinner.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/_utils/distance.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/flags/deprecated.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/flags/_validate_flags.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/table/table.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/_spread.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/completions/_bash_completions_generator.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/completions/_fish_completions_generator.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/completions/_zsh_completions_generator.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/command/completions/complete.ts
Download https://deno.land/x/media_types@v2.9.0/db.ts
Download https://deno.land/x/media_types@v2.9.0/deps.ts
Download https://deno.land/std@0.212.0/semver/_shared.ts
Download https://deno.land/std@0.212.0/semver/is_comparator.ts
Download https://deno.land/std@0.212.0/semver/format_range.ts
Download https://deno.land/std@0.212.0/semver/reverse_sort.ts
Download https://deno.land/std@0.212.0/semver/_constants.ts
Download https://deno.land/x/zod@v3.22.2/external.ts
Download https://deno.land/x/zip@v1.2.5/deps.ts
Download https://deno.land/x/zip@v1.2.5/utils.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/ansi/tty.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/keycode/key_code.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/_figures.ts
Download https://deno.land/std@0.196.0/fmt/colors.ts
Download https://deno.land/std@0.196.0/path/mod.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/_utils.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/_utils/distance.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/prompt/_generic_suggestions.ts
Download https://deno.land/std@0.204.0/path/join.ts
Download https://deno.land/std@0.210.0/path/_os.ts
Download https://deno.land/std@0.210.0/path/posix/join.ts
Download https://deno.land/std@0.210.0/path/windows/join.ts
Download https://deno.land/std@0.210.0/path/posix/normalize.ts
Download https://deno.land/std@0.210.0/path/windows/normalize.ts
Download https://deno.land/std@0.210.0/path/from_file_url.ts
Download https://deno.land/std@0.210.0/path/basename.ts
Download https://deno.land/x/zipjs@v2.7.32/lib/core/constants.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/stream-adapter.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/util/default-mime-type.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/codec-stream.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/codec-worker.js
Download https://deno.land/x/zipjs@v2.7.32/lib/z-worker-inline.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/util/stream-codec-shim.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/io.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/zip-reader.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/zip-writer.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/zip-fs-core.js
Download https://esm.sh/v128/graphql-request@6.1.0
Download https://esm.sh/@dagger.io/dagger@0.9.3
Download https://deno.land/std@0.205.0/assert/assert.ts
Download https://deno.land/std@0.129.0/testing/asserts.ts
Download https://deno.land/std@0.170.0/fmt/colors.ts
Download https://deno.land/x/tty@0.1.4/mod.ts
Download https://deno.land/x/logger@v1.1.3/writable.ts
Download https://deno.land/std@0.189.0/fmt/colors.ts
Download https://deno.land/std@0.189.0/streams/write_all.ts
Download https://deno.land/x/docker_names@v1.1.0/adjectives.ts
Download https://deno.land/x/docker_names@v1.1.0/personalities.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/table/_utils.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/table/_layout.ts
Download https://deno.land/x/spinners@v1.1.2/util.ts
Download https://deno.land/std@0.52.0/fmt/colors.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/flags/types.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/table/border.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/table/cell.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/table/column.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/table/_layout.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/table/row.ts
Download https://deno.land/std@0.99.0/path/mod.ts
Download https://deno.land/x/zod@v3.22.2/errors.ts
Download https://deno.land/x/zod@v3.22.2/helpers/parseUtil.ts
Download https://deno.land/x/zod@v3.22.2/helpers/typeAliases.ts
Download https://deno.land/x/zod@v3.22.2/helpers/util.ts
Download https://deno.land/x/zod@v3.22.2/types.ts
Download https://deno.land/x/zod@v3.22.2/ZodError.ts
Download https://deno.land/std@0.133.0/path/mod.ts
Download https://deno.land/std@0.133.0/fs/mod.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/ansi/ansi_escapes.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/ansi/cursor_position.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/keycode/_key_codes.ts
Download https://deno.land/std@0.196.0/_util/os.ts
Download https://deno.land/std@0.196.0/path/win32.ts
Download https://deno.land/std@0.196.0/path/posix.ts
Download https://deno.land/std@0.196.0/path/common.ts
Download https://deno.land/std@0.196.0/path/separator.ts
Download https://deno.land/std@0.196.0/path/_interface.ts
Download https://deno.land/std@0.196.0/path/glob.ts
Download https://deno.land/std@0.204.0/path/_os.ts
Download https://deno.land/std@0.204.0/path/posix/join.ts
Download https://deno.land/std@0.204.0/path/windows/join.ts
Download https://deno.land/std@0.210.0/path/_common/assert_path.ts
Download https://deno.land/std@0.210.0/assert/assert.ts
Download https://deno.land/std@0.210.0/path/windows/_util.ts
Download https://deno.land/std@0.210.0/path/_common/normalize.ts
Download https://deno.land/std@0.210.0/path/_common/normalize_string.ts
Download https://deno.land/std@0.210.0/path/posix/_util.ts
Download https://deno.land/std@0.210.0/path/_common/constants.ts
Download https://deno.land/std@0.210.0/path/posix/from_file_url.ts
Download https://deno.land/std@0.210.0/path/windows/from_file_url.ts
Download https://deno.land/std@0.210.0/path/posix/basename.ts
Download https://deno.land/std@0.210.0/path/windows/basename.ts
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/zip-entry-stream.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/util/decode-text.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/codecs/crc32.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/zip-entry.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/util/encode-text.js
Download https://esm.sh/v128/cross-fetch@3.1.8/denonext/cross-fetch.mjs
Download https://esm.sh/v128/graphql@16.7.1/denonext/graphql.mjs
Download https://esm.sh/v128/graphql-request@6.1.0/denonext/graphql-request.mjs
Download https://esm.sh/v135/graphql-tag@2.12.6/denonext/graphql-tag.mjs
Download https://esm.sh/v135/graphql-request@6.1.0/denonext/graphql-request.mjs
Download https://esm.sh/v135/node-color-log@10.0.2/denonext/node-color-log.mjs
Download https://esm.sh/v135/adm-zip@0.5.10/denonext/adm-zip.mjs
Download https://esm.sh/v135/env-paths@3.0.0/denonext/env-paths.mjs
Download https://esm.sh/v135/execa@8.0.1/denonext/execa.mjs
Download https://esm.sh/v135/node_fetch.js
Download https://esm.sh/v135/tar@6.2.0/denonext/tar.mjs
Download https://esm.sh/v135/@dagger.io/dagger@0.9.3/denonext/dagger.mjs
Download https://deno.land/std@0.205.0/assert/assertion_error.ts
Download https://deno.land/std@0.129.0/fmt/colors.ts
Download https://deno.land/std@0.129.0/testing/_diff.ts
Download https://deno.land/x/tty@0.1.4/tty_async.ts
Download https://deno.land/x/tty@0.1.4/tty_sync.ts
Download https://deno.land/x/tty@0.1.4/wcwidth.ts
Download https://deno.land/x/tty@0.1.4/ansi_regex.ts
Download https://deno.land/x/tty@0.1.4/strip_ansi.ts
Download https://deno.land/x/tty@0.1.4/is_interactive.ts
Download https://deno.land/x/docker_names@v1.1.0/rand.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/table/deps.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/table/consume_words.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/table/_utils.ts
Download https://deno.land/std@0.99.0/_util/os.ts
Download https://deno.land/std@0.99.0/path/win32.ts
Download https://deno.land/std@0.99.0/path/posix.ts
Download https://deno.land/std@0.99.0/path/common.ts
Download https://deno.land/std@0.99.0/path/separator.ts
Download https://deno.land/std@0.99.0/path/_interface.ts
Download https://deno.land/std@0.99.0/path/glob.ts
Download https://deno.land/x/zod@v3.22.2/locales/en.ts
Download https://deno.land/x/zod@v3.22.2/helpers/enumUtil.ts
Download https://deno.land/x/zod@v3.22.2/helpers/errorUtil.ts
Download https://deno.land/x/zod@v3.22.2/helpers/partialUtil.ts
Download https://deno.land/std@0.133.0/_util/os.ts
Download https://deno.land/std@0.133.0/path/win32.ts
Download https://deno.land/std@0.133.0/path/posix.ts
Download https://deno.land/std@0.133.0/path/common.ts
Download https://deno.land/std@0.133.0/path/separator.ts
Download https://deno.land/std@0.133.0/path/_interface.ts
Download https://deno.land/std@0.133.0/path/glob.ts
Download https://deno.land/std@0.133.0/fs/empty_dir.ts
Download https://deno.land/std@0.133.0/fs/ensure_dir.ts
Download https://deno.land/std@0.133.0/fs/ensure_file.ts
Download https://deno.land/std@0.133.0/fs/ensure_link.ts
Download https://deno.land/std@0.133.0/fs/ensure_symlink.ts
Download https://deno.land/std@0.133.0/fs/exists.ts
Download https://deno.land/std@0.133.0/fs/expand_glob.ts
Download https://deno.land/std@0.133.0/fs/move.ts
Download https://deno.land/std@0.133.0/fs/copy.ts
Download https://deno.land/std@0.133.0/fs/walk.ts
Download https://deno.land/std@0.133.0/fs/eol.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.3/ansi/deps.ts
Download https://deno.land/std@0.196.0/path/_constants.ts
Download https://deno.land/std@0.196.0/path/_util.ts
Download https://deno.land/std@0.196.0/assert/assert.ts
Download https://deno.land/std@0.204.0/path/_common/assert_path.ts
Download https://deno.land/std@0.204.0/path/posix/normalize.ts
Download https://deno.land/std@0.204.0/assert/assert.ts
Download https://deno.land/std@0.204.0/path/windows/_util.ts
Download https://deno.land/std@0.204.0/path/windows/normalize.ts
Download https://deno.land/std@0.210.0/assert/assertion_error.ts
Download https://deno.land/std@0.210.0/path/_common/from_file_url.ts
Download https://deno.land/std@0.210.0/path/_common/basename.ts
Download https://deno.land/std@0.210.0/path/_common/strip_trailing_separators.ts
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/crc32-stream.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/aes-crypto-stream.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/zip-crypto-stream.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/common-crypto.js
Download https://deno.land/x/zipjs@v2.7.32/lib/core/util/cp437-decode.js
Download https://deno.land/x/xhr@0.3.0/mod.ts
Download https://esm.sh/v135/tslib@2.6.2/denonext/tslib.mjs
Download https://esm.sh/v135/graphql@16.8.1/denonext/graphql.mjs
Download https://esm.sh/v135/cross-fetch@3.1.8/denonext/cross-fetch.mjs
Download https://esm.sh/v135/original-fs@1.2.0/denonext/original-fs.mjs
Download https://esm.sh/v135/cross-spawn@7.0.3/denonext/cross-spawn.mjs
Download https://esm.sh/v135/strip-final-newline@3.0.0/denonext/strip-final-newline.mjs
Download https://esm.sh/v135/npm-run-path@5.1.0/denonext/npm-run-path.mjs
Download https://esm.sh/v135/onetime@6.0.0/denonext/onetime.mjs
Download https://esm.sh/v135/human-signals@5.0.0/denonext/human-signals.mjs
Download https://esm.sh/v135/signal-exit@4.1.0/denonext/signal-exit.mjs
Download https://esm.sh/v135/is-stream@3.0.0/denonext/is-stream.mjs
Download https://esm.sh/v135/get-stream@8.0.1/denonext/get-stream.mjs
Download https://esm.sh/v135/merge-stream@2.0.0/denonext/merge-stream.mjs
Download https://esm.sh/v135/minipass@5.0.0/denonext/minipass.mjs
Download https://esm.sh/v135/fs-minipass@2.1.0/denonext/fs-minipass.mjs
Download https://esm.sh/v135/minizlib@2.1.2/denonext/minizlib.mjs
Download https://esm.sh/v135/yallist@4.0.0/denonext/yallist.mjs
Download https://esm.sh/v135/mkdirp@1.0.4/denonext/mkdirp.mjs
Download https://esm.sh/v135/chownr@2.0.0/denonext/chownr.mjs
Download https://deno.land/x/tty@0.1.4/util.ts
Download https://deno.land/x/tty@0.1.4/combining.ts
Download https://deno.land/std@0.196.0/console/unicode_width.ts
Download https://deno.land/x/cliffy@v1.0.0-rc.2/table/deps.ts
Download https://deno.land/std@0.99.0/path/_constants.ts
Download https://deno.land/std@0.99.0/path/_util.ts
Download https://deno.land/std@0.99.0/_util/assert.ts
Download https://deno.land/std@0.133.0/path/_constants.ts
Download https://deno.land/std@0.133.0/path/_util.ts
Download https://deno.land/std@0.133.0/_util/assert.ts
Download https://deno.land/std@0.133.0/fs/_util.ts
Download https://deno.land/std@0.133.0/_deno_unstable.ts
Download https://deno.land/std@0.196.0/encoding/base64.ts
Download https://deno.land/std@0.196.0/assert/assertion_error.ts
Download https://deno.land/std@0.204.0/path/_common/normalize.ts
Download https://deno.land/std@0.204.0/path/_common/normalize_string.ts
Download https://deno.land/std@0.204.0/path/posix/_util.ts
Download https://deno.land/std@0.204.0/assert/assertion_error.ts
Download https://deno.land/std@0.204.0/path/_common/constants.ts
Download https://deno.land/x/zipjs@v2.7.32/lib/core/streams/codecs/sjcl.js
Download https://deno.land/std@0.150.0/media_types/mod.ts
Download https://esm.sh/v135/shebang-command@2.0.0/denonext/shebang-command.mjs
Download https://esm.sh/v135/which@2.0.2/denonext/which.mjs
Download https://esm.sh/v135/path-key@3.1.1/denonext/path-key.mjs
Download https://esm.sh/v135/path-key@4.0.0/denonext/path-key.mjs
Download https://esm.sh/v135/mimic-fn@4.0.0/denonext/mimic-fn.mjs
Download https://esm.sh/v135/minipass@3.3.6/denonext/minipass.mjs
Download https://deno.land/std@0.196.0/console/_data.json
Download https://deno.land/std@0.196.0/console/_rle.ts
Download https://deno.land/std@0.192.0/console/unicode_width.ts
Download https://deno.land/std@0.150.0/media_types/vendor/mime-db.v1.52.0.ts
Download https://deno.land/std@0.150.0/media_types/_util.ts
Download https://esm.sh/v135/shebang-regex@3.0.0/denonext/shebang-regex.mjs
Download https://esm.sh/v135/isexe@2.0.0/denonext/isexe.mjs
Download https://deno.land/std@0.192.0/console/_data.json
Download https://deno.land/std@0.192.0/console/_rle.ts
Download https://deno.land/std@0.192.0/_util/asserts.ts
Download https://registry.npmjs.org/dayjs
Download https://registry.npmjs.org/buffer
Download https://registry.npmjs.org/typescript
Download https://registry.npmjs.org/base64-js
Download https://registry.npmjs.org/ieee754
Download https://registry.npmjs.org/dayjs/-/dayjs-1.11.10.tgz
Download https://registry.npmjs.org/buffer/-/buffer-6.0.3.tgz
Download https://registry.npmjs.org/typescript/-/typescript-5.3.3.tgz
Download https://registry.npmjs.org/ieee754/-/ieee754-1.2.1.tgz
Download https://registry.npmjs.org/base64-js/-/base64-js-1.5.1.tgz
fluentci 0.11.6
`;
