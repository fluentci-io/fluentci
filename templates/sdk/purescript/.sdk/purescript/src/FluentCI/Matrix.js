export const component = value => encodeURIComponent(value).replace(/[!'()*]/g, char => "%" + char.charCodeAt(0).toString(16).toUpperCase());
export const validName = name => /^[A-Za-z0-9_.-]{1,64}$/.test(name);
export const validKey = key => key.length > 0 && !key.includes("\0");
