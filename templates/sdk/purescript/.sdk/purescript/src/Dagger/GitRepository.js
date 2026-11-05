export function _id(c) {
  return function (onError, onSuccess) {
    c.id().then(onSuccess).catch(onError);
    return function (cancelError, onCancelerError, onCancelerSuccess) {
      onCancelerSuccess();
    };
  };
}

export function branch(c) {
  return function (name) {
    return function () {
      return c.branch(name);
    };
  };
}

export function commit(c) {
  return function (id) {
    return function () {
      return c.commit(id);
    };
  };
}

export function head(c) {
  return function () {
    return c.head();
  };
}

export function ref(c) {
  return function (name) {
    return function () {
      return c.ref(name);
    };
  };
}

export function tag(c) {
  return function (name) {
    return function () {
      return c.tag(name);
    };
  };
}

export function tags(c) {
  return function () {
    return c.tags();
  };
}

export function withAuthHeader(c) {
  return function (header) {
    return function () {
      return c.withAuthHeader(header);
    };
  };
}

export function withAuthToken(c) {
  return function (token) {
    return function () {
      return c.withAuthToken(token);
    };
  };
}
