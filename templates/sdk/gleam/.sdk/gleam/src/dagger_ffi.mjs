import { dag } from "jsr:@fluentci/sdk/dagger";

export function client() {
  return dag;
}

export function id(c) {
  return c.id();
}

export function cacheVolume(c, key) {
  return c.cacheVolume(key);
}

export function emptyDirectory(c) {
  return c.directory();
}

export function pipeline(c, name) {
  return c.pipeline(name);
}

export function container(c) {
  return c.container();
}

export function host(c) {
  return c.host();
}

export function currentModule(c) {
  return c.currentModule();
}

export function setSecret(c, name, value) {
  return c.setSecret(name, value);
}

export function git(c, url) {
  return c.git(url);
}

export function http(c, url) {
  return c.http(url);
}

export function directory(c, path) {
  return c.directory(path);
}

// Container
export function withExec(c, args) {
  return c.withExec(args);
}

export function from_(c, image) {
  return c.from(image);
}

export function stdout(c) {
  return c.stdout();
}

export function stderr(c) {
  return c.stderr();
}

export function asService(c) {
  return c.asService();
}

export function asTarball(c) {
  return c.asTarball();
}

export function build(c, context) {
  return c.build(context);
}

export function entrypoint(c) {
  return c.entrypoint();
}

export function envVariable(c, name) {
  return c.envVariable(name);
}

export function envVariables(c) {
  return c.envVariables();
}

export function export_(c, path) {
  return c.export(path);
}

export function exposedPorts(c) {
  return c.exposedPorts();
}

export function file(c, path) {
  return c.file(path);
}

export function imageRef(c) {
  return c.imageRef();
}

export function import_(c, source) {
  return c.import(source);
}

export function label(c, name) {
  return c.label(name);
}

export function labels(c) {
  return c.labels();
}

export function mounts(c) {
  return c.mounts();
}

export function platform(c) {
  return c.platform();
}

export function publish(c, address) {
  return c.publish(address);
}

export function rootfs(c) {
  return c.rootfs();
}

export function sync(c) {
  return c.sync();
}

export function terminal(c) {
  return c.terminal();
}

export function user(c) {
  return c.user();
}

export function withDefaultArgs(c, args) {
  return c.withDefaultArgs(args);
}

export function withDefaultTerminalCmd(c, args) {
  return c.withDefaultTerminalCmd(args);
}

export function withDirectory(c, path, directory) {
  return c.withDirectory(path, directory);
}

export function withEntrypoint(c, args) {
  return c.withEntrypoint(args);
}

export function withEnvVariable(c, name, value) {
  return c.withEnvVariable(name, value);
}

export function withExposedPort(c, port) {
  return c.withExposedPort(port);
}

export function withFile(c, path, source) {
  return c.withFile(path, source);
}

export function withFiles(c, path, sources) {
  return c.withFiles(path, sources);
}

export function withFocus(c) {
  return c.withFocus();
}

export function withLabel(c, name, value) {
  return c.withLabel(name, value);
}

export function withMountedCache(c, path, cache) {
  return c.withMountedCache(path, cache);
}

export function withMountedDirectory(c, path, source) {
  return c.withMountedDirectory(path, source);
}

export function withMountedFile(c, path, source) {
  return c.withMountedFile(path, source);
}

export function withMountedSecret(c, path, source) {
  return c.withMountedSecret(path, source);
}

export function withMountedTemp(c, path) {
  return c.withMountedTemp(path);
}

export function withNewFile(c, path, contents) {
  return c.withNewFile(path, contents);
}

export function withRegistryAuth(c, address, username, secret) {
  return c.withRegistryAuth(address, username, secret);
}

export function withRootfs(c, directory) {
  return c.withRootfs(directory);
}

export function withSecretVariable(c, name, secret) {
  return c.withSecretVariable(name, secret);
}

export function withServiceBinding(c, alias, service) {
  return c.withServiceBinding(alias, service);
}

export function withUnixSocket(c, path, source) {
  return c.withUnixSocket(path, source);
}

export function withUser(c, name) {
  return c.withUser(name);
}

export function withWorkdir(c, path) {
  return c.withWorkdir(path);
}

export function withoutDefaultArgs(c) {
  return c.withoutDefaultArgs();
}

export function withoutDirectory(c, path) {
  return c.withoutDirectory(path);
}

export function withoutEntrypoint(c) {
  return c.withoutEntrypoint();
}

export function withoutEnvVariable(c, name) {
  return c.withoutEnvVariable(name);
}

export function withoutExposedPort(c, port) {
  return c.withoutExposedPort(port);
}

export function withoutFile(c, path) {
  return c.withoutFile(path);
}

export function withoutFocus(c) {
  return c.withoutFocus();
}

export function withoutLabel(c, name) {
  return c.withoutLabel(name);
}

export function withoutMount(c, path) {
  return c.withoutMount(path);
}

export function withoutRegistryAuth(c, address) {
  return c.withoutRegistryAuth(address);
}

export function withoutSecretVariable(c, name) {
  return c.withoutSecretVariable(name);
}

export function withoutUnixSocket(c, path) {
  return c.withoutUnixSocket(path);
}

export function withoutUser(c) {
  return c.withoutUser();
}

export function withoutWorkdir(c) {
  return c.withoutWorkdir();
}

export function workdir(c) {
  return c.workdir();
}

// Directory
export function asModule(c) {
  return c.asModule();
}

export function diff(c, other) {
  return c.diff(other);
}

export function dockerBuild(c) {
  return c.dockerBuild();
}

export function entries(c) {
  return c.entries();
}

export function glob(c, pattern) {
  return c.glob(pattern);
}

export function withNewDirectory(c, path) {
  return c.withNewDirectory(path);
}

export function withTimestamps(c, timestamps) {
  return c.withTimestamps(timestamps);
}

// File
export function contents(c) {
  return c.contents();
}

export function digest(c) {
  return c.digest();
}

export function name(c) {
  return c.name();
}

export function size(c) {
  return c.size();
}

export function withName(c, name) {
  return c.withName(name);
}

// Secret
export function plaintext(c) {
  return c.plaintext();
}

// Service
export function endpoint(c) {
  return c.endpoint();
}

export function hostname(c) {
  return c.hostname();
}

export function ports(c) {
  return c.ports();
}

export function start(c) {
  return c.start();
}

export function stop(c) {
  return c.stop();
}

export function up(c) {
  return c.up();
}

// GitRepository
export function branch(c, name) {
  return c.branch(name);
}

export function commit(c, id) {
  return c.commit(id);
}

export function head(c) {
  return c.head();
}

export function ref(c, name) {
  return c.ref(name);
}

export function tag(c, name) {
  return c.tag(name);
}

export function tags(c) {
  return c.tags();
}

export function withAuthHeader(c, header) {
  return c.withAuthHeader(header);
}

export function withAuthToken(c, token) {
  return c.withAuthToken(token);
}

// Host
export function service(c) {
  return c.service();
}

export function setSecretFile(c, name, path) {
  return c.setSecretFile(name, path);
}

export function tunnel(c, service) {
  return c.tunnel(service);
}

export function unixSocket(c, path) {
  return c.unixSocket(path);
}

export function value(c) {
  return c.value();
}

// Module
export function dependencies(c) {
  return c.dependencies();
}

export function dependencyConfig(c) {
  return c.dependencyConfig();
}

export function description(c) {
  return c.description();
}

export function enums(c) {
  return c.enums();
}

export function generatedContextDiff(c) {
  return c.generatedContextDiff();
}

export function generatedContextDirectory(c) {
  return c.generatedContextDirectory();
}

export function initialize(c) {
  return c.initialize();
}

export function interfaces(c) {
  return c.interfaces();
}

export function objects(c) {
  return c.objects();
}

export function runtime(c) {
  return c.runtime();
}

export function sdk(c) {
  return c.sdk();
}

export function serve(c) {
  return c.serve();
}

export function source(c) {
  return c.source();
}

export function withDescription(c, description) {
  return c.withDescription(description);
}

export function withEnums(c, enums) {
  return c.withEnums(enums);
}

export function withInterfaces(c, iface) {
  return c.withInterfaces(iface);
}

export function withObject(c, object) {
  return c.withObject(object);
}

export function withSource(c, source) {
  return c.withSource(source);
}

// ModuleSource
export function asGitSource(c) {
  return c.asGitSource();
}

export function asLocalSource(c) {
  return c.asLocalSource();
}

export function asString(c) {
  return c.asString();
}

export function configExists(c) {
  return c.configExists();
}

export function contextDirectory(c) {
  return c.contextDirectory();
}

export function kind(c) {
  return c.kind();
}

export function moduleName(c) {
  return c.moduleName();
}

export function moduleOriginalName(c) {
  return c.moduleOriginalName();
}

export function resolveContextPathFromCaller(c) {
  return c.resolveContextPathFromCaller();
}

export function resolveDependency(c, dep) {
  return c.resolveDependency(dep);
}

export function resolveDirectoryFromCaller(c) {
  return c.resolveDirectoryFromCaller();
}

export function resolveFromCaller(c) {
  return c.resolveFromCaller();
}

export function sourceRootSubpath(c) {
  return c.sourceRootSubpath();
}

export function sourceSubpath(c) {
  return c.sourceSubpath();
}

export function view(c, name) {
  return c.view(name);
}

export function views(c) {
  return c.views();
}

export function withContextDirectory(c, dir) {
  return c.withContextDirectory(dir);
}

export function withDependencies(c, dependencies) {
  return c.withDependencies(dependencies);
}

export function withSDK(c, sdk) {
  return c.withSDK(sdk);
}

export function withSourceSubpath(c, subpath) {
  return c.withSourceSubpath(subpath);
}

export function withView(c, name, patterns) {
  return c.withView(name, patterns);
}

// ModuleSourceView
export function patterns(c) {
  return c.patterns();
}

// Port
export function experimentalSkipHealthcheck(c) {
  return c.experimentalSkipHealthcheck();
}

export function port(c) {
  return c.port();
}

export function protocol(c) {
  return c.protocol();
}

// GitModuleSource
export function cloneURL(c) {
  return c.cloneURL();
}

export function htmlURL(c) {
  return c.htmlURL();
}

export function root(c) {
  return c.root();
}

export function rootSubpath(c) {
  return c.rootSubpath();
}

export function version(c) {
  return c.version();
}

// GitRef
export function tree(c) {
  return c.tree();
}

// Function
export function args(c) {
  return c.args();
}

export function returnType(c) {
  return c.returnType();
}

export function withArg(c, name, typeDef) {
  return c.withArg(arg, name, typeDef);
}

// FunctionArg
export function defaultValue(c) {
  return c.defaultValue();
}

export function typeDef(c) {
  return c.typeDef();
}

// FunctionCall
export function inputArgs(c) {
  return c.inputArgs();
}

export function parentName(c) {
  return c.parentName();
}

export function returnValue(c, value) {
  return c.returnValue(value);
}
