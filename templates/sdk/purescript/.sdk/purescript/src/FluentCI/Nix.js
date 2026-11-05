export function asService(d) {
  return function (name) {
    return function () {
      return d.asService(name);
    };
  };
}

export function _id(d) {
  return function (onError, onSuccess) {
    d.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _stderr(d) {
  return function (onError, onSuccess) {
    d.stderr().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _stdout(d) {
  return function (onError, onSuccess) {
    d.stdout().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function waitOn(d) {
  return function (port) {
    return function (timeout) {
      return function () {
        return d.waitOn(port, timeout);
      };
    };
  };
}

export function withCache(d) {
  return function (cache) {
    return function () {
      return d.withCache(cache);
    };
  };
}

export function withEnvVariable(d) {
  return function (name) {
    return function (value) {
      return function () {
        return d.withEnvVariable(name, value);
      };
    };
  };
}

export function withExec(d) {
  return function (command) {
    return function () {
      return d.withExec(command);
    };
  };
}

export function withSecretVariable(d) {
  return function (name) {
    return function (secret) {
      return function () {
        return d.withSecretVariable(name, secret);
      };
    };
  };
}

export function withService(d) {
  return function (service) {
    return function () {
      return d.withService(service);
    };
  };
}

export function withWorkdir(d) {
  return function (workdir) {
    return function () {
      return d.withWorkdir(workdir);
    };
  };
}
