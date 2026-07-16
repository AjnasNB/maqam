# Maqam exact-approval demo transcript

An agent asks to write release notes. In most systems, approval is just a yes.

Maqam pauses before execution and creates an approval for this exact run, tool, and input fingerprint.

Change even one field after approval, and the call fails closed with approval scope mismatch.

Nothing executes. No file exists.

Restore the exact approved input, and the write runs once.

The saved file is verified, and the approval is consumed.

Try to replay that same approval, and Maqam rejects it.

Execution count stays at one. The file stays unchanged.

The successful call records source evidence, hashes the content, and links a claim to that evidence in the same run.

The final report shows one execution, one approval consumption, one evidence record, one supported claim, and zero unsupported claims.

Policy before execution. Exact approval for the call. Evidence behind the claim.

Install Maqam from npm.

## Accessibility and provenance

This transcript matches `scripts/voiceover-script.json`. Word-level caption timing is generated locally into `public/captions.json` by `scripts/generate-voiceover.ps1`. The rendered video displays those captions, and the narration is synthesized locally with the Windows SAPI voice recorded in `public/voiceover-metadata.json`.
