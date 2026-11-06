#!/usr/bin/env bash
set -euo pipefail
source .github/scripts/linux-package-env.sh
binary="$repository/target/$TARGET/release/fluentci"
test -x "$binary" || { echo "Missing release executable: $binary" >&2; exit 1; }
for tool in dpkg-deb rpmbuild rpm sha256sum; do
    command -v "$tool" >/dev/null || { echo "Missing package tool: $tool" >&2; exit 1; }
done
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$package_dir" "$stage/root/usr/bin" "$stage/root/usr/share/licenses/fluentci"
install -m 755 "$binary" "$stage/root/usr/bin/fluentci"
install -m 644 LICENSE "$stage/root/usr/share/licenses/fluentci/LICENSE"
mkdir -p "$stage/root/DEBIAN"
cat > "$stage/root/DEBIAN/control" <<EOF
Package: fluentci
Version: $package_version
Section: devel
Priority: optional
Architecture: $deb_arch
Maintainer: Tsiry Sandratraina <tsiry.sndr@fluentci.io>
Homepage: https://github.com/fluentci-io/fluentci
Depends: libc6 (>= 2.39), libgcc-s1
Description: Programmable CI/CD with WebAssembly plugins and FluentCI Studio
 Build, test, and deploy pipelines locally or on a CI runner.
 Includes the FluentCI CLI and its embedded Studio web interface.
EOF
dpkg-deb --build --root-owner-group "$stage/root" "$deb_file"
test "$(dpkg-deb --field "$deb_file" Architecture)" = "$deb_arch"
test "$(dpkg-deb --field "$deb_file" Version)" = "$package_version"
rm -rf "$stage/root/DEBIAN"
mkdir -p "$stage/rpm/"{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
cp -a "$stage/root" "$stage/rpm/SOURCES/root"
cat > "$stage/rpm/SPECS/fluentci.spec" <<EOF
Name: fluentci
Version: $package_version
Release: 1
Summary: Programmable CI/CD with WebAssembly plugins and FluentCI Studio
License: MPL-2.0
URL: https://github.com/fluentci-io/fluentci
BuildArch: $rpm_arch
Requires: glibc >= 2.39
Requires: libgcc
%global _build_id_links none
%global __os_install_post %{nil}

%description
Build, test, and deploy pipelines locally or on a CI runner.
Includes the FluentCI CLI and its embedded Studio web interface.

%prep
%build
%install
mkdir -p %{buildroot}
cp -a %{_sourcedir}/root/. %{buildroot}/

%files
%license /usr/share/licenses/fluentci/LICENSE
/usr/bin/fluentci
EOF
rpmbuild --define "_topdir $stage/rpm" --target "$rpm_arch" -bb "$stage/rpm/SPECS/fluentci.spec"
install -m 644 "$stage/rpm/RPMS/$rpm_arch/fluentci-$package_version-1.$rpm_arch.rpm" "$rpm_file"
test "$(rpm --query --package --queryformat '%{ARCH}' "$rpm_file")" = "$rpm_arch"
test "$(rpm --query --package --queryformat '%{VERSION}' "$rpm_file")" = "$package_version"
for file in "$deb_file" "$rpm_file"; do
    (cd "$package_dir" && sha256sum "${file##*/}" > "${file##*/}.sha256")
done
