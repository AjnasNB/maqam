# Maqam 0.3.3

Maqam 0.3.3 is a registry-presentation patch for the stable 0.3 line.

## What changes

- The npm README no longer renders the historical proof poster or the two large
  architecture diagrams.
- The README leads with the product promise, current install commands, complete
  capability inventory, and links to reproducible proof media.
- Package, CLI, MCP client, clean-consumer, and trusted-publishing identities
  are aligned to `0.3.3`.

## Runtime boundary

No policy, approval, evidence, browser, crawler, source-routing, network, or
tool-dispatch behavior changes in this patch.

## Verify the public artifact

```bash
npm view maqam@0.3.3 version gitHead dist.integrity
npm view maqam dist-tags.latest
npm install maqam@0.3.3
```

The npm `gitHead`, provenance, integrity, and matching `v0.3.3` GitHub release
must identify the same reviewed main commit.
