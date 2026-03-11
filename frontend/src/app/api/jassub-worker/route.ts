import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  const file = readFileSync(join(process.cwd(), "node_modules/jassub/dist/jassub-worker.js"));
  return new Response(file, {
    headers: { "Content-Type": "application/javascript" },
  });
}
