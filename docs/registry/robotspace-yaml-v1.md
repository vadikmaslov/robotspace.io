# robotspace.yaml v1

`robotspace.yaml` is an optional public manifest placed in the default branch of a GitHub repository.
RobotSpace reads it as a proposal, never as proof of ownership or compatibility.

```yaml
version: 1
name: Example Navigation
description: Navigation package for a mobile robot.
project_type: navigation
license: Apache-2.0
homepage: https://example.org/navigation
robots:
  - slug: example-mobile-robot
    requirements:
      ros: humble
```

Rules:

- The file is UTF-8 and at most 64 KiB.
- `version` must be integer `1`.
- `name` is 1-255 characters, `description` is at most 4,000 characters.
- `project_type` is one of the Registry project types.
- `license` is at most 100 characters; `homepage` must be credential-free HTTPS.
- `robots` contains at most 50 entries. Each item has a known RobotSpace slug and optional `requirements` object with at most 30 scalar values.
- Unknown fields are rejected so future revisions cannot silently change meaning.

RobotSpace never publishes a project or marks a compatibility as verified from this file. GitHub identity and owner verification are handled separately in phase 4.
