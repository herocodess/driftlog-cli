#!/bin/bash
set -e

# Driftlog CLI installer — downloads and installs standalone binary
# Usage: curl -fsSL https://install.driftlog.dev | sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_error() {
  echo -e "${RED}✗ $1${NC}" >&2
}

log_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

log_info() {
  echo -e "${YELLOW}→ $1${NC}"
}

# Detect OS
OS=$(uname -s)
case "$OS" in
  Linux*)
    os="linux"
    ;;
  Darwin*)
    os="darwin"
    ;;
  *)
    log_error "Unsupported OS: $OS"
    log_info "Fallback: npm install -g driftlog"
    exit 1
    ;;
esac

# Detect architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)
    arch="x64"
    ;;
  arm64|aarch64)
    arch="arm64"
    ;;
  *)
    log_error "Unsupported architecture: $ARCH"
    log_info "Fallback: npm install -g driftlog"
    exit 1
    ;;
esac

PLATFORM="$os-$arch"
log_info "Detected platform: $PLATFORM"

# Fetch latest release from GitHub API
log_info "Fetching latest driftlog release..."
RELEASE_JSON=$(curl -fsSL \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/herocodess/driftlog-cli/releases/latest")

if echo "$RELEASE_JSON" | grep -q "Not Found"; then
  log_error "No releases found on herocodess/driftlog-cli"
  log_info "Fallback: npm install -g driftlog"
  exit 1
fi

VERSION=$(echo "$RELEASE_JSON" | grep '"tag_name"' | head -1 | sed -E 's/.*"tag_name": "([^"]+)".*/\1/')
if [ -z "$VERSION" ]; then
  log_error "Failed to parse version from GitHub API response"
  exit 1
fi

log_success "Latest version: $VERSION"

# Build download URL
BINARY_NAME="driftlog-$PLATFORM"
DOWNLOAD_URL="https://github.com/herocodess/driftlog-cli/releases/download/$VERSION/$BINARY_NAME"
CHECKSUMS_URL="https://github.com/herocodess/driftlog-cli/releases/download/$VERSION/checksums.txt"

# Create temp directory
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

log_info "Downloading driftlog $VERSION..."
if ! curl -fsSL "$DOWNLOAD_URL" -o "$TMPDIR/$BINARY_NAME"; then
  log_error "Failed to download binary from: $DOWNLOAD_URL"
  log_info "Fallback: npm install -g driftlog"
  exit 1
fi

log_info "Downloading checksums..."
if ! curl -fsSL "$CHECKSUMS_URL" -o "$TMPDIR/checksums.txt"; then
  log_error "Failed to download checksums"
  log_error "Skipping SHA256 verification (downloaded binary may be corrupted)"
else
  log_info "Verifying SHA256 checksum..."
  cd "$TMPDIR"
  if command -v sha256sum &> /dev/null; then
    SHA_CMD="sha256sum"
  elif command -v shasum &> /dev/null; then
    SHA_CMD="shasum -a 256"
  else
    log_error "SHA256 verification tool not found (sha256sum or shasum)"
    log_info "Proceeding without verification (binary may be corrupted)"
  fi

  if [ -n "$SHA_CMD" ]; then
    if grep "$BINARY_NAME" checksums.txt | $SHA_CMD -c - > /dev/null 2>&1; then
      log_success "Checksum verified"
    else
      log_error "Checksum mismatch! Binary may be corrupted."
      log_error "Expected: $(grep $BINARY_NAME checksums.txt | awk '{print $1}')"
      log_error "Got: $($SHA_CMD $BINARY_NAME | awk '{print $1}')"
      exit 1
    fi
  fi
fi

# Install binary
log_info "Installing driftlog to system..."

# Try /usr/local/bin first, fall back to ~/.local/bin
INSTALL_DIR="/usr/local/bin"
if [ ! -w "$INSTALL_DIR" ]; then
  INSTALL_DIR="$HOME/.local/bin"
  mkdir -p "$INSTALL_DIR"
fi

chmod +x "$TMPDIR/$BINARY_NAME"
if ! cp "$TMPDIR/$BINARY_NAME" "$INSTALL_DIR/driftlog"; then
  log_error "Failed to install binary to $INSTALL_DIR"
  log_error "Try running with sudo: sudo cp $TMPDIR/$BINARY_NAME /usr/local/bin/driftlog"
  exit 1
fi

# Verify installation
INSTALLED_VERSION=$("$INSTALL_DIR/driftlog" --version 2>/dev/null || echo "")
if [ -z "$INSTALLED_VERSION" ]; then
  log_error "Installation succeeded but binary verification failed"
  exit 1
fi

log_success "driftlog $INSTALLED_VERSION installed to $INSTALL_DIR/driftlog"
log_info "Run: driftlog --help"
