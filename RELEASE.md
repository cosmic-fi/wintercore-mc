# Release Workflow

## New Release Flow

The release process has been streamlined to follow this flow:

```
commit > push > npm version patch|minor|major > npm publish (via GitHub Actions)
```

## Step-by-Step Release Process

### 1. Commit and Push Your Changes

```bash
git add .
git commit -m "feat: your feature description"
git push origin main
```

### 2. Run the Release Script

The release script will:
- Bump the version in package.json using `npm version`
- Build the project
- Create a commit with the version change
- Create a git tag
- Provide instructions for pushing

```bash
# Bump patch version (1.1.2 -> 1.1.3) for bug fixes
./release.sh patch

# Bump minor version (1.1.2 -> 1.2.0) for new features
./release.sh minor

# Bump major version (1.1.2 -> 2.0.0) for breaking changes
./release.sh major

# Set a specific version (1.1.2 -> 1.1.5)
./release.sh patch 1.1.5
```

### 3. Push the Tag

After the release script completes, push the tag to trigger GitHub Actions:

```bash
git push origin main --tags
```

Or push just the tag:
```bash
git push origin v1.1.3
```

### 4. Automated Publishing

GitHub Actions will automatically:
1. ✅ Verify the tag version matches package.json version
2. 📦 Install dependencies
3. 🔨 Build the project
4. 🚢 Publish to npm with provenance

## What Changed

### Before (Old Flow)
- Manual version editing in package.json
- Manual tagging
- Manual npm publish

### After (New Flow)
- Automated version bumping with `npm version`
- Automated tagging via release script
- Automated npm publish via GitHub Actions
- Version verification to prevent mismatches

## Release Script Features

- **Automatic version management** using npm's built-in version command
- **Build verification** before committing
- **Safety checks** for uncommitted changes
- **Confirmation prompts** at each step
- **Automatic rollback** on build failure
- **Support for semantic versioning** (major.minor.patch)
- **Custom version support** for specific version numbers

## Version Bump Guidelines

- **patch** (1.1.2 → 1.1.3): Bug fixes, documentation updates, minor changes
- **minor** (1.1.2 → 1.2.0): New features, backwards-compatible changes
- **major** (1.1.2 → 2.0.0): Breaking changes, API changes

## GitHub Actions Workflow

The workflow (`.github/workflows/publish.yml`) triggers on tag pushes matching `v*.*.*` and:

1. Checks out the code with full history
2. Sets up Node.js 22
3. **Verifies tag version matches package.json** (prevents version mismatches)
4. Installs dependencies
5. Builds the project
6. Publishes to npm with provenance and public access

## Troubleshooting

### Tag already exists
```bash
# Delete the local tag
git tag -d v1.1.3

# Delete the remote tag
git push origin :refs/tags/v1.1.3
```

### Version mismatch error
If GitHub Actions fails with a version mismatch:
- Ensure you used the release script (it manages versions automatically)
- Don't manually edit package.json version
- The tag and package.json version must match exactly

### Build failures
The release script will automatically revert package.json if the build fails, so you can safely retry.

## Examples

### Example 1: Patch Release (Bug Fix)
```bash
# Make your changes
git add .
git commit -m "fix: resolve memory leak in downloader"
git push origin main

# Bump patch version
./release.sh patch
# Output: Version bumped to 1.1.3

# Push tag
git push origin main --tags
# GitHub Actions publishes v1.1.3 to npm
```

### Example 2: Minor Release (New Feature)
```bash
# Make your changes
git add .
git commit -m "feat: add support for Quilt loader"
git push origin main

# Bump minor version
./release.sh minor
# Output: Version bumped to 1.2.0

# Push tag
git push origin main --tags
# GitHub Actions publishes v1.2.0 to npm
```

### Example 3: Specific Version
```bash
# Skip a version for hotfix
./release.sh patch 1.1.5
# Output: Version set to 1.1.5

git push origin main --tags
# GitHub Actions publishes v1.1.5 to npm
```

## Current Version

Check the current version:
```bash
node -p "require('./package.json').version"
```

List all tags:
```bash
git tag -l