# Local LLM Runtime Contract

This adapter boundary is intentionally explicit: local model execution is supported only through a configured endpoint and the same orchestration/security path as hosted providers.

Required runtime inputs: `LOCAL_LLM_BASE_URL`, optional `LOCAL_LLM_MODEL`, and an operator-approved local endpoint. The application must not infer that a local model is running merely because the integration file exists.

Verification states:
- `contract-ready`: source/configuration exists.
- `configured`: endpoint is present.
- `live-pass`: a deployment-time health and inference test succeeds.
