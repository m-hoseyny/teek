import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  const file = readFileSync(join(process.cwd(), "node_modules/jassub/dist/jassub-worker-modern.wasm"));
  return new Response(file, {
    headers: { "Content-Type": "application/wasm" },
  });
}
