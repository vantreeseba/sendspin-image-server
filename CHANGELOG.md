# CHANGELOG

<!-- version list -->

## v2.0.0 (2026-10-09)

### Bug Fixes

- **registry**: Stop reusing a loop variable with a different type
  ([`d623eb8`](https://github.com/vantreeseba/sendspin-image-server/commit/d623eb88634f0f736c758e256ead14d9f56e0ce8))

- **server**: Serve clients waking from deep sleep promptly
  ([`8c9c22d`](https://github.com/vantreeseba/sendspin-image-server/commit/8c9c22d5a2cdcf6875f6efbf902fb61857d09ec7))

### Features

- **dither**: Add six-colour e6 palette and rename the old one to e7
  ([`2126196`](https://github.com/vantreeseba/sendspin-image-server/commit/2126196edecc838e075bcdcf7c3a5deccc969769))

- **server**: Add a route to edit an image provider
  ([`7767fc3`](https://github.com/vantreeseba/sendspin-image-server/commit/7767fc333a1a6f3831f83fd792c71f90321d514f))

- **server**: Push on connect, prefetch images and track sleeping clients
  ([`01a0a57`](https://github.com/vantreeseba/sendspin-image-server/commit/01a0a574d0ee39554b07ab864e1d3cb17180b003))

- **server**: Speak sendspin 1.0.0-rc1 through aiosendspin
  ([`1268c35`](https://github.com/vantreeseba/sendspin-image-server/commit/1268c35bb107b4eb77c11b32227937127196981e))

- **ui**: Add an edit dialog for image providers
  ([`8753f39`](https://github.com/vantreeseba/sendspin-image-server/commit/8753f39a03c8a4643e92fe5e988afec527481982))

- **ui**: Convert the web ui to cubeui
  ([`ee31ef9`](https://github.com/vantreeseba/sendspin-image-server/commit/ee31ef9a8ac27ae6912ff59c2115b968370a02f9))

- **ui**: Show sleeping clients with last seen and wake interval
  ([`38e139c`](https://github.com/vantreeseba/sendspin-image-server/commit/38e139c346faae69566cd6b46cd7897b2c93380c))

### Breaking Changes

- **server**: The server id is now the public key of an identity kept in DATA_DIR, so --server-id is
  ignored. The custom "e6-dithered" channel format is no longer accepted in a client hello; set
  dithering per client instead. ArtworkChannel.media_width/media_height are now width/height, and
  reconnect backoff is capped at 300s instead of 15s.


## v1.22.1 (2026-08-31)

### Bug Fixes

- **registry**: Track background writes and validate preset interval
  ([`d6e31ca`](https://github.com/vantreeseba/sendspin-image-server/commit/d6e31cad19c87464a41e1f017519005d2ff612c4))

- **server**: Correct websocket connection types and handler arity
  ([`5df1260`](https://github.com/vantreeseba/sendspin-image-server/commit/5df1260894c65d42cdda8d293174c9cf4797ecc4))

- **ui**: Reset debug preview by remounting on client change
  ([`b66083b`](https://github.com/vantreeseba/sendspin-image-server/commit/b66083b7d77741110591a8a14918b304ab7b0b1e))

### Documentation

- Rewrite ui readme and record completed todo
  ([`b086455`](https://github.com/vantreeseba/sendspin-image-server/commit/b0864555e3b850de6d2e3e4c764fe850e309dbc8))

### Refactoring

- Resolve remaining ruff and mypy findings
  ([`a3c94af`](https://github.com/vantreeseba/sendspin-image-server/commit/a3c94afe3cbf275729ed53ef413308378fffa565))

- **docker**: Install python deps from pyproject
  ([`20538cf`](https://github.com/vantreeseba/sendspin-image-server/commit/20538cf989a291bfcc33d1bd92b8d12b2a4dd01c))

- **ui**: Replace eslint with biome and upgrade to typescript 7
  ([`f13647d`](https://github.com/vantreeseba/sendspin-image-server/commit/f13647d37bf2077e18577d489347bf70709f5593))

### Testing

- Remove duplicate test and guard missing fixtures
  ([`f93d264`](https://github.com/vantreeseba/sendspin-image-server/commit/f93d2644773222ebb99cc4745d5c5c030106bd04))


## v1.22.0 (2026-05-04)


## v1.21.1 (2026-05-04)

### Bug Fixes

- **dither**: Lighten e6natural palette and add yellow to orange
  ([`84bb785`](https://github.com/vantreeseba/sendspin-image-server/commit/84bb7853e1a708d0700976a95e793a97d60f9690))


## v1.21.0 (2026-05-04)

### Features

- **ui**: Add e6natural palette to frontend types and labels
  ([`003e1fe`](https://github.com/vantreeseba/sendspin-image-server/commit/003e1fefb47621b004260590436a938ad62bbcd1))


## v1.20.0 (2026-05-04)


## v1.19.1 (2026-04-28)


## v1.19.0 (2026-04-28)


## v1.18.0 (2026-04-28)


## v1.17.0 (2026-04-28)


## v1.16.6 (2026-04-28)


## v1.16.5 (2026-04-28)


## v1.16.4 (2026-04-28)

### Bug Fixes

- **dither**: Restore wire-remapping with correct 5-colour calibrated palette
  ([`a323215`](https://github.com/vantreeseba/sendspin-image-server/commit/a32321596ba45ea5b499b7fad1e2f2f9e251c0d9))


## v1.16.3 (2026-04-28)


## v1.16.2 (2026-04-28)


## v1.16.1 (2026-04-28)


## v1.16.0 (2026-04-28)


## v1.15.0 (2026-04-28)


## v1.14.0 (2026-04-28)

### Features

- **dither**: Replace custom Floyd-Steinberg with PIL quantize (Waveshare method)
  ([`cce883e`](https://github.com/vantreeseba/sendspin-image-server/commit/cce883e16545773d91449dc47a406bb99e405ab1))


## v1.13.4 (2026-04-28)


## v1.13.3 (2026-04-28)


## v1.13.2 (2026-04-28)


## v1.13.1 (2026-04-28)


## v1.13.0 (2026-04-28)


## v1.12.1 (2026-04-28)


## v1.12.0 (2026-04-28)

### Features

- **ui**: Group clients by status and add test suite
  ([`3cd0c4c`](https://github.com/vantreeseba/sendspin-image-server/commit/3cd0c4cfe42037bbc3fab63d320994aff0c37adc))


## v1.11.0 (2026-04-28)

### Features

- Release new version
  ([`e2f86f7`](https://github.com/vantreeseba/sendspin-image-server/commit/e2f86f7c63c475b7067f253673c3fde9016b07b3))


## v1.10.1 (2026-04-28)

### Bug Fixes

- Await CRUD methods in CLI and Docker logs clean
  ([`5f0e2bb`](https://github.com/vantreeseba/sendspin-image-server/commit/5f0e2bba1070df2089564c2c5ae5effec010631b))


## v1.10.0 (2026-04-27)

### Features

- Release new version
  ([`b541137`](https://github.com/vantreeseba/sendspin-image-server/commit/b5411377eebfb1c3e288b417bd39c4a0ed867527))


## v1.9.0 (2026-04-27)

### Features

- Release new version
  ([`d47589c`](https://github.com/vantreeseba/sendspin-image-server/commit/d47589c488de869528fc6461059d14fa5aa34fed))

- Release new version
  ([`d2558dc`](https://github.com/vantreeseba/sendspin-image-server/commit/d2558dc54d53f7e805aa51499706967281a94006))

### Refactoring

- Rename floyd_steinberg_e6 → dither_to_bytes for clarity
  ([`2042b85`](https://github.com/vantreeseba/sendspin-image-server/commit/2042b85b2e28448c83658a6a9cd60bfb1385bee7))

- Split EndpointRegistry into assignments module
  ([`3062d07`](https://github.com/vantreeseba/sendspin-image-server/commit/3062d0768c11ae95f1b476aadb3449d112e57473))


## v1.8.2 (2026-04-23)

### Bug Fixes

- **server**: Restore floyd_steinberg_e6 public name, per-client image tracking for debug
  ([`d4b86b9`](https://github.com/vantreeseba/sendspin-image-server/commit/d4b86b9f4317e33d4e1964f0f996f69f17081982))


## v1.8.1 (2026-04-23)

### Bug Fixes

- **debug**: Track per-client image bytes for debug preview endpoint
  ([`129d0ce`](https://github.com/vantreeseba/sendspin-image-server/commit/129d0ce604504031aae7f5c97193c1de4be121e1))


## v1.8.0 (2026-04-23)

### Features

- Forcing release of previous.
  ([`3e762c4`](https://github.com/vantreeseba/sendspin-image-server/commit/3e762c40d9e5ad4fd7653282ef22765352d549e6))

### Refactoring

- **dither**: Fix floyd-steinberg palettes, add client debug preview, fix docker mDNS crash
  ([`85a89b8`](https://github.com/vantreeseba/sendspin-image-server/commit/85a89b8d5867c9e1078580ea5422587154a2b218))


## v1.7.1 (2026-04-22)


## v1.7.0 (2026-04-22)


## v1.6.0 (2026-04-17)


## v1.5.1 (2026-04-17)


## v1.5.0 (2026-04-17)

### Features

- Bump version again and force deploy.
  ([`52717e1`](https://github.com/vantreeseba/sendspin-image-server/commit/52717e1957479e5ff28fc0b420f48d255d67f805))


## v1.4.0 (2026-04-17)


## v1.3.1 (2026-03-19)

### Bug Fixes

- Apply EXIF orientation correction to Immich images
  ([`b264805`](https://github.com/vantreeseba/sendspin-image-server/commit/b26480568a4965f8888dd10b89d7a875b3aad43b))

### Documentation

- Rewrite README for end users, add TECHNICAL.md for developers
  ([`c14a953`](https://github.com/vantreeseba/sendspin-image-server/commit/c14a953345f5c46dd5c8077e06450261dc75b8c6))


## v1.3.0 (2026-03-19)

### Features

- Client management UI improvements
  ([`aa8172e`](https://github.com/vantreeseba/sendspin-image-server/commit/aa8172edc3c7e3ae007f71f0301dcfc402d087a1))


## v1.2.0 (2026-03-06)

### Documentation

- **agents**: Prohibit rebasing, require merge for remote integration
  ([`9e39cc4`](https://github.com/vantreeseba/sendspin-image-server/commit/9e39cc42bfc4cd64e06fb88892f6f0fbe967be1c))

### Features

- **ci**: Dispatch publish workflow on tag ref for correct semver docker tags
  ([`4994dc6`](https://github.com/vantreeseba/sendspin-image-server/commit/4994dc6bfb412bd139984434be3d869f20c2e657))

- **ci**: Wire publish to fire directly from release workflow
  ([`e1a3c80`](https://github.com/vantreeseba/sendspin-image-server/commit/e1a3c80d65ccbe29bd39424e191e18608d15d24e))

### Refactoring

- **client**: Remove player and controller roles
  ([`c13aa4e`](https://github.com/vantreeseba/sendspin-image-server/commit/c13aa4e33f32bc8385d895d675c439aa38f8267e))

- **server**: Remove player, controller, and group/update support
  ([`51c4ea6`](https://github.com/vantreeseba/sendspin-image-server/commit/51c4ea6099ba0b2e662aaab0215e4b5ce506be86))

- **stream**: Remove PCM/audio silence machinery
  ([`baddeef`](https://github.com/vantreeseba/sendspin-image-server/commit/baddeef015d6750a641691d5a5a42ce8294033cb))


## v1.1.0 (2026-03-06)

### Features

- Add python-semantic-release for automated versioning and publishing
  ([`6d4b999`](https://github.com/vantreeseba/sendspin-image-server/commit/6d4b99982b0abe6f35f54ccbd1e918437aed5b72))


## v1.0.0 (2026-03-06)

- Initial Release
