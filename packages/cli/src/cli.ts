#!/usr/bin/env node
import { defineCommand, runMain } from "citty";

const main = defineCommand({
  meta: {
    name: "agds",
    description: "Automated Graph Document System — manage Markdown as a knowledge graph",
  },
  subCommands: {
    init: () => import("./commands/init.js").then((m) => m.default),
    doctor: () => import("./commands/doctor.js").then((m) => m.default),
    migrate: () => import("./commands/migrate.js").then((m) => m.default),
    sync: () => import("./commands/sync.js").then((m) => m.default),
    verify: () => import("./commands/verify.js").then((m) => m.default),
    resolve: () => import("./commands/resolve.js").then((m) => m.default),
    fetch: () => import("./commands/fetch.js").then((m) => m.default),
    neighbors: () => import("./commands/neighbors.js").then((m) => m.default),
    backlinks: () => import("./commands/backlinks.js").then((m) => m.default),
    query: () => import("./commands/query.js").then((m) => m.default),
  },
});

runMain(main);
