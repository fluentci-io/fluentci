import { dag } from "@fluentci/sdk/dagger";

export { dag };

export function pipeline(c) {
  return function (name) {
    return function () {
      return c.pipeline(name);
    };
  };
}

export function container(c) {
  return function () {
    return c.container();
  };
}

export function cacheVolume(c) {
  return function () {
    return c.cacheVolume(name);
  };
}

export function directory(c) {
  return function () {
    return c.directory();
  };
}

export function git(c) {
  return function (url) {
    return function () {
      return c.git(url);
    };
  };
}

export function host(c) {
  return function () {
    return c.host();
  };
}

export function http(c) {
  return function (url) {
    return function () {
      return c.http(url);
    };
  };
}
