# V120 FULL CONSOLIDATED MERGE AUDIT

## Sources
- FULL-CONSOLIDATED-MASTER: 227,386,311 bytes; SHA-256 `b9d2dbdaabb64c3ee022fa4722e3d9310c16bda36c96db24d4b8c8b6273d9392`; ZIP test: PASS.
- V101-ACTUAL-WORK-STAGING: 4,954,185 bytes; SHA-256 `91bbccc0ff0669559c592cadddc2745bebc99a28c9ee4260c8d87714ae09aef6`; ZIP test: PASS.
- V120-ACTUAL-WORK-STAGING: 4,946,037 bytes; SHA-256 `c92619986aca850810de5cd04437c01fbbdc6001ab4a0b379f53cfa4a86c6c86`; ZIP test: PASS.

## Merge policy
1. The complete master extraction is preserved under `history/master-227MB/`; nothing from that source is deleted.
2. The exact V101 tree is preserved under `history/V101/` for provenance.
3. V120 is the active `current/` tree.
4. V101's four-color presentation layer is carried forward into V120 via `frontend/assets/v101-palette.css` and linked from homepage/workspace.
5. V120's UX/UI module and V120 design-token layer remain present.
6. The historical backend package version `75.0.0` is intentionally NOT rewritten; changing it previously broke historical compatibility tests.
7. No claim of production-final is made; this is a consolidated V120 staging/release candidate pending live/browser/device verification.

## File counts
- Master extracted files: 1,182
- V101 lineage files: 593
- Active V120 files: 598
