export function asService(name) {
  return function (d) {
    return function () {
      return d.asService(name);
    };
  };
}

export function _id(s) {
  return function (onError, onSuccess) {
    s.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function devbox(s) {
  return function () {
    return s.devbox();
  };
}

export function devenv(s) {
  return function () {
    return s.devenv();
  };
}

export function envhub(s) {
  return function () {
    return s.envhub();
  };
}

export function mise(s) {
  return function () {
    return s.mise();
  };
}

export function nix(args) {
  return function (s) {
    return function () {
      return s.nix(args);
    };
  };
}

export function pixi(s) {
  return function () {
    return s.pixi();
  };
}

export function pkgx(s) {
  return function () {
    return s.pkgx();
  };
}

export function proto(s) {
  return function () {
    return s.proto();
  };
}

export function hermit(s) {
  return function () {
    return s.hermit();
  };
}

export function flox(s) {
  return function () {
    return s.flox();
  };
}

export function _stderr(s) {
  return function (onError, onSuccess) {
    s.stderr().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _stdout(s) {
  return function (onError, onSuccess) {
    s.stdout().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function waitOn(port) {
  return function (timeout) {
    return function (s) {
      return function () {
        return s.waitOn(port, timeout);
      };
    };
  };
}

export function withCache(cache) {
  return function (s) {
    return function () {
      return s.withCache(cache);
    };
  };
}

export function withEnvVariable(name) {
  return function (value) {
    return function (s) {
      return function () {
        return s.withEnvVariable(name, value);
      };
    };
  };
}

export function withSecretVariable(name) {
  return function (secret) {
    return function (s) {
      return function () {
        return s.withSecretVariable(name, secret);
      };
    };
  };
}

export function withExec(command) {
  return function (s) {
    return function () {
      return s.withExec(command);
    };
  };
}

export function withService(service) {
  return function (s) {
    return function () {
      return s.withService(service);
    };
  };
}

export function withWorkdir(path) {
  return function (s) {
    return function () {
      return s.withWorkdir(path);
    };
  };
}
