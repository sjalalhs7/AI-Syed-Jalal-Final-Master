# AI Assistant Contract

The assistant layer is authoritative only over application state it is explicitly permitted to access.

Required flow:
User intent → policy check → plan → allowed tools → verification → human approval when required → result → audit event.

No fabricated telemetry, physical sensations, provider success, device access, or production status.
