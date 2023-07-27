## Fluent CI CLI

[![deno module](https://shield.deno.dev/x/fluentci)](https://deno.land/x/fluentci)
![deno compatibility](https://shield.deno.dev/deno/^1.34)

Fluent CI is a CI/CD tool that allows you to build, test, and deploy your code. It is a self-hosted solution built on top of [Dagger](https://dagger.io) and [Deno](https://deno.land/), can be run locally or on a server, and is completely free and open-source.

It is also a registry of pre-built pipelines that you can use to build, test, and deploy your code. This means you don't have to write your CI/CD configuration from scratch. You can simply search for and use pipelines that others have already built for frameworks like Django, React, Node, etc.


### 🚚 Installation

```bash
deno install -A -r https://cli.fluentci.io -n fluentci
```

### ✨ Quick Start

Setup a new pipeline in your current directory and run it by using the following commands:

```bash
fluentci init # Initialize a new pipeline in the current directory
dagger run fluentci . # Run the pipeline
```

### 🚀 Usage

```bash
fluentci --help

Usage:   fluentci <pipeline>
Version: 0.1.0              

Description:

                                                                                      
      ______              __  _________                                                
     / __/ /_ _____ ___  / /_/ ___/  _/                                                
    / _// / // / -_) _ \/ __/ /___/ /                                                  
   /_/ /_/\_,_/\__/_//_/\__/\___/___/                                                  
                                                                                       
  FluentCI CLI - An Open Source CI/CD tool written in TypeScript (Deno) based on Dagger

Options:

  -h, --help     - Show this help.                            
  -V, --version  - Show the version number for this program.  

Commands:

  init     [pipeline-name]  - Initialize a new pipeline                 
  search   <query>          - Search for reusable pipelines             
  upgrade                   - Upgrade FluentCI CLI to the latest version

```

### 📚 Documentation

[View the full documentation](https://docs.fluentci.io)

### 🤝 Contributing

We would love to hear your feedback or suggestions. The best way to reach us is on [Discord](https://discord.gg/H7M28d9dRk).

We also welcome pull requests into this repo. See [CONTRIBUTING.md](CONTRIBUTING.md) for information on setting up this repo locally.