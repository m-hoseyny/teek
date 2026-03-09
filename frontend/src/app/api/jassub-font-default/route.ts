import { readFileSync } from "fs";
import { join } from "path";

export async function GET() {
  const file = readFileSync(join(process.cwd(), "node_modules/jassub/dist/default.woff2"));
  return new Response(file, {
    headers: { "Content-Type": "font/woff2" },
  });
}
