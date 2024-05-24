# Fluent CI CLI

[![FlakeHub](https://img.shields.io/endpoint?url=https://flakehub.com/f/fluentci-io/fluentci/badge)](https://flakehub.com/flake/fluentci-io/fluentci)
[![flakestry.dev](https://flakestry.dev/api/badge/flake/github/fluentci-io/fluentci)](https://flakestry.dev/flake/github/fluentci-io/fluentci)
[![deno module](https://shield.deno.dev/x/fluentci)](https://deno.land/x/fluentci)
![deno compatibility](https://shield.deno.dev/deno/^1.40)
[![discord](https://img.shields.io/discord/1132020671262773358?label=discord&logo=discord&color=5865F2)](https://discord.gg/V4U6dPskKc)

![Made with VHS](https://vhs.charm.sh/vhs-f5jk3sceXQrc55XC4fW3c.gif)

Fluent CI is a CI/CD tool that allows you to build, test, and deploy your code. It is a self-hosted solution built on top of [Dagger](https://dagger.io), [Wasm](https://webassembly.org/) and [Deno](https://deno.com/), can be run locally or on a server, and is completely free and open-source.

It is also a registry of pre-built pipelines. This means you don't have to write your CI/CD configuration from scratch. You can simply search for and use pipelines that others have already built for frameworks like Django, React, Node, etc.

<br clear="both"/>

<p align="left">
    <a href="https://devhunt.org/tool/fluent-ci" title="DevHunt - Tool of the Week" target="_blank"><img src="https://cdn.jsdelivr.net/gh/fluent-ci-templates/.github@main/assets/images/tab_solid.png" width=225 alt="DevHunt - Tool of the Week" /></a>&nbsp;
</p>

## 🚚 Installation

using [Deno](https://deno.com) (recommended) :

```bash
deno install -A -g -r https://cli.fluentci.io -n fluentci
```

using Bash (Linux/macOS) :

```bash
curl -fsSL https://cli.fluentci.io | bash
```

using [Homebrew](https://brew.sh) :

```bash
brew install fluentci-io/tap/fluentci
```

using [Pkgx](https://pkgx.sh/) :

```bash
pkgx install fluentci
```

using [Nix](https://nixos.org) :

```bash
nix profile install --experimental-features "nix-command flakes" github:fluentci-io/fluentci
```

using [Docker](https://www.docker.com) :

```bash
docker run --privileged \
-v /var/run/docker.sock:/var/run/docker.sock \
-it ghcr.io/fluentci-io/cli:latest run base_pipeline
```

Or download the binary from the [releases page](https://github.com/fluentci-io/fluentci/releases) and add it to your PATH.

Requirements:
- [Deno](https://deno.com) 1.37 or higher. See [Deno Installation](https://deno.land/manual/getting_started/installation) for more information.
- [Dagger](https://dagger.io) 0.9.7 or higher. See [Dagger Installation](https://docs.dagger.io/cli/465058/install) for more information.


## ✨ Quick Start

Setup a new pipeline in your current directory and run it by using the following commands:

```bash
fluentci init # Initialize a new pipeline in the current directory
fluentci # Run the pipeline
```

## 🚀 Usage

```bash
fluentci --help

Usage:   fluentci [pipeline] [jobs...]
Version: 0.13.2

Description:

  .                                                                                    
      ______              __  _________                                                
     / __/ /_ _____ ___  / /_/ ___/  _/                                                
    / _// / // / -_) _ \/ __/ /___/ /                                                  
   /_/ /_/\_,_/\__/_//_/\__/\___/___/                                                  
                                                                                       
  FluentCI CLI - An Open Source CI/CD tool written in TypeScript (Deno) based on Dagger

Options:

  -h, --help     - Show this help.                            
  -V, --version  - Show the version number for this program.  
  -r, --reload   - Reload pipeline source cache               

Commands:
  
  run            <pipeline> [jobs...]  - Run a pipeline
  init           [pipeline-name]       - Initialize a new pipeline                 
  search         <query>               - Search for reusable pipelines             
  upgrade                              - Upgrade FluentCI CLI to the latest version
  cache          <pipeline>            - Cache and compile remote dependencies of a pipeline
  ls, list       [pipeline]            - List all jobs in a pipeline               
  gh, github                           - GitHub Actions integration                
  gl, gitlab                           - GitLab CI integration                     
  cci, circleci                        - CircleCI integration                      
  ap, azure                            - Azure Pipelines integration               
  ac, aws                              - AWS CodePipeline integration  
  docs, man      [pipeline]            - Show documentation for a pipeline
  doctor                               - Check if FluentCI CLI is installed correctly
  env                                  - Show environment variables (read from .fluentci/.env file)
  login                                - Login to FluentCI                                         
  publish                              - Publish a pipeline to FluentCI Registry                   
  agent                                - Start FluentCI Runner Agent 
  whoami                               - Show current logged in user
  repl           [pipelines...]        - Start FluentCI REPL   
```

## 🧑‍💻 FluentCI REPL

<img src="https://vhs.charm.sh/vhs-1MJWuxoyaLKEOUIHPJwCRT.gif" alt="Made with VHS">
<a href="https://vhs.charm.sh">
  <img src="https://stuff.charm.sh/vhs/badge.svg">
</a>

## 📚 Documentation

[View the full documentation](https://docs.fluentci.io)

## 🤝 Contributing

We would love to hear your feedback or suggestions. The best way to reach us is on [Discord](https://discord.gg/H7M28d9dRk).

We also welcome pull requests into this repo. See [CONTRIBUTING.md](CONTRIBUTING.md) for information on setting up this repo locally.
