# ADR

Generate Architecture Decision Records (ADRs) through a guided conversation — capture the context, alternatives, decision, and consequences in a structured markdown document.

## What it provides

- **`adr` subagent** — Interviews you about an architectural decision and produces a numbered ADR file under `docs/adr/`.

## ADR format

Each generated record follows the standard ADR template:

```
# <Number>. <Title>
Date: YYYY-MM-DD

## Status
Proposed | Accepted | Deprecated | Superseded

## Context
The problem and forces at play.

## Decision
What was decided and why.

## Consequences
### Positive
### Negative
### Neutral
```

## Usage

```
Create an ADR for our decision to switch from REST to gRPC
```

```
I need to record an architecture decision
```

Credits: By the ECA team.
