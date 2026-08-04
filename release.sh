#!/bin/bash

# Release script for wintercore-mc
# Usage: ./release.sh <version>
# Example: ./release.sh 1.1.3

set -e  # Exit on error

# Check if version argument is provided
if [ -z "$1" ]; then
    echo "Error: Version number required"
    echo "Usage: ./release.sh <version>"
    echo "Example: ./release.sh 1.1.3"
    exit 1
fi

VERSION=$1

# Validate version format (should be like 1.1.3)
if ! [[ $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "Error: Version must be in format X.Y.Z (e.g., 1.1.3)"
    exit 1
fi

TAG="v$VERSION"

echo "🚀 Starting release process for version $VERSION..."
echo ""

# Check if tag already exists
if git tag | grep -q "^$TAG$"; then
    echo "❌ Error: Tag $TAG already exists!"
    echo "Please delete it first or use a different version number."
    exit 1
fi

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

# Confirm release
echo "📋 Release Summary:"
echo "   Version: $VERSION"
echo "   Tag: $TAG"
echo ""
read -p "Do you want to proceed with the release? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Release cancelled."
    exit 1
fi

echo ""
echo "📦 Building project..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Please fix errors before releasing."
    exit 1
fi

echo "✅ Build successful!"
echo ""

# Stage all changes
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
    exit 1
fi

# Commit changes
echo "💾 Committing changes..."
git commit -m "chore: release v$VERSION"

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
echo "   1. Build the project"
echo "   2. Publish to npm automatically"
echo ""