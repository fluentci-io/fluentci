export function _id(c) {
  return function (onError, onSuccess) {
    c.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function directory(c) {
  return function (path) {
    return function () {
      return c.directory(path);
    };
  };
}

export function file(c) {
  return function (path) {
    return function () {
      return c.file(path);
    };
  };
}

export function service(c) {
  return function () {
    return c.service();
  };
}

export function setSecretFile(c) {
  return function (name) {
    return function (path) {
      return function () {
        return c.setSecretFile(name, path);
      };
    };
  };
}

export function tunnel(c) {
  return function (service) {
    return function () {
      return c.tunnel(service);
    };
  };
}

export function unixSocket(c) {
  return function (path) {
    return function () {
      return c.unixSocket(path);
    };
  };
}
