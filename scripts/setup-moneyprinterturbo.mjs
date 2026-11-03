import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(
  readFileSync(path.join(root, "scripts/media/moneyprinterturbo.json"), "utf8"),
);
const home = path.join(root, ".tools/moneyprinterturbo"),
  source = path.join(home, "source"),
  venv = path.join(home, "venv");
const run = (command, args, options = {}) =>
  execFileSync(command, args, { cwd: root, stdio: "inherit", ...options });
mkdirSync(home, { recursive: true });
if (!existsSync(path.join(source, ".git")))
  run("git", [
    "clone",
    "--filter=blob:none",
    "--depth=1",
    "--no-checkout",
    lock.repository,
    source,
  ]);
try {
  run("git", ["-C", source, "cat-file", "-e", lock.commit + "^{commit}"], {
    stdio: "ignore",
  });
} catch {
  run("git", ["-C", source, "fetch", "--depth", "1", "origin", lock.commit]);
}
run("git", [
  "-C",
  source,
  "sparse-checkout",
  "set",
  "--no-cone",
  "/app/",
  "/config.example.toml",
  "/LICENSE",
  "/pyproject.toml",
  "/cli.py",
  "/resource/fonts/" + lock.font,
]);
run("git", ["-C", source, "checkout", "--detach", lock.commit]);
let python;
for (const candidate of [
  process.env.MPT_SETUP_PYTHON,
  "python3.12",
  "python3.11",
  "python3.13",
  "python3",
].filter(Boolean)) {
  try {
    execFileSync(
      candidate,
      ["-c", "import sys; assert sys.version_info >= (3, 11)"],
      { stdio: "ignore" },
    );
    python = candidate;
    break;
  } catch {}
}
if (!python)
  throw new Error(
    "Install Python 3.11+ or set MPT_SETUP_PYTHON, then run npm run media:setup again.",
  );
if (
  !existsSync(
    path.join(
      venv,
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    ),
  )
)
  run(python, ["-m", "venv", venv]);
const executable = path.join(
  venv,
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
run(executable, [
  "-m",
  "pip",
  "install",
  "-r",
  path.join(root, "scripts/media/requirements.lock"),
]);
const runtime = path.join(home, "runtime");
mkdirSync(path.join(runtime, "resource/fonts"), { recursive: true });
copyFileSync(
  path.join(source, "resource/fonts", lock.font),
  path.join(runtime, "resource/fonts", lock.font),
);
copyFileSync(
  path.join(root, "scripts/media/BeVietnamPro-OFL.txt"),
  path.join(runtime, "resource/fonts/BeVietnamPro-OFL.txt"),
);
if (!existsSync(path.join(runtime, "config.toml")))
  writeFileSync(
    path.join(runtime, "config.toml"),
    '[app]\nvideo_codec = "libx264"\n[diagnostics]\nlog_level = "WARNING"\nlog_requests = false\n',
  );
run(executable, [path.join(root, "scripts/media/mpt-render.py"), "--check"], {
  env: { ...process.env, MPT_HOME: runtime, WORLDNEWS_MPT_SOURCE: source },
});
writeFileSync(
  path.join(home, "ready.json"),
  JSON.stringify({ ...lock, installedAt: new Date().toISOString() }, null, 2),
);
console.log(
  "MoneyPrinterTurbo is ready. Select it in Preview → Video renderer.",
);
