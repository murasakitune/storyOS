import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("build", { recursive: true });
await sharp("public/icon.svg").resize(512, 512).png().toFile("build/icon.png");
