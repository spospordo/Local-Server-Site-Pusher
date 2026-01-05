# Version Bump Quick Reference

This is a quick reference for the automated versioning system. For detailed documentation, see [VERSIONING.md](VERSIONING.md).

## Commit Message Prefixes

| Prefix | Version Bump | Use Case | Example |
|--------|--------------|----------|---------|
| `feat:` | Minor (0.x.0) | New features | `feat: Add weather widget` |
| `fix:` | Patch (0.0.x) | Bug fixes | `fix: Resolve login issue` |
| `BREAKING CHANGE:` | Major (x.0.0) | Breaking changes | `BREAKING CHANGE: Remove old API` |
| `major:` | Major (x.0.0) | Major changes | `major: Redesign authentication` |
| `docs:` | Patch (0.0.x) | Documentation | `docs: Update README` |
| (any other) | Patch (0.0.x) | Default | `Update dependencies` |

## Priority Rules

When multiple commits exist, the highest priority determines the bump:

**Major > Minor > Patch**

Example:
```
fix: Bug fix          (patch)
feat: New feature     (minor)
BREAKING CHANGE: ...  (major)
→ Result: Major version bump
```

## Quick Commands

### Preview version bump (no changes)
```bash
node scripts/preview-version-bump.js
```

### Run tests
```bash
node scripts/test-version-bump.js
```

### Manual version bump
```bash
# Patch: 2.2.4 → 2.2.5
npm version patch

# Minor: 2.2.4 → 2.3.0
npm version minor

# Major: 2.2.4 → 3.0.0
npm version major
```

## Workflow

1. Write code changes
2. Commit with appropriate prefix: `git commit -m "feat: Add new feature"`
3. Push to main: `git push origin main`
4. GitHub Action automatically:
   - Analyzes commits
   - Bumps version
   - Updates CHANGELOG.md
   - Creates git tag
   - Pushes changes

## Common Scenarios

### Adding a new feature
```bash
git commit -m "feat: Add Smart Mirror dashboard"
```
→ Version bump: 2.2.4 → 2.3.0

### Fixing a bug
```bash
git commit -m "fix: Resolve widget positioning issue"
```
→ Version bump: 2.2.4 → 2.2.5

### Breaking change
```bash
git commit -m "BREAKING CHANGE: New configuration format"
```
→ Version bump: 2.2.4 → 3.0.0

### Documentation update
```bash
git commit -m "docs: Update installation guide"
```
→ Version bump: 2.2.4 → 2.2.5

## Troubleshooting

### Version didn't bump
- Check that commit message uses recognized prefix
- Verify workflow ran (check GitHub Actions tab)
- Ensure push was to `main` branch

### Wrong version bump
- Use preview tool: `node scripts/preview-version-bump.js`
- Amend commit message if needed
- Or use manual bump: `npm version <major|minor|patch>`

## Need Help?

See full documentation: [VERSIONING.md](VERSIONING.md)
