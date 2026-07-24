# Coding Standards

<!-- Customize this file with your project's coding standards.
     The reviewer agent loads it during code review via @.sandcastle/CODING_STANDARDS.md
     so these standards are enforced during review without costing tokens during implementation. -->

## Comments

- Only comment what the code can't say itself. If the name or the line
  below already says it, delete it.
- One line by default. Over ~3 lines needs a reason the reader couldn't
  reconstruct from the code — typically a constraint that makes correct
  code look wrong.
- Never narrate the change. No "now uses X", "changed to Y", "for now" —
  comments describe the code as it stands, not its history.
- One-line docblocks are fine on exported API. Drop them when they only
  restate the signature; keep them for units, invariants, sentinel
  values, and caller obligations.
- No roadmaps or future work in code. Use a single `// TODO(#42): ...`
  linking the issue, or write it up in a doc.

## Style

<!-- Example:
- Use camelCase for variables and functions
- Use PascalCase for classes and types
- Prefer named exports over default exports
-->

## Testing

<!-- Example:
- Every public function must have at least one test
- Use descriptive test names that explain the expected behavior
-->

## Architecture

<!-- Example:
- Keep modules focused on a single responsibility
- Prefer composition over inheritance
-->
