# Maqam public claims checklist

## Supported

- Maqam is an MIT-licensed, provider-neutral TypeScript boundary for registered agent operations.
- Policy is evaluated before a registered dispatch.
- Required approval can be bound to the exact run, tool, and canonical input hash.
- Approval is one-use by default; the included proof covers changed-input and replay rejection.
- Maqam records traces and evidence for operations routed through its boundary.
- The package supports maintained Node.js 22, 24, and 26 release lines.
- The local core requires no Maqam account or Maqam API key.

## Always qualify

- “Governed” means the host routed the real operation through a registered adapter.
- Evidence records provenance and outcomes; it does not prove a claim is true.
- Browser and crawler features have separate network, driver, credential, and site-policy boundaries.
- Benchmark numbers apply only to their published fixtures and environments.
- The future operating-system direction remains a roadmap until process, filesystem, network, identity, secret, and device mediation exist.

## Do not claim

- universal interception, safety, compliance, prompt-injection immunity, or tamper-proof operation;
- that installing Maqam automatically governs direct SDK, shell, browser, filesystem, or OS calls;
- universal internet access or no-key access to every provider;
- that an approval authorizes changed input, repeated execution, or an unregistered tool;
- that Maqam replaces an agent SDK, durable orchestrator, identity platform, sandbox, or policy service; or
- benchmark-derived cost savings without provider-native billing evidence.

## Release truth before every launch

```sh
npm view maqam@0.3.2 version gitHead dist.integrity
```

Match the immutable registry record to the reviewed GitHub tag and release before using a version-specific claim.
