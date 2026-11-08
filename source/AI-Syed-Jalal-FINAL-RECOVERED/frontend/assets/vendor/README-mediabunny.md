# Mediabunny

`mediabunny-1.65.2.min.mjs` is the unmodified browser bundle from
[Mediabunny 1.65.2](https://github.com/Vanilagy/mediabunny), licensed under
Mozilla Public License 2.0; see `mediabunny-LICENSE.txt`.

The exact source form, including TypeScript sources and build metadata, is
available in the upstream npm release:
https://registry.npmjs.org/mediabunny/-/mediabunny-1.65.2.tgz

The vendored bundle's SHA-256 is
`08149edcc8cf980da65d94a0a54a8fc0fa85a65f89b66f55c906f33618363919`.
It is included because both hosting targets publish this frontend as static
files without a JavaScript build step. The media editor imports it locally and
does not send files to the library maintainer or any external service.
