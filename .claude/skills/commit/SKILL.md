# Git Commit Skill

Create well-formatted git commits following conventional commit standards.

## Usage
```
/commit
```

## Behavior
1. Analyze staged changes with `git diff --staged`
2. Generate a conventional commit message
3. Show the commit message to the user and ask for confirmation
4. Create the commit only after the user confirms

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