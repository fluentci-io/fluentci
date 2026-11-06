# Source from the repository root. Validate before creating package files or
# contacting Gemfury; these values also become package metadata and file names.
: "${TARGET:?TARGET is required}"
: "${RELEASE_VERSION:?RELEASE_VERSION is required}"
case "$TARGET" in
    x86_64-unknown-linux-gnu) deb_arch=amd64; rpm_arch=x86_64 ;;
    aarch64-unknown-linux-gnu) deb_arch=arm64; rpm_arch=aarch64 ;;
    *) echo "Unsupported Linux package target: $TARGET" >&2; exit 1 ;;
esac
version=${RELEASE_VERSION#v}
if [[ ! "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
    echo 'Expected a semantic release version, for example v0.17.0' >&2
    exit 1
fi
# Sort prereleases before stable releases in both package managers.
package_version=${version//-/\~}
repository=$(pwd -P)
package_dir="$repository/target/release-assets"
deb_file="$package_dir/fluentci_${version}_${deb_arch}.deb"
rpm_file="$package_dir/fluentci-${version}-1.${rpm_arch}.rpm"
