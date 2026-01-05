# Automated Versioning - Visual Example

This document shows a practical example of how the automated versioning system works.

## Scenario: Adding a New Feature

A developer adds a new weather widget feature to the application.

### Step 1: Developer Makes Changes

```bash
# Developer makes code changes
$ git add public/weather-widget.html
$ git commit -m "feat: Add real-time weather widget"

# Preview what will happen
$ node scripts/preview-version-bump.js
```

**Preview Output:**
```
🔍 Version Bump Preview

📌 Current version: 2.2.4
🏷️  Last version tag: v2.2.4

📝 Commits to analyze (1):

✨ feat: Add real-time weather widget
    [MINOR]

✨ Determined bump type: MINOR

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2.2.4 → 2.3.0
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 2: Developer Pushes to Main

```bash
$ git push origin main
```

### Step 3: GitHub Actions Workflow Triggers

**Workflow Output:**
```
🚀 Starting automated version bump...
Current version: 2.2.4
Last version tag: v2.2.4

Analyzing 1 commit(s):
  - feat: Add real-time weather widget

Determined bump type: MINOR
New version: 2.3.0

✓ Updated package.json to version 2.3.0
✓ Updated CHANGELOG.md with version 2.3.0
✓ Committed version bump changes
✓ Created git tag v2.3.0

✅ Version bump completed successfully!
Version 2.2.4 → 2.3.0
```

### Step 4: Files Automatically Updated

#### package.json (Before)
```json
{
  "name": "local-server-site-pusher",
  "version": "2.2.4",
  "description": "A container to run custom server code..."
}
```

#### package.json (After)
```json
{
  "name": "local-server-site-pusher",
  "version": "2.3.0",
  "description": "A container to run custom server code..."
}
```

#### CHANGELOG.md (Before - Unreleased section)
```markdown
## [Unreleased]

### Fixed
- **Smart Mirror Dashboard 404 Error**: Fixed issue where...
```

#### CHANGELOG.md (After - New entry added)
```markdown
## [Unreleased]

### Fixed
- **Smart Mirror Dashboard 404 Error**: Fixed issue where...

## [2.3.0] - 2026-01-05

### Minor Update
- Automated version bump based on recent changes
- Changes included:
  - feat: Add real-time weather widget

## [2.2.4] - 2025-10-13
```

### Step 5: Git Repository Updated

**New Git Tag Created:**
```bash
$ git tag
v2.2.4
v2.3.0  # ← New tag created automatically
```

**New Commit Added:**
```bash
$ git log --oneline -3
a1b2c3d (HEAD -> main, tag: v2.3.0) chore: bump version to 2.3.0
d4e5f6g feat: Add real-time weather widget
g7h8i9j Previous commit
```

## Multiple Commits Example

### Scenario: Bug Fix + Feature + Breaking Change

```bash
# Developer makes multiple changes
$ git commit -m "fix: Resolve login timeout issue"
$ git commit -m "feat: Add user preference settings"
$ git commit -m "BREAKING CHANGE: Remove deprecated v1 API"
$ git push origin main
```

**Workflow Analysis:**
```
Analyzing 3 commit(s):
  - fix: Resolve login timeout issue         [PATCH]
  - feat: Add user preference settings       [MINOR]
  - BREAKING CHANGE: Remove deprecated v1 API [MAJOR]

Determined bump type: MAJOR  # ← Highest priority wins
```

**Result:**
- Version: 2.2.4 → **3.0.0**
- Git Tag: `v3.0.0`
- CHANGELOG.md updated with all 3 commits listed

## Common Patterns Comparison

| Commit Message | Bump Type | Version Change | Tag |
|----------------|-----------|----------------|-----|
| `feat: Add dashboard` | Minor | 2.2.4 → 2.3.0 | v2.3.0 |
| `fix: Bug in login` | Patch | 2.2.4 → 2.2.5 | v2.2.5 |
| `BREAKING CHANGE: New API` | Major | 2.2.4 → 3.0.0 | v3.0.0 |
| `docs: Update README` | Patch | 2.2.4 → 2.2.5 | v2.2.5 |
| `chore: Update deps` | Patch | 2.2.4 → 2.2.5 | v2.2.5 |

## Timeline Visualization

```
Developer Workflow:
[Code Changes] → [Commit] → [Push to main]
                                    ↓
GitHub Actions Workflow:
[Trigger] → [Analyze Commits] → [Determine Bump Type]
                                         ↓
[Update package.json] → [Update CHANGELOG.md] → [Create Git Tag]
                                                        ↓
[Commit Changes] → [Push to Remote]
                           ↓
Repository Updated:
[New Version] + [New Tag] + [Updated History]
```

## Manual Override Example

If the automated system doesn't detect the right bump:

```bash
# Preview shows wrong bump type
$ node scripts/preview-version-bump.js
# Shows: 2.2.4 → 2.2.5 (patch)
# But you want: 2.2.4 → 2.3.0 (minor)

# Manual bump
$ npm version minor
# Updates package.json to 2.3.0
# Creates tag v2.3.0

# Push
$ git push origin main --tags
```

## Workflow Skip Example

When the version bump workflow commits its changes, it doesn't trigger itself:

```
Commit: "chore: bump version to 2.3.0"
        ↓
Workflow checks: Does message start with "chore: bump version"?
        ↓
YES → Skip workflow (prevents infinite loop)
```

This prevents:
```
Push → Bump → Push → Bump → Push → Bump ... (infinite loop)
```

## Benefits Visualization

### Before Automated Versioning
```
Developer                Manual Process
   ↓                          ↓
[Code]               [Update package.json]
   ↓                          ↓
[Commit]             [Update CHANGELOG.md]
   ↓                          ↓
[Push]               [Create git tag]
                             ↓
                     [Remember to push tag]
                             ↓
                     😓 Multiple steps to forget!
```

### After Automated Versioning
```
Developer          Automated Process
   ↓                      ↓
[Code]           [✓ Update package.json]
   ↓                      ↓
[Commit]         [✓ Update CHANGELOG.md]
   ↓                      ↓
[Push]           [✓ Create git tag]
                         ↓
                 [✓ Push everything]
                         ↓
                 😊 One step, all done!
```

## Real Workflow Example from This PR

This PR itself demonstrates the system:

```bash
Commits in this PR:
1. "feat: implement automated semantic versioning system"  [MINOR]
2. "fix: update GitHub Actions output to use GITHUB_OUTPUT"  [PATCH]
3. "docs: add version bump quick reference guide"  [PATCH]
4. "docs: add comprehensive implementation summary"  [PATCH]

When merged to main:
Highest priority: MINOR (from commit #1)
Version: 2.2.4 → 2.3.0
Tag: v2.3.0
```

---

## See Also

- [VERSIONING.md](VERSIONING.md) - Comprehensive guide
- [VERSION_BUMP_GUIDE.md](VERSION_BUMP_GUIDE.md) - Quick reference
- [AUTOMATED_VERSIONING_SUMMARY.md](AUTOMATED_VERSIONING_SUMMARY.md) - Implementation details
