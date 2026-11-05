import { Context, defaultContext } from "./context.ts";
import { computeQuery } from "./utils.ts";

/**
 * @hidden
 */
export type QueryTree = {
  operation: string;
  args?: Record<string, unknown>;
};

/**
 * @hidden
 */
export type Metadata = {
  [key: string]: {
    is_enum?: boolean;
  };
};

interface ClientConfig {
  queryTree?: QueryTree[];
  ctx?: Context;
}

export interface NixArgs {
  impure?: boolean;
}

class BaseClient {
  protected _queryTree: QueryTree[];
  protected _ctx: Context;

  /**
   * @hidden
   */
  constructor({ queryTree, ctx }: ClientConfig = {}) {
    this._queryTree = queryTree || [];
    this._ctx = ctx || new Context();
  }

  /**
   * @hidden
   */
  get queryTree(): QueryTree[] {
    return this._queryTree;
  }
}

export type BuildArg = {
  /**
   * The build argument name.
   */
  name: string;

  /**
   * The build argument value.
   */
  value: string;
};

/**
 * The root of the DAG.
 */
export class Client extends BaseClient {
  private readonly _checkVersionCompatibility?: boolean = undefined;

  constructor(
    parent?: { queryTree?: QueryTree[]; ctx: Context },
    _checkVersionCompatibility?: boolean
  ) {
    super(parent);

    this._checkVersionCompatibility = _checkVersionCompatibility;
  }

  pipeline = (name: string): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "pipeline",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  cache = (key: string): Cache => {
    return new Cache({
      queryTree: [
        ...this._queryTree,
        {
          operation: "cache",
          args: { key },
        },
      ],
      ctx: this._ctx,
    });
  };

  http = (url: string): File => {
    return new File({
      queryTree: [
        ...this._queryTree,
        {
          operation: "http",
          args: { url },
        },
      ],
      ctx: this._ctx,
    });
  };

  directory = (path: string): Directory => {
    return new Directory({
      queryTree: [
        ...this._queryTree,
        {
          operation: "directory",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  file = (path: string): File => {
    return new File({
      queryTree: [
        ...this._queryTree,
        {
          operation: "file",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  git = (url: string): Git => {
    return new Git({
      queryTree: [
        ...this._queryTree,
        {
          operation: "git",
          args: { url },
        },
      ],
      ctx: this._ctx,
    });
  };

  devbox = (): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "devbox",
        },
      ],
      ctx: this._ctx,
    });
  };

  devenv = (): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "devenv",
        },
      ],
      ctx: this._ctx,
    });
  };

  flox = (): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "flox",
        },
      ],
      ctx: this._ctx,
    });
  };

  nix = (args?: NixArgs): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "nix",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  pkgx = (): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "pkgx",
        },
      ],
      ctx: this._ctx,
    });
  };

  hermit = (): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "hermit",
        },
      ],
      ctx: this._ctx,
    });
  };

  proto = (): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "proto",
        },
      ],
      ctx: this._ctx,
    });
  };

  mise = (): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "mise",
        },
      ],
      ctx: this._ctx,
    });
  };

  setSecret = (name: string, value: string): Secret => {
    return new Secret({
      queryTree: [
        ...this._queryTree,
        {
          operation: "setSecret",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  googleCloudSecretManager = (
    project: string,
    googleCredentialsFile: string
  ): SecretManager => {
    return new SecretManager({
      queryTree: [
        ...this._queryTree,
        {
          operation: "googleCloudSecretManager",
          args: { project, googleCredentialsFile },
        },
      ],
      ctx: this._ctx,
    });
  };

  awsSecretsManager = (
    region: string,
    accessKeyId: string,
    secretAccessKey: string
  ): SecretManager => {
    return new SecretManager({
      queryTree: [
        ...this._queryTree,
        {
          operation: "awsSecretsManager",
          args: {
            region,
            accessKeyId,
            secretAccessKey,
          },
        },
      ],
      ctx: this._ctx,
    });
  };

  azureKeyvault = (
    clientId: string,
    clientSecret: string,
    tenantId: string,
    keyvaultName: string,
    keyvaultUrl: string
  ): SecretManager => {
    return new SecretManager({
      queryTree: [
        ...this._queryTree,
        {
          operation: "azureKeyvault",
          args: {
            clientId,
            clientSecret,
            tenantId,
            keyvaultName,
            keyvaultUrl,
          },
        },
      ],
      ctx: this._ctx,
    });
  };

  hashicorpVault = (
    address: string,
    token: string,
    cacerts: string
  ): SecretManager => {
    return new SecretManager({
      queryTree: [
        ...this._queryTree,
        {
          operation: "hashicorpVault",
          args: {
            address,
            token,
            cacerts,
          },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A directory whose contents persist across runs.
 */
export class Cache extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  key = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "key",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };
}

export class Secret extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  plaintext = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "plaintext",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  name = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "name",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  mount = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "mount",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };
}

export class SecretManager extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  getSecret = async (name: string): Promise<Secret[]> => {
    const response: Awaited<Secret[]> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "getSecret",
          args: { name },
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };
}

/**
 * A devbox environment.
 */
export class Devbox extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  withExec = (args: string[]): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };

  withEnvVariable = (name: string, value: string): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A devenv environment.
 */
export class Devenv extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  withExec = (args: string[]): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };
  withEnvVariable = (name: string, value: string): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: {
            name,
          },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A directory.
 */
export class Directory extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  directory = (path: string): Directory => {
    return new Directory({
      queryTree: [
        ...this._queryTree,
        {
          operation: "directory",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  entries = async (): Promise<string[]> => {
    const response: Awaited<string[]> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "entries",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  devbox = (): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "devbox",
        },
      ],
      ctx: this._ctx,
    });
  };

  devenv = (): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "devenv",
        },
      ],
      ctx: this._ctx,
    });
  };

  flox = (): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "flox",
        },
      ],
      ctx: this._ctx,
    });
  };

  nix = (args?: NixArgs): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "nix",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  pkgx = (): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "pkgx",
        },
      ],
      ctx: this._ctx,
    });
  };

  pixi = (): Pixi => {
    return new Pixi({
      queryTree: [
        ...this._queryTree,
        {
          operation: "pixi",
        },
      ],
      ctx: this._ctx,
    });
  };

  mise = (): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "mise",
        },
      ],
      ctx: this._ctx,
    });
  };

  envhub = (): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "envhub",
        },
      ],
      ctx: this._ctx,
    });
  };

  hermit = (): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "hermit",
        },
      ],
      ctx: this._ctx,
    });
  };

  proto = (): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "proto",
        },
      ],
      ctx: this._ctx,
    });
  };

  withExec = (args: string[]): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Directory => {
    return new Directory({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };
  withEnvVariable = (name: string, value: string): Directory => {
    return new Directory({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  zip = (): File => {
    return new File({
      queryTree: [
        ...this._queryTree,
        {
          operation: "zip",
        },
      ],
      ctx: this._ctx,
    });
  };

  tarCzvf = (): File => {
    return new File({
      queryTree: [
        ...this._queryTree,
        {
          operation: "tarCzvf",
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Directory => {
    return new Directory({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A service.
 */
export class Service extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };
}

/**
 * A file.
 */
export class File extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  path = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "path",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  zip = (): File => {
    return new File({
      queryTree: [
        ...this._queryTree,
        {
          operation: "zip",
        },
      ],
      ctx: this._ctx,
    });
  };

  tarCzvf = (): File => {
    return new File({
      queryTree: [
        ...this._queryTree,
        {
          operation: "tarCzvf",
        },
      ],
      ctx: this._ctx,
    });
  };

  unzip = (outputDir?: string): Directory => {
    return new Directory({
      queryTree: [
        ...this._queryTree,
        {
          operation: "unzip",
          args: {
            outputDir,
          },
        },
      ],
      ctx: this._ctx,
    });
  };

  tarXzvf = (outputDir?: string): Directory => {
    return new Directory({
      queryTree: [
        ...this._queryTree,
        {
          operation: "tarXzvf",
          args: {
            outputDir,
          },
        },
      ],
      ctx: this._ctx,
    });
  };

  md5 = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "md5",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  sha256 = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "sha256",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  chmod = (mode: string): File => {
    return new File({
      queryTree: [
        ...this._queryTree,
        {
          operation: "chmod",
          args: { mode },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A Flox environment.
 */
export class Flox extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  withExec = (args: string[]): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };

  withEnvVariable = (name: string, value: string): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A Git repository.
 */
export class Git extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  branch = (name: string): Git => {
    return new Git({
      queryTree: [
        ...this._queryTree,
        {
          operation: "branch",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  commit = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "commit",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  tree = (): Directory => {
    return new Directory({
      queryTree: [
        ...this._queryTree,
        {
          operation: "tree",
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A Nix environment.
 */
export class Nix extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  withExec = (args: string[]): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };

  withEnvVariable = (name: string, value: string): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * Creates a named sub-pipeline
 */
export class Pipeline extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  http = (url: string): File => {
    return new File({
      queryTree: [
        ...this._queryTree,
        {
          operation: "http",
          args: { url },
        },
      ],
      ctx: this._ctx,
    });
  };

  git = (url: string): Git => {
    return new Git({
      queryTree: [
        ...this._queryTree,
        {
          operation: "git",
          args: { url },
        },
      ],
      ctx: this._ctx,
    });
  };

  devbox = (): Devbox => {
    return new Devbox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "devbox",
        },
      ],
      ctx: this._ctx,
    });
  };

  devenv = (): Devenv => {
    return new Devenv({
      queryTree: [
        ...this._queryTree,
        {
          operation: "devenv",
        },
      ],
      ctx: this._ctx,
    });
  };

  flox = (): Flox => {
    return new Flox({
      queryTree: [
        ...this._queryTree,
        {
          operation: "flox",
        },
      ],
      ctx: this._ctx,
    });
  };

  nix = (args?: NixArgs): Nix => {
    return new Nix({
      queryTree: [
        ...this._queryTree,
        {
          operation: "nix",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  pkgx = (): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "pkgx",
        },
      ],
      ctx: this._ctx,
    });
  };

  pixi = (): Pixi => {
    return new Pixi({
      queryTree: [
        ...this._queryTree,
        {
          operation: "pixi",
        },
      ],
      ctx: this._ctx,
    });
  };

  mise = (): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "mise",
        },
      ],
      ctx: this._ctx,
    });
  };

  envhub = (): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "envhub",
        },
      ],
      ctx: this._ctx,
    });
  };

  hermit = (): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "hermit",
        },
      ],
      ctx: this._ctx,
    });
  };

  proto = (): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "proto",
        },
      ],
      ctx: this._ctx,
    });
  };

  withExec = (args: string[]): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };

  withEnvVariable = (name: string, value: string): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Pipeline => {
    return new Pipeline({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A Pkgx environment.
 */
export class Pkgx extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  withExec = (args: string[]): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };

  withEnvVariable = (name: string, value: string): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  withPackages = (packages: string[]): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withPackages",
          args: { packages },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Pkgx => {
    return new Pkgx({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A Pixi environment.
 */
export class Pixi extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  withExec = (args: string[]): Pixi => {
    return new Pixi({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Pixi => {
    return new Pixi({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Pixi => {
    return new Pixi({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Pixi => {
    return new Pixi({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };

  withEnvVariable = (name: string, value: string): Pixi => {
    return new Pixi({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Pixi => {
    return new Pixi({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Pixi => {
    return new Pixi({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Pixi => {
    return new Pixi({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A Mise environment.
 */
export class Mise extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  trust = (): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "trust",
        },
      ],
      ctx: this._ctx,
    });
  };

  withExec = (args: string[]): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };

  withEnvVariable = (name: string, value: string): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Mise => {
    return new Mise({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A Envhub environment.
 */
export class Envhub extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  use = (environment: string): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "use",
          args: { environment },
        },
      ],
      ctx: this._ctx,
    });
  };

  withExec = (args: string[]): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };

  withEnvVariable = (name: string, value: string): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Envhub => {
    return new Envhub({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A Proto environment.
 */
export class Proto extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  withExec = (args: string[]): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };

  withEnvVariable = (name: string, value: string): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Proto => {
    return new Proto({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

/**
 * A Hermit environment.
 */
export class Hermit extends BaseClient {
  private readonly _id?: string = undefined;

  constructor(parent?: { queryTree?: QueryTree[]; ctx: Context }) {
    super(parent);
  }

  id = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "id",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  withExec = (args: string[]): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withExec",
          args: { args },
        },
      ],
      ctx: this._ctx,
    });
  };

  withWorkdir = (path: string): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withWorkdir",
          args: { path },
        },
      ],
      ctx: this._ctx,
    });
  };

  withService = (service: Service): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withService",
          args: { service },
        },
      ],
      ctx: this._ctx,
    });
  };

  withSecretVariable = (name: string, secret: Secret): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withSecretVariable",
          args: { name, secret },
        },
      ],
      ctx: this._ctx,
    });
  };

  withEnvVariable = (name: string, value: string): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withEnvVariable",
          args: { name, value },
        },
      ],
      ctx: this._ctx,
    });
  };

  withCache = (path: string, cache: Cache): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withCache",
          args: { path, cache },
        },
      ],
      ctx: this._ctx,
    });
  };

  withFile = (path: string, fileId: string): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withFile",
          args: { path, fileId },
        },
      ],
      ctx: this._ctx,
    });
  };

  withPackages = (packages: string[]): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "withPackages",
          args: { packages },
        },
      ],
      ctx: this._ctx,
    });
  };

  install = (): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "install",
        },
      ],
      ctx: this._ctx,
    });
  };

  stdout = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stdout",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  stderr = async (): Promise<string> => {
    const response: Awaited<string> = await computeQuery(
      [
        ...this._queryTree,
        {
          operation: "stderr",
        },
      ],
      await this._ctx.connection()
    );
    return response;
  };

  asService = (name: string): Service => {
    return new Service({
      queryTree: [
        ...this._queryTree,
        {
          operation: "asService",
          args: { name },
        },
      ],
      ctx: this._ctx,
    });
  };

  waitOn = (port: number, timeout?: number): Hermit => {
    return new Hermit({
      queryTree: [
        ...this._queryTree,
        {
          operation: "waitOn",
          args: { port, timeout },
        },
      ],
      ctx: this._ctx,
    });
  };
}

export const dag: Client = new Client({ ctx: defaultContext });
