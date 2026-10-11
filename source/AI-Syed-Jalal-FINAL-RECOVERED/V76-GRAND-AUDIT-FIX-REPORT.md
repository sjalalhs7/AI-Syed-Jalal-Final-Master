# V76 Grand Audit & Fix Report

## Fixed in this release

- Fixed CORS preflight to explicitly allow `X-CSRF-Token`, matching the frontend's CSRF header.
- Removed obsolete historical release scripts from the current release command set so the maintained release suite cannot accidentally execute stale V50 assertions.
- Updated the legacy V73 final test so it validates semantic compatibility rather than requiring the obsolete package version `73.0.0`.
- Added a current V76 audit baseline test covering the actual V75 implementation.
- Added a current release test command that runs only the maintained release gates.

## Verified

- 3,500 skills in the skill registry.
- 120 executable catalog roles.
- 303 imported Agency specialist profiles.
- 16 Agency tool targets.
- OpenCode integration contract present.
- Android IDE integration contract present.
- AI quality verification/repair hooks present.
- Homepage/login identity markers present.
- Production CORS wildcard is rejected when cookie sessions are enabled.

## Not falsely marked as fixed

- Historical V25 source archive is absent from the V75 package, so byte-for-byte historical preservation cannot be proven.
- Real provider execution still requires configured provider credentials and a deployed database/API environment.
- Agency profiles remain capability/prompt references; they are not 303 independent model runtimes.
- Demo/local frontend mode remains intentionally available and must not be described as live backend execution.

## Release principle

No new agent-count inflation or cosmetic version claims should be used as a substitute for functionality verification.
