# Nix usage

This project ships a `flake.nix` that exposes three outputs for every
supported system.  All commands below are run from the repository root.

## Prerequisites — enable flakes

Nix flakes must be explicitly enabled.  Add the following line to
`~/.config/nix/nix.conf` (create the file if it does not exist):

```
experimental-features = nix-flakes nix-command
```

---

## Flake outputs at a glance

| Command | Output | Purpose |
|---|---|---|
| `nix develop` | `devShells.default` | Interactive dev shell with Node 20, pnpm, and a live Neo4j instance |
| `nix build` | `packages.default` | Reproducible, self-contained `agds` binary under `result/bin/agds` |
| `nix run -- <args>` | `apps.default` | Run `agds` directly without entering a shell or installing anything |

---

## `nix develop` — interactive dev shell

```sh
nix develop
```

On first entry the shell hook runs automatically:

1. Installs Node 20 and pnpm into the shell (nothing is written to the host).
2. Runs `pnpm install --frozen-lockfile`.
3. Compiles all TypeScript packages (`pnpm build`).
4. Adds `packages/cli/dist` to `$PATH` so `agds` is available immediately.
5. Downloads the APOC Core plugin (hash-verified by Nix) and places it in
   `.neo4j/plugins/`.
6. Writes a `neo4j.conf` and `apoc.conf` under `.neo4j/conf/` on first entry.
7. Sets the Neo4j initial password to `agds-dev-password`.
8. Starts the Neo4j 5 Community instance (skipped if already running).

When the prompt returns:

```
AGDS dev environment ready.
  agds --help   show CLI commands
  pnpm test     run all tests
  neo4j stop    stop Neo4j

Neo4j Browser : http://localhost:7474
Credentials   : neo4j / agds-dev-password
```

### Persistent state

All Neo4j state lives under `.neo4j/` in the project root (gitignored):

```
.neo4j/
  conf/      neo4j.conf, apoc.conf
  data/      graph data files
  logs/      neo4j.log, debug.log
  plugins/   apoc-core.jar
  run/       PID file
  import/    CSV / JSON files for LOAD CSV etc.
```

### Neo4j management inside the shell

| Task | Command |
|---|---|
| Stop the database | `neo4j stop` |
| Start the database | `neo4j start` |
| Check running status | `neo4j status` |
| Open the graph browser | http://localhost:7474 |
| Bolt endpoint | `bolt://localhost:7687` |

### Re-entering the shell

Subsequent `nix develop` invocations skip the already-done steps:
- Dependencies are already installed (`pnpm install` is a no-op if the
  lockfile has not changed).
- `neo4j.conf` already exists, so password initialisation is skipped.
- Neo4j is already running, so `neo4j start` is skipped.

For the full workflow inside the dev shell, see [quickstart.md](quickstart.md).

---

## `nix build` — reproducible binary

`nix build` produces a standalone `agds` wrapper at `result/bin/agds` without
requiring pnpm or Node to be installed on the host.  The build is hermetic:
all dependencies are fetched by Nix and hash-verified.

### First build — fix the pnpm hash

The `pnpmDeps` derivation in `flake.nix` records a content hash of all
npm packages.  The first time you build after a lockfile change the hash will
be wrong and the build will fail with a message like:

```
error: hash mismatch in fixed-output derivation:
         specified: sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
            got:    sha256-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=
```

Copy the `got:` hash and paste it into `flake.nix`:

```nix
pnpmDeps = pkgs.fetchPnpmDeps {
  inherit (finalAttrs) pname version src;
  fetcherVersion = 1;
  hash = "sha256-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx=";  # ← paste here
};
```

Then run `nix build` again.

### Build and inspect the result

```sh
nix build

# The result symlink points to the Nix store path.
ls -la result/bin/agds

# Run the built binary directly.
./result/bin/agds --help
```

### What the build produces

```
result/
  bin/
    agds          # bash wrapper: exec node $dest/dist/cli.js "$@"
  lib/
    agds/
      dist/       # compiled TypeScript (cli.js and supporting modules)
      node_modules/
        @agds/    # workspace packages copied as plain directories
        ...       # third-party npm packages
```

The wrapper resolves `node` from the Nix-pinned Node 20 derivation, so the
binary runs identically on any machine where `nix` is available.

---

## `nix run` — run without installing

`nix run` builds the package (using the Nix cache if available) and executes
the resulting binary in a single command.  No shell entry, no global install.

```sh
# Show help
nix run -- --help

# Equivalent to: agds sync --config /path/to/agds.config.json
nix run -- sync --config /path/to/agds.config.json

# Pass any agds subcommand and flags after --
nix run -- doctor
nix run -- verify
nix run -- query "MATCH (d:Document) RETURN d.publicId LIMIT 5"
```

Everything after `--` is forwarded verbatim to `agds`.

> **Note:** `nix run` requires the pnpm hash in `flake.nix` to be correct
> (same requirement as `nix build`).  If the hash is still the placeholder
> `lib.fakeHash`, run `nix build` first to obtain the correct value.

---

## Updating dependencies

When `pnpm-lock.yaml` changes (after `pnpm install` adds or upgrades a
package), the pnpm hash recorded in `flake.nix` becomes stale.  The workflow
is:

1. Run `pnpm install` (inside or outside `nix develop` — both work).
2. Run `nix build`; it will fail with the new correct hash in the error output.
3. Copy the `got:` hash into the `hash` field of `pnpmDeps` in `flake.nix`.
4. Run `nix build` again — it should now succeed.

---

## Updating flake inputs

The pinned versions of `nixpkgs` and `flake-utils` are recorded in
`flake.lock`.  To update them to their latest revisions:

```sh
# Update all inputs
nix flake update

# Update a single input
nix flake update nixpkgs
```

After updating, re-enter `nix develop` to pick up a new Node or Neo4j version
if nixpkgs was bumped.  Run `nix build` and fix the pnpm hash if the Node
version changed and invalidated cached packages.
