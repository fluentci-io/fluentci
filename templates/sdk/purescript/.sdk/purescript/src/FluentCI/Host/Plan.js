export const environmentJson = entries => Object.fromEntries(entries.map(({ key, value }) => [key, value]));

// Omit unused additions so ordinary command plans remain compatible with earlier
// host-plan engines. Package/shared-lease fields appear only when requested.
export const omitUnusedFields = value => {
  const result = { ...value };
  for (const key of Object.keys(result)) if (result[key] === null) delete result[key];
  for (const key of ["shared_resources", "package_environment", "env_files"]) if (result[key]?.length === 0) delete result[key];
  if (result.cache?.relocatable === false) {
    result.cache = { ...result.cache };
    delete result.cache.relocatable;
  }
  if (result.cache?.toolchain_files?.length === 0) {
    result.cache = { ...result.cache };
    delete result.cache.toolchain_files;
  }
  if (result.service?.health === null) {
    result.service = { ...result.service };
    delete result.service.health;
  }
  return result;
};
