export function _id(e) {
  return function (onError, onSuccess) {
    e.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function asService(d) {
  return function (name) {
    return function () {
      return d.asService(name);
    };
  };
}

export function _stderr(e) {
  return function (onError, onSuccess) {
    e.stderr().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _stdout(e) {
  return function (onError, onSuccess) {
    e.stdout().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function use(e) {
  return function (environement) {
    return function () {
      return e.use(environement);
    };
  };
}

export function waitOn(e) {
  return function (port) {
    return function (timeout) {
      return function () {
        return e.waitOn(port, timeout);
      };
    };
  };
}

export function withCache(e) {
  return function (cache) {
    return function () {
      return e.withCache(cache);
    };
  };
}

export function withEnvVariable(e) {
  return function (name) {
    return function (value) {
      return function () {
        return e.withEnvVariable(name, value);
      };
    };
  };
}

export function withExec(e) {
  return function (command) {
    return function () {
      return e.withExec(command);
    };
  };
}

export function withSecretVariable(e) {
  return function (name) {
    return function (secret) {
      return function () {
        return e.withSecretVariable(name, secret);
      };
    };
  };
}

export function withService(e) {
  return function (service) {
    return function () {
      return e.withService(service);
    };
  };
}

export function withWorkdir(e) {
  return function (path) {
    return function () {
      return e.withWorkdir(path);
    };
  };
}
