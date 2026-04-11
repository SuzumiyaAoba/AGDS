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
      in
      {
        # ---------------------------------------------------------------------------
        # Development shell — `nix develop`
        #
        # Provides Node 20, pnpm, and docker compose. pnpm install + build run
        # automatically on entry so `agds` is available immediately in $PATH.
        # ---------------------------------------------------------------------------
        devShells.default = pkgs.mkShell {
          buildInputs = [
            nodejs
            pnpm
            pkgs.docker-compose
          ];

          shellHook = ''
            echo "==> Installing dependencies…"
            pnpm install --frozen-lockfile

            echo "==> Building packages…"
            pnpm build

            # Expose the compiled CLI on $PATH without a global install.
            export PATH="$PWD/packages/cli/dist:$PATH"
            # Resolve the shebang launcher produced by tsc.
            export AGDS_CLI="$PWD/packages/cli/dist/cli.js"

            echo ""
            echo "AGDS dev environment ready."
            echo "  agds --help          show CLI commands"
            echo "  pnpm test            run all tests"
            echo "  docker compose -f docker/docker-compose.yml up -d   start Neo4j"
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
