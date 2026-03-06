# Agent Instructions

## Commit Style

All commits must follow the **Angular/Semantic commit convention**:

```
<type>(<scope>): <short summary>
```

### Types

| Type       | When to use                                              |
|------------|----------------------------------------------------------|
| `feat`     | A new feature                                            |
| `fix`      | A bug fix                                                |
| `refactor` | Code change that neither fixes a bug nor adds a feature  |
| `style`    | Formatting, whitespace, UI-only visual changes           |
| `docs`     | Documentation only                                       |
| `chore`    | Build process, dependency updates, tooling               |
| `test`     | Adding or fixing tests                                   |
| `perf`     | Performance improvement                                  |

### Rules

- The summary line must be **lowercase** and **imperative mood** (e.g. `add`, `fix`, `update`, not `added`, `fixes`, `updating`)
- No period at the end of the summary line
- Keep the summary under 72 characters
- Use a blank line between the subject and body when a body is needed
- Breaking changes must include `BREAKING CHANGE:` in the commit body or use `!` after the type/scope (e.g. `feat!:`)

### Examples

```
feat(ui): add dark mode toggle with localStorage persistence
fix(registry): save api_key correctly when persisting immich endpoints
chore(docker): add two-stage build for react ui
style(cards): restore default padding and increase title font size
refactor(dither): extract dither algorithms into named functions
```

## Scope Guidelines

| Scope         | Covers                                          |
|---------------|-------------------------------------------------|
| `ui`          | React frontend (`ui/src/`)                      |
| `server`      | WebSocket server (`server.py`)                  |
| `cli`         | Entrypoint and HTTP/REST layer (`cli.py`)        |
| `registry`    | Endpoint registry (`registry.py`)               |
| `endpoints`   | Image provider classes (`endpoints.py`)         |
| `db`          | Database layer (`db.py`)                        |
| `dither`      | Dithering pipeline (`dither.py`)                |
| `stream`      | Image push pipeline (`stream.py`)               |
| `docker`      | Dockerfile, `.dockerignore`                     |
| `deps`        | `pyproject.toml` dependency changes             |
