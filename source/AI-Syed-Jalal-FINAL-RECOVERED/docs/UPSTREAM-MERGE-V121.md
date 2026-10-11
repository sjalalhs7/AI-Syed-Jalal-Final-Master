# Upstream merge decisions (V121)
| Repo | Decision | Why |
|---|---|---|
| superpowers | MERGED: 15 real skills + `/api/library` + dashboard Library tab | MIT, small, plain markdown, directly usable as agent playbooks. Before this, the project only had two label strings, no skill content |
| awesome-llm-apps | INDEXED: 88 templates listed with category, description, dependencies | 94 MB of separate Python demos; bundling would bloat deploys and each needs its own API keys. Keep the original zip beside the project and copy a demo when you pick one |
| agentscope | GAP-ANALYSED. Missing in our project: rag, embedding, realtime, tts, workspace, formatter, middleware, sop, credential, classifier | Python framework; cannot be merged into a Node backend. Port ideas one at a time, starting with RAG (needed for Memory & Knowledge) |
| MedicalGPT | REFERENCE ONLY (pt, sft, rm, ppo, dpo, orpo, grpo, quant) | Needs GPUs and licensed medical data; it trains models, it is not an app feature. Its DISCLAIMER applies to any health-advice agent |
| OpenEMR | NOT MERGED | GPL-3.0 PHP medical-records system, 151 MB. Copying it would force GPL on this project and make you responsible for patient data law (HIPAA or local equivalent). If needed, run it separately and connect through its REST/FHIR API after a legal and security review |
