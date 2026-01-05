# Versioning Guide

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (SemVer) with automated version advancement based on commit messages.

## Overview

Version numbers follow the format: **MAJOR.MINOR.PATCH**

- **MAJOR** (x.0.0): Incompatible API changes or huge features
- **MINOR** (0.x.0): New features or large modifications (backward compatible)
- **PATCH** (0.0.x): Bug fixes or small modifications (backward compatible)

## Automated Version Bumping

The version number is automatically incremented when code is pushed to the `main` branch. The system analyzes your commit messages to determine the appropriate version bump.

### Commit Message Conventions

Use these prefixes in your commit messages to control version bumping:

#### Major Version Bump (x.0.0)

For **huge changes**, **breaking changes**, or **major new features**:

```
BREAKING CHANGE: Redesigned entire API structure
major: Complete rewrite of authentication system
breaking: Removed deprecated endpoints
```

**Keywords:** `BREAKING CHANGE`, `major:`, `breaking:`

#### Minor Version Bump (0.x.0)

For **new features** or **large modifications**:

```
feat: Add new Magic Mirror dashboard
feature: Implement Ollama AI integration
feat: Add weather forecast widget
```

**Keywords:** `feat:`, `feature:`

#### Patch Version Bump (0.0.x)

For **bug fixes** or **small modifications** (default):

```
fix: Resolve ARM64 compatibility issue
patch: Update documentation
docs: Improve setup instructions
fix: Correct typo in error message
```

**Keywords:** `fix:`, `patch:`, or any other commit message

### How It Works

1. **Automatic Detection**: When you push to `main`, a GitHub Action analyzes all commits since the last version tag
2. **Highest Priority Wins**: If multiple commits exist, the highest priority change determines the bump:
   - Major > Minor > Patch
3. **Version Update**: The system automatically:
   - Updates `package.json` version
   - Adds entry to `CHANGELOG.md`
   - Creates a git tag (e.g., `v2.3.0`)
   - Commits and pushes the changes

## Examples

### Example 1: Feature Addition

```bash
git commit -m "feat: Add Smart Mirror grid editor"
git push origin main
```

Result: Version 2.2.4 → 2.3.0 (minor bump)

### Example 2: Bug Fix

```bash
git commit -m "fix: Resolve widget positioning issue"
git push origin main
```

Result: Version 2.2.4 → 2.2.5 (patch bump)

### Example 3: Breaking Change

```bash
git commit -m "BREAKING CHANGE: New config file format requires migration"
git push origin main
```

Result: Version 2.2.4 → 3.0.0 (major bump)

### Example 4: Multiple Commits

```bash
git commit -m "fix: Correct typo in README"
git commit -m "feat: Add new API endpoint"
git commit -m "docs: Update installation guide"
git push origin main
```

Result: Version 2.2.4 → 2.3.0 (minor bump - highest priority)

## Manual Version Bumping

If the automated system doesn't detect the change scale correctly, you can manually bump the version:

### Option 1: Use npm version command

```bash
# For patch bump
npm version patch

# For minor bump
npm version minor

# For major bump
npm version major
```

This updates `package.json` and creates a git tag automatically.

### Option 2: Run the script directly

```bash
# Force a specific bump type by crafting a commit message
git commit --allow-empty -m "feat: Manual minor version bump"
git push origin main
```

### Option 3: Edit manually

1. Update version in `package.json`
2. Add entry to `CHANGELOG.md`
3. Create git tag: `git tag -a v2.3.0 -m "Release version 2.3.0"`
4. Push: `git push origin main --tags`

## Workflow Details

### GitHub Action Trigger

The version bump workflow (`.github/workflows/version-bump.yml`) runs on:
- Push to `main` branch
- Excludes tag pushes (to prevent infinite loops)

### Script Location

The version bump logic is in `scripts/bump-version.js`

### Outputs

After a successful version bump, you'll see:
- Updated `package.json` with new version
- New entry in `CHANGELOG.md`
- New git tag (e.g., `v2.3.0`)
- Commit message: `chore: bump version to X.Y.Z`

## Troubleshooting

### Version didn't bump

**Possible causes:**
1. No commits since last version tag
2. Commit message didn't match any pattern
3. GitHub Action failed (check Actions tab)

**Solution:** Check commit messages and verify they follow conventions

### Wrong version bump type

**Possible causes:**
1. Commit message prefix doesn't match your intent
2. Multiple commits with conflicting priorities

**Solution:** Use manual version bump or amend commit messages

### Workflow not running

**Possible causes:**
1. Push was to a branch other than `main`
2. Workflow file has syntax errors

**Solution:** Verify `.github/workflows/version-bump.yml` exists and is valid

## Best Practices

1. **Be Descriptive**: Write clear commit messages that describe what changed
2. **Use Conventions**: Always use the appropriate prefix (feat:, fix:, etc.)
3. **Single Purpose**: Keep commits focused on one type of change
4. **Review Before Merge**: Check that your commit messages will result in the correct version bump
5. **Document Breaking Changes**: Always explain breaking changes in detail

## Version Visibility

Current version is visible in:
- `package.json` - Used by Node.js and npm
- `CHANGELOG.md` - Human-readable history
- Git tags - Enables version-specific deployments
- Docker image tags (if using Docker Hub)

## Integration with CI/CD

The version tags can be used in your deployment pipeline:

```yaml
# Example: Use version tag in Docker build
docker build -t myapp:v$(node -p "require('./package.json').version") .
```

## Questions?

If you have questions about versioning or need to override the automated system, please:
1. Check this guide first
2. Review recent version bumps in `CHANGELOG.md`
3. Ask in GitHub Issues or Discussions
