import { dag } from "jsr:@fluentci/sdk";

export function client() {
  return dag;
}

export function azureSecretsManager(c, region, accessKeyId, secretAccessKey) {
  return c.azureSecretsManager(region, accessKeyId, secretAccessKey);
}

export function azureKeyvault(
  c,
  clientId,
  clientSecret,
  tenantId,
  keyvaultName,
  keyvaultUrl
) {
  return c.azureKeyvault(
    clientId,
    clientSecret,
    tenantId,
    keyvaultName,
    keyvaultUrl
  );
}

export function cache(c, key) {
  return c.cache(key);
}

export function devbox(c) {
  return c.devbox();
}

export function devenv(c) {
  return c.devenv();
}

export function directory(c, path) {
  return c.directory(path);
}

export function envhub(c) {
  return c.envhub();
}

export function file(c, path) {
  return c.file(path);
}

export function flox(c) {
  return c.flox();
}

export function git(c, url) {
  return c.git(url);
}

export function googleCloudSecretManager(c, project, googleCredentialsFile) {
  return c.googleCloudSecretManager(project, googleCredentialsFile);
}

export function hashicorpVault(c, address, token, cacerts) {
  return c.hashicorpVault(address, token, cacerts);
}

export function http(c, url) {
  return c.http(url);
}

export function mise(c) {
  return c.mise();
}

export function nix(c, args) {
  return c.nix(args);
}

export function pipeline(c, name) {
  return c.pipeline(name);
}

export function pixi(c) {
  return c.pixi();
}

export function pkgx(c) {
  return c.pkgx();
}

export function proto(c) {
  return c.proto();
}

export function hermit(c) {
  return c.hermit();
}

export function setSecret(c, name, value) {
  return c.setSecret(name, value);
}

export function plaintext(s) {
  return s.plaintext();
}

export function id(c) {
  return c.id();
}

export function key(c) {
  return c.key();
}

export function asService(c) {
  return c.asService();
}

export function stderr(c) {
  return c.stderr();
}

export function stdout(c) {
  return c.stdout();
}

export function waitOn(c, port, timeout) {
  return c.waitOn(port, timeout);
}

export function withCache(c, cache) {
  return c.withCache(cache);
}

export function withEnvVariable(c, name, value) {
  return c.withEnvVariable(name, value);
}

export function withExec(c, args) {
  return c.withExec(args);
}

export function withSecretVariable(c, name, secret) {
  return c.withSecretVariable(name, secret);
}

export function withService(c, service) {
  return c.withService(service);
}

export function withWorkdir(c, path) {
  return c.withWorkdir(path);
}

export function use(c, environment) {
  return c.use(environment);
}

export function withPackages(c, packages) {
  return c.withPackages(packages);
}

export function entries(c) {
  return c.entries();
}

export function withFile(c, fileId) {
  return c.withFile(fileId);
}

export function zip(c) {
  return c.zip();
}

export function tarCzvf(c) {
  return c.tarCzvf();
}

export function chmod(c, mode) {
  return c.chmod(mode);
}

export function md5(c) {
  return c.md5();
}

export function path(c) {
  return c.path();
}

export function sha256(c) {
  return c.sha256();
}

export function unzip(c) {
  return c.unzip();
}

export function mount(c) {
  return c.mount();
}

export function name(c) {
  return c.name();
}

export function commit(c) {
  return c.commit();
}

export function tree(c) {
  return c.tree();
}

export function getSecret(c, name) {
  return c.getSecret(name);
}

export function trust(c) {
  return c.trust();
}

export function install(c) {
  return c.install();
}
