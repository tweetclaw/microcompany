# Pull Request Tracking

## Claurst WebSearch Fix

**PR Link**: https://github.com/Kuberwastaken/claurst/pull/107

**Status**: ⏳ Pending Review

**Created**: 2026-04-17

**Description**: Fix gzip decompression issue in Brave Search API integration

### What to do when merged:

1. Switch claurst submodule back to upstream:
```bash
cd claurst
git remote set-url origin https://github.com/Kuberwastaken/claurst.git
git fetch origin
git checkout main
git pull origin main
cd ..
```

2. Update main project to use upstream commit:
```bash
git add claurst
git commit -m "chore: update claurst to upstream with merged fix"
git push origin main
```

3. Delete this tracking file:
```bash
rm PR_TRACKING.md
```

### How to check if merged:

**Option 1 - Web Browser**:
Visit: https://github.com/Kuberwastaken/claurst/pull/107

**Option 2 - Command Line**:
```bash
gh pr view 107 --repo Kuberwastaken/claurst
```

Look for status: "Merged" or "Open"

### Current Setup:

- ✅ Using fork: https://github.com/tweetclaw/claurst
- ✅ Fix is working locally
- ⏳ Waiting for upstream merge
