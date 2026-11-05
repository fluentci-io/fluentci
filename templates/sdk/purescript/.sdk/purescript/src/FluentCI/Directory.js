export function _id(d) {
  return function (onError, onSuccess) {
    d.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function devbox(d) {
  return function () {
    return d.devbox();
  };
}

export function devenv(d) {
  return function () {
    return d.devenv();
  };
}

export function _entries(d) {
  return function (onError, onSuccess) {
    d.entries().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function flox(d) {
  return function () {
    return d.flox();
  };
}

export function mise(d) {
  return function () {
    return d.mise();
  };
}

export function nix(d) {
  return function (args) {
    return function () {
      return d.nix(args);
    };
  };
}

export function pixi(d) {
  return function () {
    return d.pixi();
  };
}

export function pkgx(d) {
  return function () {
    return d.pkgx();
  };
}

export function proto(d) {
  return function () {
    return d.proto();
  };
}

export function hermit(d) {
  return function () {
    return d.hermit();
  };
}

export function envhub(d) {
  return function () {
    return d.envhub();
  };
}

export function directory(d) {
  return function (path) {
    return function () {
      return d.directory(path);
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
  return function (path) {
    return function () {
      return d.withWorkdir(path);
    };
  };
}

export function withFile(d) {
  return function (path) {
    return function () {
      return d.withFile(path);
    };
  };
}

export function zip(d) {
  return function () {
    return d.zip();
  };
}

export function tarCzvf(d) {
  return function () {
    return d.tarCzvf();
  };
}
