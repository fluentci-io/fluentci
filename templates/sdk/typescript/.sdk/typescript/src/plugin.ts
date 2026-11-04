// @ts-nocheck


declare type I64 = {
  offset: I64;
};

declare const Host: {
  getFunctions: () => {
    cache: (ptr: I64) => I64;
    directory: (ptr: I64) => I64;
    entries: (ptr: I64) => I64;
    devbox: () => I64;
    devenv: () => I64;
    flox: () => I64;
    nix: (ptr: I64) => I64;
    pkgx: () => I64;
    pixi: () => I64;
    pipeline: (ptr: I64) => I64;
    mise: () => I64;
    envhub: () => I64;
    proto: () => I64;
    hermit: () => I64;
    install: () => void;
    trust: (ptr: I64) => void;
    tar_czvf: (ptr: I64) => I64;
    zip: (ptr: I64) => I64;
    with_exec: (ptr: I64) => void;
    with_workdir: (ptr: I64) => void;
    with_cache: (ptr: I64) => void;
    with_file: (ptr: I64) => void;
    stdout: () => I64;
    stderr: () => I64;
    set_runner: (ptr: I64) => void;
    file: (ptr: I64) => I64;
    unzip: (ptr: I64) => I64;
    tar_xzvf: (ptr: I64) => I64;
    git: (ptr: I64) => I64;
    branch: (ptr: I64) => void;
    commit: () => I64;
    tree: () => I64;
    http: (ptr: I64) => I64;
    md5: (ptr: I64) => I64;
    sha256: (ptr: I64) => I64;
    get_env: (ptr: I64) => I64;
    set_envs: (ptr: I64) => void;
    has_env: (ptr: I64) => I64;
    remove_env: (ptr: I64) => void;
    get_os: () => I64;
    get_arch: () => I64;
    call: (ptr: I64) => I64;
    as_service: (ptr: I64) => I64;
    with_service: (ptr: I64) => void;
    wait_on: (ptr: I64) => void;
    add_secretmanager: (ptr: I64) => I64;
    get_secret: (ptr: I64) => I64;
    set_secret: (ptr: I64) => I64;
    with_secret_variable: (ptr: I64) => void;
    get_secret_plaintext: (ptr: I64) => I64;
  };
};

const fn = Host.getFunctions();

export const cache: (ptr: I64) => I64 = fn.cache;
export const http: (ptr: I64) => I64 = fn.http;
export const file: (ptr: I64) => I64 = fn.file;
export const directory: (ptr: I64) => I64 = fn.directory;
export const entries: (ptr: I64) => I64 = fn.entries;
export const devbox: () => I64 = fn.devbox;
export const devenv: () => I64 = fn.devenv;
export const flox: () => I64 = fn.flox;
export const nix: (ptr: I64) => I64 = fn.nix;
export const pkgx: () => I64 = fn.pkgx;
export const pipeline: (ptr: I64) => I64 = fn.pipeline;
export const pixi: () => I64 = fn.pixi;
export const mise: () => I64 = fn.mise;
export const envhub: () => I64 = fn.envhub;
export const proto: () => I64 = fn.proto;
export const hermit: () => I64 = fn.hermit;
export const install: () => void = fn.install;
export const tar_czvf: (ptr: I64) => I64 = fn.tar_czvf;
export const zip: (ptr: I64) => I64 = fn.zip;
export const trust: (ptr: I64) => void = fn.trust;
export const with_exec: (ptr: I64) => void = fn.with_exec;
export const with_workdir: (ptr: I64) => void = fn.with_workdir;
export const with_cache: (ptr: I64) => void = fn.with_cache;
export const with_file: (ptr: I64) => void = fn.with_file;
export const stdout: () => I64 = fn.stdout;
export const stderr: () => I64 = fn.stderr;
export const set_runner: (ptr: I64) => void = fn.set_runner;
export const git: (ptr: I64) => I64 = fn.git;
export const branch: (ptr: I64) => void = fn.branch;
export const commit: () => I64 = fn.commit;
export const tree: () => I64 = fn.tree;
export const md5: (ptr: I64) => I64 = fn.md5;
export const sha256: (ptr: I64) => I64 = fn.sha256;
export const unzip: (ptr: I64) => I64 = fn.unzip;
export const tar_xzvf: (ptr: I64) => I64 = fn.tar_xzvf;
export const get_env: (ptr: I64) => I64 = fn.get_env;
export const set_envs: (ptr: I64) => void = fn.set_envs;
export const has_env: (ptr: I64) => I64 = fn.has_env;
export const remove_env: (ptr: I64) => void = fn.remove_env;
export const get_os: () => I64 = fn.get_os;
export const get_arch: () => I64 = fn.get_arch;
export const call: (ptr: I64) => I64 = fn.call;
export const as_service: (ptr: I64) => I64 = fn.as_service;
export const with_service: (ptr: I64) => void = fn.with_service;
export const wait_on: (ptr: I64) => void = fn.wait_on;
export const add_secretmanager: (ptr: I64) => I64 = fn.add_secretmanager;
export const get_secret: (ptr: I64) => I64 = fn.get_secret;
export const set_secret: (ptr: I64) => I64 = fn.set_secret;
export const with_secret_variable: (ptr: I64) => void = fn.with_secret_variable;
export const get_secret_plaintext: (ptr: I64) => I64 = fn.get_secret_plaintext;

export interface NixArgs {
  impure?: boolean;
}

class BaseClient {
  constructor() {}
}

/**
 * Root of the DAG client.
 */
export class Client extends BaseClient {
  /**
   * Creates a named sub-pipeline.
   *
   * ```ts
   *  dag.pipeline("my-pipeline").withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string} name Name of the sub-pipeline
   * @returns {Pipeline}
   */
  pipeline = (name: string): Pipeline => {
    let mem = Memory.fromString(name);
    const offset = pipeline(mem.offset);

    const response = Memory.find(offset).readJsonObject();

    return new Pipeline({
      id: response.id,
    });
  };

  /**
   * Adds a cache
   *
   * ```ts
   * dag.cache("my-cache").key();
   * ```
   *
   * @param {string} key Unique key for the cache
   * @returns {Cache}
   */
  cache = (key: string): Cache => {
    let mem = Memory.fromString(key);
    const offset = cache(mem.offset);

    const response = Memory.find(offset).readJsonObject();
    return new Cache({
      id: response.id,
      key: response.key,
    });
  };

  /**
   * Setup a new devbox environment
   *
   * ```ts
   * dag.devbox().withExec(["echo", "hello world"]).stdout();
   * ```
   *
   * @returns {Devbox}
   */
  devbox = (): Devbox => {
    const offset = devbox();
    const response = Memory.find(offset).readJsonObject();
    return new Devbox({
      id: response.id,
    });
  };

  /**
   * Returns a Directory object at the given path
   *
   * ```ts
   * dag.directory("/path/to/dir").entries();
   * ```
   *
   * @param path
   * @returns
   */
  directory = (path: string): Directory => {
    let mem = Memory.fromString(path);
    const offset = directory(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new Directory({
      id: response.id,
      path: response.path,
    });
  };

  /**
   * Setup a new envhub environment
   *
   * ```ts
   * dag.envhub().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns
   */
  envhub = (): Envhub => {
    const offset = envhub();
    const response = Memory.find(offset).readJsonObject();
    return new Envhub({
      id: response.id,
    });
  };

  /**
   * Setup a new flox environment
   *
   * ```ts
   * dag.flox().withExec(["echo", "hello world"]).stdout();
   * ```
   *
   * @returns
   */
  flox = (): Flox => {
    const offset = flox();
    const response = Memory.find(offset).readJsonObject();
    return new Flox({
      id: response.id,
    });
  };

  /**
   * Return a Git Repository from the given URL
   * ```ts
   * dag.git("https://github.com/tsirysndr/me").branch("main").commit();
   * ```
   * @param url
   * @returns
   */
  git = (url: string): Git => {
    let mem = Memory.fromString(url);
    const offset = git(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new Git({
      id: response.id,
    });
  };

  /**
   * Return a File object from the given path
   * ts```
   * dag.file("/path/to/file");
   * ```
   * @param path
   * @returns
   */
  file = (path: string): File => {
    let mem = Memory.fromString(path);
    const offset = file(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new File({
      id: response.id,
      path: response.path,
    });
  };

  /**
   * Setup a new nix environment
   * ```ts
   * dag.nix().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns
   */
  nix = (args?: NixArgs): Nix => {
    const mem = Memory.fromJsonObject(args || { impure: false });
    const offset = nix(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new Nix({
      id: response.id,
    });
  };

  /**
   * Get a File object from the given URL
   * ```ts
   * dag.http("https://example.com/file.txt");
   * ```
   * @param url
   * @returns
   */
  http = (url: string): File => {
    let mem = Memory.fromString(url);
    const offset = http(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new File({
      id: response.id,
      path: response.path,
    });
  };

  /**
   * Setup a new mise environment
   * ```ts
   * dag.mise().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns
   */
  mise = (): Mise => {
    const offset = mise();
    const response = Memory.find(offset).readJsonObject();
    return new Mise({
      id: response.id,
    });
  };

  /**
   * Setup a new pixi environment
   * ```ts
   * dag.pixi().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns
   */
  pixi = (): Pixi => {
    const offset = pixi();

    const response = Memory.find(offset).readJsonObject();
    return new Pixi({
      id: response.id,
    });
  };

  /**
   * Setup a new pkgx environment
   * ```ts
   * dag.pkgx().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns
   */
  pkgx = (): Pkgx => {
    const offset = pkgx();
    const response = Memory.find(offset).readJsonObject();
    return new Pkgx({
      id: response.id,
    });
  };

  /**
   * Setup a new proto environment
   * ```ts
   * dag.proto().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns
   */
  proto = (): Proto => {
    const offset = proto();
    const response = Memory.find(offset).readJsonObject();
    return new Proto({
      id: response.id,
    });
  };

  /**
   * Setup a new hermit environment
   * ```ts
   * dag.hermit().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns
   */
  hermit = (): Hermit => {
    const offset = hermit();
    const response = Memory.find(offset).readJsonObject();
    return new Hermit({
      id: response.id,
    });
  };

  /**
   * Get environment variable
   * ```ts
   * dag.getEnv("ENV_NAME");
   * ```
   * @param name
   * @returns {string}
   */
  getEnv = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = get_env(mem.offset);
    return Memory.find(offset).readString();
  };

  /**
   * Set environment variables
   * ```ts
   * dag.setEnvs({ ENV_NAME: "value" });
   * ```
   * @param envs
   * @returns {void}
   */
  setEnvs = (envs: Record<string, string>): void => {
    const mem = Memory.fromJsonObject(envs);
    set_envs(mem.offset);
  };

  /**
   * Check if an environment variable exists
   * ```ts
   * dag.hasEnv("ENV_NAME");
   * ```
   * @param name
   * @returns {boolean}
   */
  hasEnv = (name: string): boolean => {
    const mem = Memory.fromString(name);
    const offset = has_env(mem.offset);
    const value = Memory.find(offset).readJsonObject();
    return value;
  };

  /**
   * Remove an environment variable
   * ```ts
   * dag.removeEnv("ENV_NAME");
   * ```
   * @param name
   * @returns {void}
   */
  removeEnv = (name: string): void => {
    const mem = Memory.fromString(name);
    remove_env(mem.offset);
  };

  /**
   * Get the operating system
   * ```ts
   * dag.getOS();
   * ```
   * @returns {string}
   */
  getOS = (): string => {
    const offset = get_os();
    return Memory.find(offset).readString();
  };

  /**
   * Get the current cpu architecture
   * ```ts
   * dag.getArch();
   * ```
   * @returns {string}
   */
  getArch = (): string => {
    const offset = get_arch();
    return Memory.find(offset).readString();
  };

  /**
   * Call a function
   * ```ts
   * dag.call("/path/to/wasm/file", "function_name", "args");
   * ```
   * @param {string} url
   * @param {string} func
   * @param {string} args
   * @returns {string}
   */
  call = (url: string, func: string, args: string[]): string => {
    const mem = Memory.fromJsonObject({
      url,
      function: func,
      args: args.join(" "),
    });
    const offset = call(mem.offset);
    return Memory.find(offset).readString();
  };

  googleCloudSecretManager = (
    project: string,
    googleCredentialsFile: string
  ): SecretManager => {
    const mem = Memory.fromJsonObject({
      google_project: project,
      google_credentials_file: googleCredentialsFile,
    });
    const offset = add_secretmanager(mem.offset);
    const { id } = Memory.find(offset).readJsonObject();
    return new SecretManager({ id });
  };

  awsSecretsManager = (
    region: string,
    accessKeyId: string,
    secretAccessKey: string
  ): SecretManager => {
    const mem = Memory.fromJsonObject({
      aws_region: region,
      aws_access_key_id: accessKeyId,
      aws_secret_access_key: secretAccessKey,
    });
    const offset = add_secretmanager(mem.offset);
    const { id } = Memory.find(offset).readJsonObject();
    return new SecretManager({ id });
  };

  azureKeyvault = (
    clientId: string,
    clientSecret: string,
    tenantId: string,
    keyvaultName: string,
    keyvaultUrl: string
  ): SecretManager => {
    const mem = Memory.fromJsonObject({
      azure_client_id: clientId,
      azure_client_secret: clientSecret,
      azure_tenant_id: tenantId,
      azure_keyvault_name: keyvaultName,
      azure_keyvault_url: keyvaultUrl,
    });
    const offset = add_secretmanager(mem.offset);
    const { id } = Memory.find(offset).readJsonObject();
    return new SecretManager({ id });
  };

  hashicorpVault = (
    address: string,
    token: string,
    cacerts: string
  ): SecretManager => {
    const mem = Memory.fromJsonObject({
      vault_address: address,
      vault_token: token,
      vault_cacerts: cacerts,
    });
    const offset = add_secretmanager(mem.offset);
    const { id } = Memory.find(offset).readJsonObject();
    return new SecretManager({ id });
  };

  setSecret = (name: string, value: string): Secret => {
    const mem = Memory.fromJsonObject([name, value]);
    const offset = set_secret(mem.offset);
    const id = Memory.find(offset).readString();
    return new Secret({ id });
  };
}

export class SecretManager extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  id = (): string => {
    return this._id!;
  };

  getSecret = (name: string): Secret[] => {
    const mem = Memory.fromString(name);
    const offset = get_secret(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response;
  };
}

export class Secret extends BaseClient {
  private _id?: string;
  private _plaintext?: string;
  private _name?: string;
  private _mount?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  id = (): string => {
    return this._id!;
  };

  plaintext = (): string => {
    return this._plaintext!;
  };

  name = (): string => {
    return this._name!;
  };

  mount = (): string => {
    return this._mount!;
  };
}

/**
 * Represents a Cache
 */
export class Cache extends BaseClient {
  private _id?: string;
  private _key?: string;

  constructor({ id, key }: { id: string; key: string }) {
    super();
    this._id = id;
    this._key = key;
  }

  /**
   * Returns the cache id
   * ```ts
   * dag.cache("my-cache").id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Returns the cache key
   * ```ts
   * dag.cache("my-cache").key();
   * ```
   * @returns {string}
   */
  key = (): string => {
    return this._key!;
  };
}

/**
 * Represents an Devbox environment
 */
export class Devbox extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the devbox id
   * ```ts
   * dag.devbox().id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Setup a new exec command
   * ```ts
   * dag.devbox().withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Devbox}
   */
  withExec = (args: string[]): Devbox => {
    let mem = Memory.fromString("devbox");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.devbox().waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Devbox}
   */
  waitOn = (port: number, timeout = 60): Devbox => {
    let mem = Memory.fromString("devbox");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.devbox().withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Devbox}
   */
  withWorkdir = (path: string): Devbox => {
    let mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.devbox().withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Devbox} Devbox
   */
  withCache = (path: string, cacheId: string): Devbox => {
    let mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Build a service
   * ```ts
   *  dag.devbox().withExec(["ping", "google.com"]).asService("ping");
   * ```
   *
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  /**
   * Add a service
   * ```ts
   *  dag.devbox().withService("service-id");
   * ```
   *
   * @param {string} serviceId
   * @returns {Devbox}
   */
  withService = (serviceId: string): Devbox => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  withEnvVariable = (name: string, value: string): Devbox => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Devbox => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.devbox().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();

    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.devbox().withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

/**
 * Represents a Devenv environment
 */
export class Devenv extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the devenv id
   * ```ts
   * dag.devenv().id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Setup a new exec command
   * ```ts
   * dag.devenv().withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Devenv}
   */
  withExec = (args: string[]): Devenv => {
    let mem = Memory.fromString("devenv");
    set_runner(mem.offset);

    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.devenv().waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Devenv}
   */
  waitOn = (port: number, timeout = 60): Devenv => {
    let mem = Memory.fromString("devenv");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.devenv().withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Devenv}
   */
  withWorkdir = (path: string): Devenv => {
    let mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.devenv().withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Devenv} Devenv
   */
  withCache = (path: string, cacheId: string): Devenv => {
    let mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Setup a service
   * ```ts
   * dag.devenv().withExec(["ping", "google.com"]).asService("ping");
   * ```
   *
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  /**
   * Add a service
   * ```ts
   * dag.devenv().withService("service-id");
   * ```
   * @param {string} serviceId
   * @returns
   */
  withService = (serviceId: string): Devenv => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  /**
   * Add an environment variable
   * ```ts
   * dag.devenv().withEnvVariable("ENV_NAME", "value");
   *  ```
   *
   * @param name
   * @param value
   * @returns {Devenv}
   */
  withEnvVariable = (name: string, value: string): Devenv => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Devenv => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   *
   * ```ts
   *  dag.devenv().withExec(["echo", "hello world"]).stdout();
   * ```
   *
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();

    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   *  dag.devenv().withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();

    return Memory.find(offset).readString();
  };
}

/**
 * Represents a Directory
 */
export class Directory extends BaseClient {
  private _id?: string;
  private _path?: string;

  constructor({ id, path }: { id: string; path: string }) {
    super();
    this._id = id;
    this._path = path;
  }

  /**
   * Returns the directory id
   * ```ts
   * dag.directory("/path/to/dir").id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Returns the directory path
   * ```ts
   * dag.directory("/path/to/dir").path();
   * ```
   * @returns {string}
   */
  path = (): string => {
    return this._path!;
  };

  /**
   * Returns a Directory object with the given path
   * ```ts
   * dag.directory("/path/to/dir").directory("sub-dir").entries();
   * ```
   * @param {string} path Path to the directory
   * @returns {Directory}
   */
  directory = (path: string): Directory => {
    let mem = Memory.fromString(path);
    const offset = directory(mem.offset);

    const response = Memory.find(offset).readJsonObject();
    return new Directory({
      id: response.id,
      path: response.path,
    });
  };

  /**
   * Returns the list of entries in the directory
   * ```ts
   *  dag.directory("/path/to/dir").entries();
   * ```
   * @returns {string[]}
   */
  entries = (): string[] => {
    const mem = Memory.fromString(this._path!);
    const offset = entries(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response as string[];
  };

  /**
   * Setup a devbox environment
   * ```ts
   * dag.directory("/path/to/dir").devbox().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Devbox}
   */
  devbox = (): Devbox => {
    const offset = devbox();
    const response = Memory.find(offset).readJsonObject();
    return new Devbox({
      id: response.id,
    });
  };

  /**
   * Setup a devenv environment
   * ```ts
   * dag.directory("/path/to/dir").devenv().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Devenv}
   */
  devenv = (): Devenv => {
    const offset = devenv();
    const response = Memory.find(offset).readJsonObject();
    return new Devenv({
      id: response.id,
    });
  };

  /**
   * Setup a flox environment
   * ```ts
   * dag.directory("/path/to/dir").flox().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Flox}
   */
  flox = (): Flox => {
    const offset = flox();
    const response = Memory.find(offset).readJsonObject();
    return new Flox({
      id: response.id,
    });
  };

  /**
   * Setup a nix environment
   * ```ts
   * dag.directory("/path/to/dir").nix().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Nix}
   */
  nix = (args?: NixArgs): Nix => {
    const mem = Memory.fromJsonObject(args || { impure: false });
    const offset = nix(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new Nix({
      id: response.id,
    });
  };

  /**
   * Setup a pkgx environment
   * ```ts
   * dag.directory("/path/to/dir").pkgx().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Pkgx}
   */
  pkgx = (): Pkgx => {
    const offset = pkgx();
    const response = Memory.find(offset).readJsonObject();
    return new Pkgx({
      id: response.id,
    });
  };

  /**
   * Setup a pixi environment
   * ```ts
   * dag.directory("/path/to/dir").pixi().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Pixi}
   */
  pixi = (): Pixi => {
    const offset = pixi();
    const response = Memory.find(offset).readJsonObject();
    return new Pixi({
      id: response.id,
    });
  };

  /**
   * Setup a mise environment
   *
   * ```ts
   * dag.directory("/path/to/dir").mise().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Mise}
   */
  mise = (): Mise => {
    const offset = mise();
    const response = Memory.find(offset).readJsonObject();
    return new Mise({
      id: response.id,
    });
  };

  /**
   * Setup a proto environment
   *
   * ```ts
   * dag.directory("/path/to/dir").proto().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Proto}
   */
  proto = (): Proto => {
    const offset = proto();
    const response = Memory.find(offset).readJsonObject();
    return new Proto({
      id: response.id,
    });
  };

  /**
   * Setup a hermit environment
   *
   * ```ts
   * dag.directory("/path/to/dir").hermit().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Hermit}
   */
  hermit = (): Hermit => {
    const offset = hermit();
    const response = Memory.find(offset).readJsonObject();
    return new Hermit({
      id: response.id,
    });
  };

  /**
   * Setup a envhub environment
   * ```ts
   * dag.directory("/path/to/dir").envhub().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Envhub}
   */
  envhub = (): Envhub => {
    const offset = envhub();
    const response = Memory.find(offset).readJsonObject();
    return new Envhub({
      id: response.id,
    });
  };

  /**
   * Creates a new tar archive from the directory
   * ```ts
   * dag.directory("/path/to/dir").tarCzvf();
   * ```
   * @returns {File}
   */
  tarCzvf = (): File => {
    const mem = Memory.fromString(this._path!);
    const offset = tar_czvf(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new File({
      id: response.id,
      path: response.path,
    });
  };

  /**
   * Creates a new zip archive from the directory
   * ```ts
   * dag.directory("/path/to/dir").zip();
   * ```
   * @returns {File}
   */
  zip = (): File => {
    const mem = Memory.fromString(this._path!);
    const offset = zip(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new File({
      id: response.id,
      path: response.path,
    });
  };

  /**
   * Execute a command in the directory
   * ```ts
   * dag.directory("/path/to/dir").withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Directory}
   */
  withExec = (args: string[]): Directory => {
    const mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.directory("/path/to/dir").waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Directory}
   */
  waitOn = (port: number, timeout = 60): Directory => {
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.directory("/path/to/dir").withWorkdir("/path/to/new/dir").stdout();
   * ```
   * @param {string} path Path to the new working directory
   */
  withWorkdir = (path: string): Directory => {
    const mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.directory("/path/to/dir").withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Directory}
   */
  withCache = (path: string, cacheId: string): Directory => {
    let mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Setup a service
   * ```ts
   * dag.directory("/path/to/dir").withExec(["ping", "google.com"]).asService("ping");
   * ```
   *
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  /**
   * Add a service
   * ```ts
   * dag.directory("/path/to/dir").withService("service-id");
   * ```
   *
   * @param {string} serviceId
   * @returns {Directory}
   */
  withService = (serviceId: string): Directory => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  /**
   * Add an environment variable
   * ```ts
   * dag.directory("/path/to/dir").withEnvVariable("ENV_NAME", "value");
   * ```
   *
   * @param {string} name
   * @param {string} value
   * @returns {Directory}
   */
  withEnvVariable = (name: string, value: string): Directory => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Directory => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.directory("/path/to/dir").withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();
    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.directory("/path/to/dir").withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

/**
 * Represents a Service
 */
export class Service extends BaseClient {
  private _id?: string;

  id = (): string => {
    return this._id!;
  };
}

/**
 * Represents a File
 */
export class File extends BaseClient {
  private _id?: string;
  private _path?: string;

  constructor({ id, path }: { id: string; path: string }) {
    super();
    this._id = id;
    this._path = path;
  }

  /**
   * Returns the file id
   * ```ts
   * dag.file("/path/to/file").id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Returns the file path
   * ```ts
   * dag.file("/path/to/file").path();
   * ```
   * @returns {string}
   */
  path = (): string => {
    return this._path!;
  };

  /**
   * Creates a new zip archive from the file
   * ```ts
   * dag.file("/path/to/file").zip();
   * ```
   * @returns {File}
   */
  zip = (): File => {
    const mem = Memory.fromString(this._path!);
    const offset = zip(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new File({
      id: response.id,
      path: response.path,
    });
  };

  /**
   * Decompress the zip file into a directory
   * ```ts
   * dag.file("/path/to/file.zip").unzip();
   * ```
   * @returns {Directory}
   */
  unzip = (): Directory => {
    const mem = Memory.fromString(this._path!);
    const offset = unzip(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new Directory({
      id: response.id,
      path: response.path,
    });
  };

  /**
   * Decompress the tar file into a directory
   * ```ts
   * dag.file("/path/to/file.tar.gz").tarXzvf();
   * ```
   * @returns {Directory}
   */
  tarXzvf = (): Directory => {
    const mem = Memory.fromString(this._path!);
    const offset = tar_xzvf(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new Directory({
      id: response.id,
      path: response.path,
    });
  };

  /**
   * Returns the md5 hash of the file
   * ```ts
   * dag.file("/path/to/file").md5();
   * ```
   * @returns {string}
   */
  md5 = (): string => {
    const mem = Memory.fromString(this._path!);
    const offset = md5(mem.offset);
    return Memory.find(offset).readString();
  };

  /**
   * Returns the sha256 hash of the file
   * ```ts
   * dag.file("/path/to/file").sha256();
   * ```
   * @returns {string}
   */
  sha256 = (): string => {
    const mem = Memory.fromString(this._path!);
    const offset = sha256(mem.offset);
    return Memory.find(offset).readString();
  };

  /**
   * Change the file mode
   * ```ts
   * dag.file("/path/to/file").chmod("a+x");
   * ```
   * @param {string} mode
   * @returns {File}
   */
  chmod = (mode: string): File => {
    const mem = Memory.fromString(mode);
    chmod(mem.offset);
    return this;
  };
}

/**
 * Represents a Flox environment
 */
export class Flox extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the flox id
   * ```ts
   * dag.flox().id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Execute a command in the flox environment
   * ```ts
   * dag.flox().withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Flox}
   */
  withExec = (args: string[]): Flox => {
    let mem = Memory.fromString("flox");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.flox().waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Flox}
   */
  waitOn = (port: number, timeout = 60): Devbox => {
    let mem = Memory.fromString("flox");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.flox().withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Flox}
   */
  withWorkdir = (path: string): Flox => {
    let mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.flox().withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Flox}
   */
  withCache = (path: string, cacheId: string): Flox => {
    let mem = Memory.fromJsonObject({
      path,
      id: cacheId,
      key: "",
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Setup a service
   * ```ts
   *  dag.flox().withExec(["ping", "google.com"]).asService("ping");
   * ```
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  /**
   * Add a service
   * ```ts
   * dag.flox().withService("service-id");
   * ```
   *
   * @param {string} serviceId
   * @returns {Flox}
   */
  withService = (serviceId: string): Flox => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  /**
   * Add an environment variable
   * ```ts
   * dag.flox().withEnvVariable("ENV_NAME", "value");
   * ```
   * @param {string} name
   * @param {string} value
   * @returns {Flox}
   */
  withEnvVariable = (name: string, value: string): Flox => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Flox => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Create file at the given path
   * ```ts
   * dag.flox().withFile("/path/to/file", "file-id");
   * ```
   * @param {string} path Path to the file
   * @param {String} fileId Unique file identifier
   * @returns {Flox}
   */
  withFile = (path: string, fileId: string): Flox => {
    let mem = Memory.fromJsonObject({
      path,
      id: fileId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.flox().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();
    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.flox().withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

/**
 * Represents a Git Repository
 */
export class Git extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the git id
   * ```ts
   * dag.git("https://github.com/tsirysndr/me").id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Switch to a new branch
   * ```ts
   * dag.git("https://github.com/tsirysndr/me").branch("main");
   * ```
   * @param {string} name Name of the branch
   * @returns {Git}
   */
  branch = (name: string): Git => {
    let mem = Memory.fromString(name);
    branch(mem.offset);
    return this;
  };

  /**
   * Returns the last commit hash
   * ```ts
   * dag.git("https://github.com/tsirysndr/me").commit();
   * ```
   * @returns {string}
   */
  commit = (): string => {
    const offset = commit();

    return Memory.find(offset).readString();
  };

  /**
   * Returns the tree of the repository
   * ```ts
   * dag.git("https://github.com/tsirysndr/me").tree();
   * ```
   * @returns {Directory}
   */
  tree = (): Directory => {
    const offset = tree();

    const response = Memory.find(offset).readJsonObject();
    return new Directory({
      id: response.id,
      path: response.path,
    });
  };
}

/**
 * Represents a Nix environment
 */
export class Nix extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the Nix id
   * ```ts
   * dag.nix().id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Execute a command in the Nix environment
   * ```ts
   * dag.nix().withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Nix}
   */
  withExec = (args: string[]): Nix => {
    let mem = Memory.fromString("nix");
    set_runner(mem.offset);

    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.nix().waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Nix}
   */
  waitOn = (port: number, timeout = 60): Nix => {
    let mem = Memory.fromString("nix");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.nix().withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Nix}
   */
  withWorkdir = (path: string): Nix => {
    let mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.nix().withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Nix}
   */
  withCache = (path: string, cacheId: string): Nix => {
    let mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Setup a service
   * ```ts
   * dag.nix().withExec(["ping", "google.com"]).asService("ping");
   * ```
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  /**
   * Add a service
   * ```ts
   * dag.nix().withService("service-id");
   * ```
   * @param {string} serviceId
   * @returns {Nix}
   */
  withService = (serviceId: string): Nix => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  /**
   * Add an environment variable
   * ```ts
   * dag.nix().withEnvVariable("ENV_NAME", "value");
   * ```
   * @param {string} name
   * @param {string} value
   * @returns {Nix}
   */
  withEnvVariable = (name: string, value: string): Nix => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Nix => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Create file at the given path
   * ```ts
   * dag.nix().withFile("/path/to/file", "file-id");
   * ```
   * @param {string} path Path to the file
   * @param {String} fileId Unique file identifier
   * @returns {Nix}
   */
  withFile = (path: string, fileId: string): Nix => {
    let mem = Memory.fromJsonObject({
      path,
      id: fileId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.nix().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();
    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.nix().withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

/**
 * Represents a named sub-pipeline
 */
export class Pipeline extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the pipeline id
   * ```ts
   * dag.pipeline("my-pipeline").id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Setup a new exec command
   * ```ts
   * dag.pipeline("my-pipeline").withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Devbox}
   */
  devbox = (): Devbox => {
    const offset = devbox();
    const response = Memory.find(offset).readJsonObject();
    return new Devbox({
      id: response.id,
    });
  };

  /**
   * Setup a new devenv environment
   * ```ts
   * dag.pipeline("my-pipeline").devenv().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Devenv}
   */
  devenv = (): Devenv => {
    const offset = devenv();
    const response = Memory.find(offset).readJsonObject();
    return new Devenv({
      id: response.id,
    });
  };

  /**
   * Setup a new flox environment
   * ```ts
   * dag.pipeline("my-pipeline").flox().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Flox}
   */
  flox = (): Flox => {
    const offset = flox();
    const response = Memory.find(offset).readJsonObject();
    return new Flox({
      id: response.id,
    });
  };

  /**
   * Setup a new nix environment
   * ```ts
   * dag.pipeline("my-pipeline").nix().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Nix}
   */
  nix = (args?: NixArgs): Nix => {
    const mem = Memory.fromJsonObject(args || { impure: false });
    const offset = nix(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return new Nix({
      id: response.id,
    });
  };

  /**
   * Setup a new pkgx environment
   * ```ts
   * dag.pipeline("my-pipeline").pkgx().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Pkgx}
   */
  pkgx = (): Pkgx => {
    const offset = pkgx();
    const response = Memory.find(offset).readJsonObject();
    return new Pkgx({
      id: response.id,
    });
  };

  /**
   * Setup a new pixi environment
   * ```ts
   * dag.pipeline("my-pipeline").pixi().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Pixi}
   */
  pixi = (): Pixi => {
    const offset = pixi();
    const response = Memory.find(offset).readJsonObject();
    return new Pixi({
      id: response.id,
    });
  };

  /**
   * Setup a new mise environment
   * ```ts
   * dag.pipeline("my-pipeline").mise().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Mise}
   */
  mise = (): Mise => {
    const offset = mise();

    const response = Memory.find(offset).readJsonObject();
    return new Mise({
      id: response.id,
    });
  };

  /**
   * Setup a new envhub environment
   * ```ts
   * dag.pipeline("my-pipeline").envhub().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Envhub}
   */
  envhub = (): Envhub => {
    const offset = envhub();
    const response = Memory.find(offset).readJsonObject();
    return new Envhub({
      id: response.id,
    });
  };

  /**
   * Setup a new proto environment
   * ```ts
   * dag.pipeline("my-pipeline").proto().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Proto}
   */
  proto = (): Proto => {
    const offset = proto();
    const response = Memory.find(offset).readJsonObject();
    return new Proto({
      id: response.id,
    });
  };

  /**
   * Setup a new hermit environment
   * ```ts
   * dag.pipeline("my-pipeline").envhub().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {Hermit}
   */
  hermit = (): Hermit => {
    const offset = hermit();
    const response = Memory.find(offset).readJsonObject();
    return new Hermit({
      id: response.id,
    });
  };

  /**
   * Execute a command in the pipeline
   * ```ts
   * dag.pipeline("my-pipeline").withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Pipeline}
   */
  withExec = (args: string[]): Pipeline => {
    let mem = Memory.fromString("default");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.pipeline("my-pipeline").waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Pipeline}
   */
  waitOn = (port: number, timeout = 60): Pipeline => {
    let mem = Memory.fromString("default");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.pipeline("my-pipeline").withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Pipeline}
   */
  withWorkdir = (path: string): Pipeline => {
    let mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.pipeline("my-pipeline").withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Pipeline}
   */
  withCache = (path: string, cacheId: string): Pipeline => {
    let mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Setup a service
   * ```ts
   * dag.pipeline("my-pipeline").withExec(["ping", "google.com"]).asService("ping");
   * ```
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  withService = (serviceId: string): Pipeline => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  withEnvVariable = (name: string, value: string): Pipeline => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Pipeline => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Create file at the given path
   * ```ts
   * dag.pipeline("my-pipeline").withFile("/path/to/file", "file-id");
   * ```
   * @param {string} path Path to the file
   * @param {String} fileId Unique file identifier
   * @returns {Pipeline}
   */
  withFile = (path: string, fileId: string): Pipeline => {
    let mem = Memory.fromJsonObject({
      path,
      id: fileId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.pipeline("my-pipeline").withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();
    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.pipeline("my-pipeline").withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

/**
 * Represents a Pkgx environment
 */
export class Pkgx extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the Pkgx id
   * ```ts
   * dag.pkgx().id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Execute a command in the Pkgx environment
   * ```ts
   * dag.pkgx().withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Pkgx}
   */
  withExec = (args: string[]): Pkgx => {
    let mem = Memory.fromString("pkgx");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.pkgx().waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Pkgx}
   */
  waitOn = (port: number, timeout = 60): Pkgx => {
    let mem = Memory.fromString("pkgx");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.pkgx().withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Pkgx}
   */
  withWorkdir = (path: string): Pkgx => {
    let mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.pkgx().withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Pkgx}
   */
  withCache = (path: string, cacheId: string): Pkgx => {
    let mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Setup a service
   * ```ts
   * dag.pkgx().withExec(["ping", "google.com"]).asService("ping");
   * ```
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  /**
   * Add a service
   * ```ts
   * dag.pkgx().withService("service-id");
   * ```
   * @param {string} serviceId
   * @returns {Pkgx}
   */
  withService = (serviceId: string): Pkgx => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  withEnvVariable = (name: string, value: string): Pkgx => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Pkgx => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Create file at the given path
   * ```ts
   * dag.pkgx().withFile("/path/to/file", "file-id");
   * ```
   * @param {string} path Path to the file
   * @param {String} fileId Unique file identifier
   * @returns {Pkgx}
   */
  withFile = (path: string, fileId: string): Pkgx => {
    let mem = Memory.fromJsonObject({
      path,
      id: fileId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Install packages
   * ```ts
   * dag.pkgx().withPackages(["jq", "gh"]);
   * ```
   * @param {string[]} packages List of packages to install
   * @returns {Pkgx}
   */
  withPackages = (packages: string[]): Pkgx => {
    let mem = Memory.fromJsonObject(packages);
    with_packages(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.pkgx().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();
    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.pkgx().withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

/**
 * Represents a Pixi environment
 */
export class Pixi extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the Pixi id
   * ```ts
   * dag.pixi().id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Execute a command in the Pixi environment
   * ```ts
   * dag.pixi().withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Pixi}
   */
  withExec = (args: string[]): Pixi => {
    let mem = Memory.fromString("pixi");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.pixi().waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Pixi}
   */
  waitOn = (port: number, timeout = 60): Pixi => {
    let mem = Memory.fromString("pixi");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.pixi().withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Pixi}
   */
  withWorkdir = (path: string): Pixi => {
    let mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.pixi().withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Pixi}
   */
  withCache = (path: string, cacheId: string): Pixi => {
    let mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Setup a service
   * ```ts
   * dag.pixi().withExec(["ping", "google.com"]).asService("ping");
   * ```
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  withService = (serviceId: string): Pixi => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  withEnvVariable = (name: string, value: string): Pixi => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Pixi => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Create file at the given path
   * ```ts
   * dag.pixi().withFile("/path/to/file", "file-id");
   * ```
   * @param {string} path Path to the file
   * @param {String} fileId Unique file identifier
   * @returns {Pixi}
   */
  withFile = (path: string, fileId: string): Pixi => {
    let mem = Memory.fromJsonObject({
      path,
      id: fileId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.pixi().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();
    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.pixi().withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

/**
 * Represents a Mise environment
 */
export class Mise extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the Mise id
   * ```ts
   * dag.mise().id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Execute a command in the Mise environment
   * ```ts
   * dag.mise().withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Mise}
   */
  withExec = (args: string[]): Mise => {
    let mem = Memory.fromString("mise");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.mise().waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Mise}
   */
  waitOn = (port: number, timeout = 60): Mise => {
    let mem = Memory.fromString("mise");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.mise().withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Mise}
   */
  withWorkdir = (path: string): Mise => {
    let mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.mise().withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Mise}
   */
  withCache = (path: string, cacheId: string): Mise => {
    let mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Setup a service
   * ```ts
   * dag.mise().withExec(["ping", "google.com"]).asService("ping");
   * ```
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  withService = (serviceId: string): Mise => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  withEnvVariable = (name: string, value: string): Mise => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Mise => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Create file at the given path
   * ```ts
   * dag.mise().withFile("/path/to/file", "file-id");
   * ```
   * @param {string} path Path to the file
   * @param {String} fileId Unique file identifier
   * @returns {Mise}
   */
  withFile = (path: string, fileId: string): Mise => {
    let mem = Memory.fromJsonObject({
      path,
      id: fileId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.mise().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();
    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.mise().withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

/**
 * Represents a Envhub environment
 */
export class Envhub extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the Envhub id
   * ```ts
   * dag.envhub().id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Execute a command in the Envhub environment
   * ```ts
   * dag.envhub().withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Envhub}
   */
  withExec = (args: string[]): Envhub => {
    let mem = Memory.fromString("envhub");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.envhub().waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Envhub}
   */
  waitOn = (port: number, timeout = 60): Envhub => {
    let mem = Memory.fromString("devbox");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.envhub().withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Envhub}
   */
  withWorkdir = (path: string): Envhub => {
    let mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.envhub().withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Envhub}
   */
  withCache = (path: string, cacheId: string): Envhub => {
    let mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Build a service
   * ```ts
   * dag.envhub().withExec(["ping", "github.com"]).asService("ping");
   * ```
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  /**
   * Add a service
   * ```ts
   *  dag.envhub().withService("service-id");
   * ```
   *
   * @param {string} serviceId
   * @returns {Envhub}
   */
  withService = (serviceId: string): Envhub => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  /**
   *  Add an environment variable
   * ```ts
   * dag.envhub().withEnvVariable("NAME", "value");
   * ```
   *
   * @param {string} name
   * @param { string} value
   * @returns {Envhub}
   */
  withEnvVariable = (name: string, value: string): Envhub => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Envhub => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Create file at the given path
   * ```ts
   * dag.envhub().withFile("/path/to/file", "file-id");
   * ```
   * @param {string} path Path to the file
   * @param {String} fileId Unique file identifier
   * @returns {Envhub}
   */
  withFile = (path: string, fileId: string): Envhub => {
    const mem = Memory.fromJsonObject({
      path,
      id: fileId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.envhub().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();
    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.envhub().withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

/**
 * Represents a Proto environment
 */
export class Proto extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the Proto id
   * ```ts
   * dag.proto().id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Execute a command in the Proto environment
   * ```ts
   * dag.proto().withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Proto}
   */
  withExec = (args: string[]): Proto => {
    let mem = Memory.fromString("proto");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.proto().waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Proto}
   */
  waitOn = (port: number, timeout = 60): Proto => {
    let mem = Memory.fromString("proto");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.proto().withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Proto}
   */
  withWorkdir = (path: string): Proto => {
    const mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.proto().withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Proto}
   */
  withCache = (path: string, cacheId: string): Proto => {
    const mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Setup a service
   * ```ts
   * dag.proto().withExec(["ping", "google.com"]).asService("ping");
   * ```
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  /**
   * Add a service
   * ```ts
   * dag.proto().withService("service-id");
   * ```
   * @param {string} serviceId
   * @returns {Pkgx}
   */
  withService = (serviceId: string): Proto => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  withEnvVariable = (name: string, value: string): Proto => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Proto => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Create file at the given path
   * ```ts
   * dag.proto().withFile("/path/to/file", "file-id");
   * ```
   * @param {string} path Path to the file
   * @param {String} fileId Unique file identifier
   * @returns {Proto}
   */
  withFile = (path: string, fileId: string): Proto => {
    const mem = Memory.fromJsonObject({
      path,
      id: fileId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.proto().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();
    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.proto().withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

/**
 * Represents a Hermit environment
 */
export class Hermit extends BaseClient {
  private _id?: string;

  constructor({ id }: { id: string }) {
    super();
    this._id = id;
  }

  /**
   * Returns the Hermit id
   * ```ts
   * dag.hermit().id();
   * ```
   * @returns {string}
   */
  id = (): string => {
    return this._id!;
  };

  /**
   * Execute a command in the Hermit environment
   * ```ts
   * dag.hermit().withExec(["echo", "hello world"]).stdout();
   * ```
   * @param {string[]} args
   * @returns {Hermit}
   */
  withExec = (args: string[]): Hermit => {
    let mem = Memory.fromString("hermit");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject(args);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Wait for a service to be available
   * ```ts
   * dag.hermit().waitOn(8080, 60).withExec(["curl", "http://localhost:8080"]).stdout();
   * ```
   * @param {port} number
   * @param {timeout} number
   * @returns {Hermit}
   */
  waitOn = (port: number, timeout = 60): Hermit => {
    let mem = Memory.fromString("hermit");
    set_runner(mem.offset);
    mem = Memory.fromJsonObject([port, timeout]);
    with_exec(mem.offset);
    return this;
  };

  /**
   * Change the working directory
   * ```ts
   * dag.hermit().withWorkdir("/path/to/dir");
   * ```
   * @param {string} path Path to the new working directory
   * @returns {Hermit}
   */
  withWorkdir = (path: string): Hermit => {
    const mem = Memory.fromString(path);
    with_workdir(mem.offset);
    return this;
  };

  /**
   * Setup a new cache
   * ```ts
   * dag.pkgx().withCache("/path/to/dir", "cache-id");
   * ```
   * @param {string} path Path to the cache
   * @param {String} cacheId Unique cache identifier
   * @returns {Hermit}
   */
  withCache = (path: string, cacheId: string): Hermit => {
    const mem = Memory.fromJsonObject({
      path,
      id: cacheId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Setup a service
   * ```ts
   * dag.hermit().withExec(["ping", "google.com"]).asService("ping");
   * ```
   * @param {string} name
   * @returns {string}
   */
  asService = (name: string): string => {
    const mem = Memory.fromString(name);
    const offset = as_service(mem.offset);
    const response = Memory.find(offset).readJsonObject();
    return response.id;
  };

  /**
   * Add a service
   * ```ts
   * dag.hermit().withService("service-id");
   * ```
   * @param {string} serviceId
   * @returns {Hermit}
   */
  withService = (serviceId: string): Hermit => {
    const mem = Memory.fromString(serviceId);
    with_service(mem.offset);
    return this;
  };

  withEnvVariable = (name: string, value: string): Hermit => {
    const mem = Memory.fromJsonObject({
      [name]: value,
    });
    set_envs(mem.offset);
    return this;
  };

  withSecretVariable = (
    name: string,
    secretId: string,
    secretName: string
  ): Hermit => {
    const mem = Memory.fromJsonObject([name, secretId, secretName]);
    with_secret_variable(mem.offset);
    return this;
  };

  /**
   * Create file at the given path
   * ```ts
   * dag.hermit().withFile("/path/to/file", "file-id");
   * ```
   * @param {string} path Path to the file
   * @param {String} fileId Unique file identifier
   * @returns {Hermit}
   */
  withFile = (path: string, fileId: string): Hermit => {
    const mem = Memory.fromJsonObject({
      path,
      id: fileId,
    });
    with_cache(mem.offset);
    return this;
  };

  /**
   * Install packages
   * ```ts
   * dag.hermit().withPackages(["jq", "gh"]);
   * ```
   * @param {string[]} packages List of packages to install
   * @returns {Hermit}
   */
  withPackages = (packages: string[]): Hermit => {
    const mem = Memory.fromJsonObject(packages);
    with_packages(mem.offset);
    return this;
  };

  install = (): Hermit => {
    install();
    return this;
  };

  /**
   * Returns the stdout of the last executed command
   * ```ts
   * dag.hermit().withExec(["echo", "hello world"]).stdout();
   * ```
   * @returns {string}
   */
  stdout = (): string => {
    const offset = stdout();
    return Memory.find(offset).readString();
  };

  /**
   * Returns the stderr of the last executed command
   * ```ts
   * dag.hermit().withExec(["echo", "hello world"]).stderr();
   * ```
   * @returns {string}
   */
  stderr = (): string => {
    const offset = stderr();
    return Memory.find(offset).readString();
  };
}

export const dag: Client = new Client();
