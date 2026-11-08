# Claude-Mem: setup decision and safe installation

Claude-Mem is a third-party **coding-agent memory tool**, not memory for this website's end users. It has **not** been installed in this repository, the website, the Android app or the user's device. Before installation, identify the coding agent (for example Claude Code, Codex or another supported agent), the machine on which it runs, and its operating system. Installing it in a disposable development sandbox would not install it on the user's computer.

The upstream project is <https://github.com/thedotmack/claude-mem>. Check its current README and requirements before installing. As of this review, upstream recommends running the installer **on the intended machine in an interactive terminal**:

```sh
npx claude-mem install --runtime worker
```

The installer asks which agent to configure and may ask before changing existing agent memory settings. Follow its prompts and make those choices locally. For Claude Code, upstream also documents installing from the Claude Code plugin marketplace. Restart the agent and verify that its memory integration works in a new session; an npm library install alone does not register the agent hooks or worker.

## Privacy and costs

- Claude-Mem can capture and process coding-session context, which may contain sensitive project information. Review the upstream privacy and retention settings before enabling it; do not include secrets in sessions or share credentials in chat.
- Upstream states that anonymous usage analytics are enabled by default and documents `npx claude-mem telemetry disable` to turn them off. Verify the current setting and policy yourself.
- Its setup may offer an online observer, sign-in, a trial that asks for a payment method, or a provider such as an existing Anthropic plan, OpenRouter or Gemini. Provider terms, quotas and charges can apply. Choose deliberately on the user's own device; do not assume the trial or authorize purchases.
- This project does not require Claude-Mem for the AI Hub, and it does not alter the production database, backup policy or website backend.
