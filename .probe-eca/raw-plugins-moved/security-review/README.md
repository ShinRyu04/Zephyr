# Security Review

A language-agnostic security code review subagent that analyzes code for vulnerabilities, following OWASP guidelines and security best practices.

## What it provides

- **`security-reviewer` subagent** — A Senior Application Security Engineer persona that reviews staged changes or specified files with structured, severity-rated findings.

## Review focus areas

1. **Injection** — SQL injection, command injection, XSS, template injection
2. **Authentication & Authorization** — Broken auth, missing access controls, privilege escalation
3. **Data Exposure** — Sensitive data in logs, verbose errors, missing encryption
4. **Configuration** — Hardcoded secrets, insecure defaults, missing security headers
5. **Dependencies** — Known vulnerable patterns, unsafe deserialization
6. **Input Validation** — Missing validation, type confusion, path traversal
7. **Cryptography** — Weak algorithms, improper key management, predictable randomness

## Severity levels

- **Critical** — Directly exploitable vulnerability with severe impact (e.g., RCE, authentication bypass)
- **High** — Significant vulnerability that could lead to data breach or privilege escalation
- **Medium** — Security weakness that requires specific conditions to exploit
- **Low** — Minor issue or hardening recommendation with limited direct impact

## Usage

Ask ECA to review your code for security issues:

```
Review my staged changes for security vulnerabilities
```

```
Security review the authentication module
```

Credits: By the ECA team.
