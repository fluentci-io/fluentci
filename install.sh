#!/bin/bash

set -e -o pipefail

readonly MAGENTA="$(tput setaf 5 2>/dev/null || echo '')"
readonly GREEN="$(tput setaf 2 2>/dev/null || echo '')"
readonly CYAN="$(tput setaf 6 2>/dev/null || echo '')"
readonly NO_COLOR="$(tput sgr0 2>/dev/null || echo '')"

# Check if the required tools are installed
if ! command -v curl >/dev/null 2>&1; then
    echo "Error: curl is required to install FluentCI."
    exit 1
fi

if ! command -v unzip >/dev/null 2>&1; then
    echo "Error: unzip is required to install FluentCI."
    exit 1
fi

export DENO_INSTALL=$HOME/.deno
export PATH=$DENO_INSTALL/bin:$PATH

if ! command -v deno >/dev/null 2>&1; then
    echo "Deno is not installed."
    echo "Downloading and installing Deno..."
    curl -fsSL https://deno.land/install.sh | sh
    echo 'export DENO_INSTALL=$HOME/.deno' >> ~/.bashrc
    echo 'export PATH=$DENO_INSTALL/bin:$PATH' >> ~/.bashrc
fi

if ! command -v dagger >/dev/null 2>&1; then
    echo "Dagger is not installed."
    echo "Downloading and installing Dagger..."
    curl -L https://dl.dagger.io/dagger/install.sh | DAGGER_VERSION=0.10.0 sh
    if ! command -v sudo >/dev/null 2>&1; then
        mv bin/dagger /usr/local/bin
    else
        sudo mv bin/dagger /usr/local/bin
    fi
    rmdir bin || true
fi

if ! command -v tar >/dev/null 2>&1; then
    echo "Error: tar is required to install FluentCI."
    exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
    echo "Error: docker is required to install FluentCI."
    exit 1
fi

# Define the release information
RELEASE_URL="https://api.github.com/repos/fluentci-io/fluentci/releases/latest"

# Determine the operating system
OS=$(uname -s)
if [ "$OS" = "Darwin" ]; then
    # Determine the CPU architecture
    ARCH=$(uname -m)
    if [ "$ARCH" = "arm64" ]; then
        ASSET_NAME="_aarch64-apple-darwin.tar.gz"
    else
        ASSET_NAME="_x86_64-apple-darwin.tar.gz"
    fi
elif [ "$OS" = "Linux" ]; then
    # Determine the CPU architecture
    ARCH=$(uname -m)
    if [ "$ARCH" = "aarch64" ]; then
        ASSET_NAME="_aarch64-unknown-linux-gnu.tar.gz"
    elif [ "$ARCH" = "x86_64" ]; then
        ASSET_NAME="_x86_64-unknown-linux-gnu.tar.gz"
    else
        echo "Unsupported architecture: $ARCH"
        exit 1
    fi
else
    echo "Unsupported operating system: $OS"
    exit 1
fi

# Retrieve the download URL for the desired asset
DOWNLOAD_URL=$(curl -sSL $RELEASE_URL | grep -o "browser_download_url.*$ASSET_NAME\"" | cut -d ' ' -f 2)

ASSET_NAME=$(basename $DOWNLOAD_URL)

# Define the installation directory
INSTALL_DIR="/usr/local/bin"

DOWNLOAD_URL=`echo $DOWNLOAD_URL | tr -d '\"'`

# Download the asset
curl -SL $DOWNLOAD_URL -o /tmp/$ASSET_NAME

# Extract the asset
tar -xzf /tmp/$ASSET_NAME -C /tmp

# Set the correct permissions for the binary
chmod +x /tmp/fluentci

# Move the extracted binary to the installation directory
# use sudo if available
if command -v sudo >/dev/null 2>&1; then
    sudo mv /tmp/fluentci $INSTALL_DIR
else
    mv /tmp/fluentci $INSTALL_DIR
fi

# Clean up temporary files
rm /tmp/$ASSET_NAME

cat << EOF
${CYAN}

          ______              __  _________
         / __/ /_ _____ ___  / /_/ ___/  _/
        / _// / // / -_) _ \\/ __/ /___/ /  
       /_/ /_/\\_,_/\\__/_//_/\\__/\\___/___/


${NO_COLOR}
Welcome to FluentCI! 🚀
An Open Source CI/CD tool for ${GREEN}building, testing, and deploying${NO_COLOR} your code in ${CYAN}TypeScript${NO_COLOR}.

${GREEN}https://github.com/fluentci-io/fluentci${NO_COLOR}

Please file an issue if you encounter any problems!

===============================================================================

Installation completed! 🎉

To get started, run:

${CYAN}fluentci init${NO_COLOR}

EOF