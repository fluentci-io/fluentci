export function _id(c) {
  return function (onError, onSuccess) {
    c.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _dependencies(c) {
  return function (onError, onSuccess) {
    c.dependencies().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function _dependencyConfig(c) {
  return function (onError, onSuccess) {
    c.dependencyConfig().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}
