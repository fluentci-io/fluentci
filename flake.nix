{
  description = "FluentCI CLI with its embedded Wasm engine and Studio";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    utils.url = "github:numtide/flake-utils";
    crane.url = "github:ipetkov/crane";
    bun2nix = {
      url = "github:nix-community/bun2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, utils, crane, bun2nix }:
    utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ] (system:
      let
        pkgs = import nixpkgs { inherit system; };
        lib = pkgs.lib;
        craneLib = crane.mkLib pkgs;
        bunLib = bun2nix.packages.${system}.default;
        manifest = builtins.fromTOML (builtins.readFile ./Cargo.toml);
        version = manifest.package.version;
        bunFetchers = import ./nix/bun-deps.nix { inherit (pkgs) fetchurl; };
        lockMatches = bunFetchers.lockfileHash == builtins.hashFile "sha256" ./bun.lock;

        # Keep generated build trees and unrelated application sources out of both
        # derivations. All workspace manifests are needed by Bun's frozen lockfile.
        studioSource = lib.fileset.toSource {
          root = ./.;
          fileset = lib.fileset.unions [
            ./package.json ./bun.lock ./webui/package.json ./webui/tsconfig.json
            ./webui/tsconfig.node.json ./webui/vite.config.ts ./webui/index.html
            ./webui/src ./webui/public ./webui/tests
            ./apps/api/package.json ./apps/landing/package.json
            ./docs/package.json ./desktop/package.json
          ];
        };
        studio = assert lib.assertMsg lockMatches "Regenerate nix/bun-deps.nix with bun scripts/generate-bun-nix.mjs";
          pkgs.stdenvNoCC.mkDerivation {
            pname = "fluentci-studio-assets";
            inherit version;
            src = studioSource;
            nativeBuildInputs = [ pkgs.bun pkgs.nodejs_24 bunLib.hook ];
            bunDeps = bunLib.fetchBunDeps { bunNix = ./nix/bun-deps.nix; };
            bunInstallFlags = [ "--frozen-lockfile" "--offline" "--filter=fluentci-studio" "--linker=hoisted" ]
              ++ lib.optionals pkgs.stdenv.hostPlatform.isDarwin [ "--backend=copyfile" ];
            LD_LIBRARY_PATH = lib.optionalString pkgs.stdenv.hostPlatform.isLinux
              (lib.makeLibraryPath [ pkgs.stdenv.cc.cc.lib ]);
            dontRunLifecycleScripts = true;
            dontUseBunBuild = true;
            dontUseBunCheck = true;
            dontUseBunInstall = true;
            buildPhase = ''
              runHook preBuild
              bun run --cwd webui build:web
              runHook postBuild
            '';
            installPhase = ''
              runHook preInstall
              mkdir -p "$out"
              cp -R webui/dist/. "$out/"
              runHook postInstall
            '';
          };
        rustSource = lib.fileset.toSource {
          root = ./.;
          fileset = lib.fileset.unions [
            ./Cargo.toml ./Cargo.lock ./build.rs ./src ./migrations
            ./templates/sdk ./engine
          ];
        };
        commonArgs = {
          pname = "fluentci";
          inherit version;
          src = rustSource;
          cargoVendorDir = craneLib.vendorCargoDeps { cargoLock = ./Cargo.lock; };
          strictDeps = true;
          cargoExtraArgs = "--locked -p fluentci --bin fluentci";
          doCheck = false;
          nativeBuildInputs = [ pkgs.pkg-config pkgs.cmake pkgs.perl ];
          buildInputs = [ pkgs.openssl ]
            ++ lib.optionals pkgs.stdenv.hostPlatform.isDarwin [ pkgs.libiconv ];
          # Keep CI memory bounded while compiling Wasmtime and AWS SDK crates.
          CARGO_BUILD_JOBS = "2";
        };
        # Registry crates depend on the real public Wasmtime API. Preserve our
        # patched vendor crate when Crane stubs the workspace for dependency caching.
        dummySrc = craneLib.mkDummySrc {
          src = rustSource;
          extraDummyScript = ''
            rm -rf "$out/engine/vendor/wasmtime"
            mkdir -p "$out/engine/vendor"
            cp -R ${./engine/vendor/wasmtime} "$out/engine/vendor/wasmtime"
          '';
        };
        cargoArtifacts = craneLib.buildDepsOnly ((builtins.removeAttrs commonArgs [ "src" ]) // { inherit dummySrc; });
        fluentci = craneLib.buildPackage (commonArgs // {
          inherit cargoArtifacts;
          preBuild = ''
            mkdir -p webui/dist
            cp -R ${studio}/. webui/dist/
          '';
          meta = {
            description = manifest.package.description;
            homepage = "https://fluentci.io";
            license = lib.licenses.mpl20;
            mainProgram = "fluentci";
            platforms = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
          };
        });
      in {
        packages = { inherit fluentci studio; default = fluentci; };
        apps.default = { type = "app"; program = "${fluentci}/bin/fluentci"; };
        checks = { inherit fluentci studio; };
        formatter = pkgs.nixfmt;
        devShells.default = craneLib.devShell {
          packages = [ pkgs.bun pkgs.nodejs_24 pkgs.pkg-config pkgs.openssl pkgs.cmake pkgs.perl ];
        };
      });
}
