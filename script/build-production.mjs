// Produce the production build in `dist/` from the development build in
// `dist/dev/`. `micromark-build` strips `devlop` assertions and inlines
// `micromark-util-symbol` constants, matching how the micromark ecosystem
// ships its own dual development/production conditions. It operates on the
// `dev/` folder relative to the working directory, hence the `cwd`.
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist/", import.meta.url));
const bin = fileURLToPath(new URL("../node_modules/.bin/micromark-build", import.meta.url));

execFileSync(bin, [], { cwd: dist, stdio: "inherit" });
