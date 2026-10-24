# Project memory for contributors

The Maqam Community repository can use Qarinah 0.1.8 to preserve reviewable decisions, flow, changes, and project structure across coding-agent sessions. The ledger under `.qarinah/` is evidence-linked project context; it does not replace Git history, issues, pull-request review, or release receipts.

Machine-specific agent-hook files remain local. Contributors install the reviewed Qarinah version and initialize only the agents they use:

```bash
npm install --global qarinah@0.1.8
qarinah setup . --codex --claude --kimi --antigravity --capture content
qarinah doctor
```

Review generated records before committing them. Do not record secrets, credentials, customer data, or private conversations in the public ledger.
