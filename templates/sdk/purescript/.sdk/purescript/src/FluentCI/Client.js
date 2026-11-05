import { dag } from "@fluentci/sdk";

export { dag };

export function awsSecretsManager(c) {
  return function (client) {
    return function (region) {
      return function (accessKeyId) {
        return function (clientSecret) {
          return function (tenantId) {
            return function (keyvaultName) {
              return function (keyvaultUrl) {
                return function () {
                  return c.awsSecretsManager({
                    client,
                    region,
                    accessKeyId,
                    clientSecret,
                    tenantId,
                    keyvaultName,
                    keyvaultUrl,
                  });
                };
              };
            };
          };
        };
      };
    };
  };
}

export function azureKeyvault(c) {
  return function (clientId) {
    return function (clientSecret) {
      return function (tenantId) {
        return function (keyvaultName) {
          return function (keyvaultUrl) {
            return function () {
              return c.azureKeyvault({
                clientId,
                clientSecret,
                tenantId,
                keyvaultName,
                keyvaultUrl,
              });
            };
          };
        };
      };
    };
  };
}

export function cache(c) {
  return function (key) {
    return function () {
      return c.cache(key);
    };
  };
}

export function devbox(c) {
  return function () {
    return c.devbox();
  };
}

export function devenv(c) {
  return function () {
    return c.devenv();
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

export function flox(c) {
  return function () {
    return c.flox();
  };
}

export function git(url) {
  return function (c) {
    return function () {
      return c.git(url);
    };
  };
}

export function googleCloudSecretManager(c) {
  return function (client) {
    return function (project) {
      return function (googleCredentialsFile) {
        return function () {
          return c.googleCloudSecretManager({
            client,
            project,
            googleCredentialsFile,
          });
        };
      };
    };
  };
}

export function hashicorpVault(c) {
  return function (address) {
    return function (token) {
      return function (cacerts) {
        return function () {
          return c.hashicorpVault(address, token, cacerts);
        };
      };
    };
  };
}

export function http(c) {
  return function (url) {
    return function () {
      return c.http(url);
    };
  };
}

export function mise(c) {
  return function () {
    return c.mise();
  };
}

export function nix(c) {
  return function (args) {
    return function () {
      return c.nix(args);
    };
  };
}

export function pipeline(name) {
  return function (c) {
    return function () {
      return c.pipeline(name);
    };
  };
}

export function pixi(c) {
  return function () {
    return c.pixi();
  };
}

export function pkgx(c) {
  return function () {
    return c.pkgx();
  };
}

export function setSecret(c) {
  return function (name) {
    return function (value) {
      return function () {
        return c.setSecret(name, value);
      };
    };
  };
}

export function proto(c) {
  return function () {
    return c.proto();
  };
}

export function hermit(c) {
  return function () {
    return c.hermit();
  };
}

export function envhub(c) {
  return function () {
    return c.envhub();
  };
}
