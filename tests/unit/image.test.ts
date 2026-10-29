import { describe, expect, it } from "vitest";
import { imageInfo } from "@/lib/image";

function png(w: number, h: number) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}
function jpeg(w: number, h: number) {
  // SOI, APP0 (longueur 4), SOF0 (hauteur puis largeur)
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 0, 0, 0, 0]);
}
function webpVp8x(w: number, h: number) {
  const b = new Uint8Array(32);
  b.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X")]);
  const W = w - 1, H = h - 1;
  b.set([W & 255, (W >> 8) & 255, W >> 16, H & 255, (H >> 8) & 255, H >> 16], 24);
  return b;
}

describe("imageInfo", () => {
  it("lit les dimensions PNG, JPEG et WebP par signature", () => {
    expect(imageInfo(png(512, 512))).toEqual({ mime: "image/png", width: 512, height: 512 });
    expect(imageInfo(jpeg(800, 600))).toEqual({ mime: "image/jpeg", width: 800, height: 600 });
    expect(imageInfo(webpVp8x(1024, 1024))).toEqual({ mime: "image/webp", width: 1024, height: 1024 });
  });
  it("refuse les autres contenus (SVG, PDF, texte)", () => {
    expect(imageInfo(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(imageInfo(new TextEncoder().encode("%PDF-1.7"))).toBeNull();
  });
});
