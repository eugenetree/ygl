# Git Commit Skill

Create well-formatted git commits following conventional commit standards.

## Usage
```
/commit
```

## Behavior
1. Check `git diff --staged`. If nothing is staged, run `git add -A` to stage all changes
2. Analyze staged changes with `git diff --staged`
3. Generate a conventional commit message (don't include any AI model as a co-author)
4. Show the commit message to the user and ask for confirmation
5. Create the commit only after the user confirms

## Commit Format
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

## Types
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style changes
- refactor: Code refactoring
- test: Adding or modifying tests
- chore: Maintenance tasks

## Example Output
```
feat(auth): add password reset functionality

- Add forgot password form
- Implement email verification flow
- Add password reset endpoint
```