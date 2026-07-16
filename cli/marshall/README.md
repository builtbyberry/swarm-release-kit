# Moved → [builtbyberry/marshall-cli](https://github.com/builtbyberry/marshall-cli)

`@builtbyberry/marshall-cli` is developed and published from its own repo:

### **https://github.com/builtbyberry/marshall-cli**

Nothing to change if you use it — the package name and the `marshall` binary are
unchanged. Install as always:

```
npm install -g @builtbyberry/marshall-cli
marshall login
```

**Upgrade if you are on 0.4.0 or older.** 0.4.0 shipped a retired product name in
the browser page after `marshall login`, and its README pointed at `mcp__srm__*`
— an MCP tool shape no host actually exposes. Both are fixed in 0.5.0, the first
release from the new home.

## Why this file still exists

`@builtbyberry/marshall-cli@0.4.0` declares its homepage as
`https://github.com/builtbyberry/swarm-release-kit/tree/main/cli/marshall` —
this path. Published npm metadata is immutable, so that link points here forever
for anyone reading the 0.4.0 page on npmjs.com. Deleting this directory would
turn a live inbound link into a 404, so the code moved and the signpost stayed.

## Why it moved

The CLI is agent-agnostic, and this repo is organised per agent host — so it fit
here only as long as no second host existed. It also cannot live in the private
app repo: npm provenance requires a **public** source repo, and attests the
tarball against the repo that built it.

0.5.0 onward publishes from marshall-cli via npm trusted publishing (OIDC), and
its provenance names that repo. This repo can no longer publish the package: the
`cli-publish.yml` workflow is gone, so a `cli-v*` tag here does nothing.
