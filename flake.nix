{
  description = "AGDS — Automated Graph Document System";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        nodejs = pkgs.nodejs_20;
        pnpm = pkgs.pnpm;

        # APOC Core plugin — required for apoc.merge.relationship used by the
        # Neo4j adapter.  Version must be compatible with pkgs.neo4j (5.26.x).
        apocJar = pkgs.fetchurl {
          url = "https://github.com/neo4j/apoc/releases/download/5.26.0/apoc-5.26.0-core.jar";
          hash = "sha256-nQwHV2+by7uJURgkCtZ0+4sW6iFXq8GDpzOKyvo4Xbg=";
        };
      in
      {
        # ---------------------------------------------------------------------------
        # Development shell — `nix develop`
        #
        # Provides Node 20, pnpm, and a Nix-managed Neo4j 5 instance with APOC.
        # pnpm install + build run automatically on entry, and Neo4j is started
        # so `agds` is available and connected to the database immediately.
        #
        # Neo4j data is stored under .neo4j/ in the project root (gitignored).
        # Stop the database with: neo4j stop
        # ---------------------------------------------------------------------------
        devShells.default = pkgs.mkShell {
          buildInputs = [
            nodejs
            pnpm
            pkgs.neo4j
          ];

          shellHook = ''
            echo "==> Installing dependencies…"
            pnpm install --frozen-lockfile

            echo "==> Building packages…"
            pnpm build

            # Expose `agds` on $PATH without a global install.
            # cli.js has a #!/usr/bin/env node shebang; symlinking it as `agds`
            # lets the shell find it by name.
            chmod +x "$PWD/packages/cli/dist/cli.js"
            ln -sf cli.js "$PWD/packages/cli/dist/agds"
            export PATH="$PWD/packages/cli/dist:$PATH"
            export AGDS_CLI="$PWD/packages/cli/dist/cli.js"

            # ── Neo4j ─────────────────────────────────────────────────────────
            # All mutable state lives under .neo4j/ inside the project root.
            # NEO4J_CONF redirects the neo4j/neo4j-admin binaries away from the
            # read-only Nix-store installation path.
            AGDS_NEO4J_DIR="$PWD/.neo4j"
            export NEO4J_CONF="$AGDS_NEO4J_DIR/conf"

            mkdir -p \
              "$AGDS_NEO4J_DIR/conf" \
              "$AGDS_NEO4J_DIR/data" \
              "$AGDS_NEO4J_DIR/logs" \
              "$AGDS_NEO4J_DIR/plugins" \
              "$AGDS_NEO4J_DIR/run" \
              "$AGDS_NEO4J_DIR/import"

            # Deploy the APOC Core JAR (fetched by Nix, hash-verified).
            cp -f "${apocJar}" "$AGDS_NEO4J_DIR/plugins/apoc-core.jar"

            # Write configuration and set the initial password on first entry.
            if [ ! -f "$NEO4J_CONF/neo4j.conf" ]; then
              echo "==> Initializing Neo4j configuration…"
              cat > "$NEO4J_CONF/neo4j.conf" <<EOF
server.directories.data=$AGDS_NEO4J_DIR/data
server.directories.logs=$AGDS_NEO4J_DIR/logs
server.directories.plugins=$AGDS_NEO4J_DIR/plugins
server.directories.run=$AGDS_NEO4J_DIR/run
server.directories.import=$AGDS_NEO4J_DIR/import

dbms.security.procedures.unrestricted=apoc.*
dbms.security.procedures.allowlist=apoc.*

server.bolt.enabled=true
server.http.enabled=true
server.https.enabled=false
server.bolt.listen_address=:7687
server.http.listen_address=:7474
EOF

              echo "==> Setting Neo4j initial password…"
              neo4j-admin dbms set-initial-password agds-dev-password 2>&1 || true
            fi

            if grep -Eq '^apoc\.' "$NEO4J_CONF/neo4j.conf"; then
              echo "==> Migrating APOC settings to apoc.conf…"
              grep -Ev '^apoc\.' "$NEO4J_CONF/neo4j.conf" > "$NEO4J_CONF/neo4j.conf.tmp"
              mv "$NEO4J_CONF/neo4j.conf.tmp" "$NEO4J_CONF/neo4j.conf"
            fi

            cat > "$NEO4J_CONF/apoc.conf" <<EOF
apoc.export.file.enabled=true
apoc.import.file.enabled=true
apoc.import.file.use_neo4j_config=true
EOF

            # Start Neo4j unless something is already listening on the bolt port.
            # This lets Neo4j Desktop act as the database server: start your
            # Desktop database *before* entering the dev shell and the nix-managed
            # Neo4j will be skipped automatically.
            if (echo >/dev/tcp/localhost/7687) 2>/dev/null; then
              echo "==> Neo4j already reachable on :7687 — skipping nix-managed start."
              echo "    (If this is Neo4j Desktop, make sure APOC Core is installed via"
              echo "     the Desktop plugin manager for full AGDS functionality.)"
              NEO4J_SOURCE="Neo4j Desktop (or external)"
            elif neo4j status > /dev/null 2>&1; then
              echo "==> Neo4j (nix-managed) already running."
              NEO4J_SOURCE="nix-managed"
            else
              echo "==> Starting Neo4j (nix-managed)…"
              neo4j start
              NEO4J_SOURCE="nix-managed"
            fi

            echo ""
            echo "AGDS dev environment ready."
            echo "  agds --help   show CLI commands"
            echo "  pnpm test     run all tests"
            echo ""
            echo "Neo4j ($NEO4J_SOURCE)"
            echo "  Bolt URL       : bolt://localhost:7687"
            echo "  HTTP Browser   : http://localhost:7474"
            echo "  Credentials    : neo4j / agds-dev-password"
            echo ""
            echo "Neo4j Desktop — connect as a remote DBMS:"
            echo "  Add Database → Remote connection → bolt://localhost:7687"
            echo "  Username: neo4j   Password: agds-dev-password"
            if [ "''${NEO4J_SOURCE}" = "nix-managed" ]; then
              echo ""
              echo "  neo4j stop    stop the nix-managed Neo4j"
            fi
          '';
        };

        # ---------------------------------------------------------------------------
        # Reproducible build — `nix build`
        #
        # Produces a standalone `agds` binary under result/bin/agds.
        # After the first build attempt fails with a hash mismatch, copy the
        # correct hash from the error message and set it in pnpmDeps below.
        # ---------------------------------------------------------------------------
        packages.default = pkgs.stdenv.mkDerivation (finalAttrs: {
          pname = "agds";
          version = "0.0.0";

          src = pkgs.lib.cleanSource ./.;

          nativeBuildInputs = [
            nodejs
            pkgs.pnpmConfigHook
          ];

          pnpmDeps = pkgs.fetchPnpmDeps {
            inherit (finalAttrs) pname version src;
            fetcherVersion = 1;
            # Run `nix build` once; copy the correct hash from the error output.
            hash = pkgs.lib.fakeHash;
          };

          buildPhase = ''
            runHook preBuild
            pnpm --recursive --if-present run build
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            # Install the compiled CLI and its workspace node_modules.
            local dest="$out/lib/agds"
            mkdir -p "$dest" "$out/bin"

            cp -r packages/cli/dist "$dest/dist"
            cp -r node_modules      "$dest/node_modules"

            # Re-create the workspace package symlinks expected by Node's resolver.
            for pkg in core schema adapter-neo4j adapter-store-fs runtime cli; do
              mkdir -p "$dest/node_modules/@agds"
              cp -r "packages/$pkg" "$dest/node_modules/@agds/$pkg"
            done

            # Wrapper script — lets users call `agds` without knowing the Nix path.
            cat > "$out/bin/agds" <<EOF
            #!${pkgs.bash}/bin/bash
            exec ${nodejs}/bin/node "$dest/dist/cli.js" "\$@"
            EOF
            chmod +x "$out/bin/agds"

            runHook postInstall
          '';

          meta = with pkgs.lib; {
            description = "Automated Graph Document System CLI";
            license = licenses.mit;
            maintainers = [ ];
            platforms = platforms.unix;
            mainProgram = "agds";
          };
        });

        # ---------------------------------------------------------------------------
        # Run the CLI — `nix run`
        # ---------------------------------------------------------------------------
        apps.default = {
          type = "app";
          program = "${self.packages.${system}.default}/bin/agds";
        };
      }
    );
}
