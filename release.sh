#!/bin/bash

# Release script for wintercore-mc
# Usage: ./release.sh <bump-type> [version]
# Bump types: major, minor, patch
# Examples:
#   ./release.sh patch    # Bumps patch version (1.1.2 -> 1.1.3)
#   ./release.sh minor    # Bumps minor version (1.1.2 -> 1.2.0)
#   ./release.sh major    # Bumps major version (1.1.2 -> 2.0.0)
#   ./release.sh patch 1.1.5  # Sets specific version (1.1.2 -> 1.1.5)

set -e  # Exit on error

# Check if bump type argument is provided
if [ -z "$1" ]; then
    echo "Error: Bump type or version number required"
    echo "Usage: ./release.sh <major|minor|patch> [version]"
    echo ""
    echo "Examples:"
    echo "  ./release.sh patch    # Bumps patch version (1.1.2 -> 1.1.3)"
    echo "  ./release.sh minor    # Bumps minor version (1.1.2 -> 1.2.0)"
    echo "  ./release.sh major    # Bumps major version (1.1.2 -> 2.0.0)"
    echo "  ./release.sh patch 1.1.5  # Sets specific version (1.1.2 -> 1.1.5)"
    exit 1
fi

BUMP_TYPE=$1
CUSTOM_VERSION=$2

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(major|minor|patch)$ ]]; then
    echo "Error: Bump type must be 'major', 'minor', or 'patch'"
    echo "Usage: ./release.sh <major|minor|patch> [version]"
    exit 1
fi

# Check if custom version is valid format if provided
if [ -n "$CUSTOM_VERSION" ]; then
    if ! [[ $CUSTOM_VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "Error: Custom version must be in format X.Y.Z (e.g., 1.1.3)"
        exit 1
    fi
fi

echo "🚀 Starting release process..."
echo ""

# Check for uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  Warning: You have uncommitted changes."
    read -p "Do you want to continue anyway? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Release cancelled."
        exit 1
    fi
fi

# Determine version bump strategy
if [ -n "$CUSTOM_VERSION" ]; then
    echo "📌 Setting custom version: $CUSTOM_VERSION"
    npm version $CUSTOM_VERSION --no-git-tag-version
else
    echo "📈 Bumping $BUMP_TYPE version..."
    npm version $BUMP_TYPE --no-git-tag-version
fi

# Get the new version from package.json
NEW_VERSION=$(node -p "require('./package.json').version")
TAG="v$NEW_VERSION"

echo "✅ Version bumped to $NEW_VERSION"
echo ""

# Confirm release
echo "📋 Release Summary:"
echo "   Version: $NEW_VERSION"
echo "   Tag: $TAG"
echo ""
read -p "Do you want to proceed with the release? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Release cancelled."
    # Revert package.json version change
    git checkout package.json
    exit 1
fi

echo ""
echo "📦 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Please fix errors before releasing."
    # Revert package.json version change
    git checkout package.json
    exit 1
fi

echo "✅ Build successful!"
echo ""

# Stage all changes (package.json version + build artifacts)
echo "📝 Staging changes..."
git add .

# Show what will be committed
echo ""
echo "📄 Files to be committed:"
git diff --cached --name-only

echo ""
read -p "Do you want to commit these changes? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Release cancelled."
    # Revert package.json version change
    git checkout package.json
    exit 1
fi

# Commit changes
echo "💾 Committing changes..."
git commit -m "chore: release v$NEW_VERSION"

echo ""
echo "🏷️  Creating tag $TAG..."
git tag $TAG

echo ""
echo "✅ Release prepared successfully!"
echo ""
echo "📤 To push and trigger the GitHub Actions workflow, run:"
echo "   git push origin main --tags"
echo ""
echo "Or to push just the tag:"
echo "   git push origin $TAG"
echo ""
echo "🌐 After pushing, the GitHub Actions workflow will:"
echo "   1. Install dependencies"
echo "   2. Build the project"
echo "   3. Publish to npm automatically"
echo ""
echo "📊 Current version: $NEW_VERSION"
echo "🏷️  Tag: $TAG"