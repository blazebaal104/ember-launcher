import { useEffect, useRef } from "react";
import * as skinview3d from "skinview3d";

export type Pose = "idle" | "walk" | "run" | "wave" | "crouch" | "fly";
export type Back = "cape" | "elytra" | "none";

/**
 * The player as others see them in game: a 3D model (skinview3d) you can drag to rotate and
 * scroll to zoom, with the name tag above it.
 */
export function SkinViewer({
  skin,
  slim,
  cape,
  back = "cape",
  pose = "idle",
  name,
  autoRotate = false,
  resetKey = 0,
  paused = false,
  outerLayer = true,
  className = "",
}: {
  skin: string | null | undefined;
  slim: boolean;
  cape?: string | null;
  back?: Back;
  pose?: Pose;
  name?: string;
  autoRotate?: boolean;
  /** Change to put the camera back where it started. */
  resetKey?: number;
  paused?: boolean;
  /** Show the second skin layer (hat, jacket, sleeves...). */
  outerLayer?: boolean;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const viewer = useRef<skinview3d.SkinViewer | null>(null);

  // create once
  useEffect(() => {
    if (!canvas.current || !wrap.current) return;
    const v = new skinview3d.SkinViewer({
      canvas: canvas.current,
      width: Math.max(1, wrap.current.clientWidth),
      height: Math.max(1, wrap.current.clientHeight),
      preserveDrawingBuffer: false,
    });
    v.fov = 45;
    v.zoom = 0.62;
    // a three-quarter view, like the official launcher
    v.playerWrapper.rotation.y = -0.5;
    v.controls.enableRotate = true;
    v.controls.enableZoom = true;
    v.controls.enablePan = false;
    v.globalLight.intensity = 3;
    v.cameraLight.intensity = 0.6;
    viewer.current = v;
    const ro = new ResizeObserver(() => {
      const w = wrap.current?.clientWidth ?? 0, h = wrap.current?.clientHeight ?? 0;
      if (w > 0 && h > 0) v.setSize(w, h);
    });
    ro.observe(wrap.current);
    return () => {
      ro.disconnect();
      v.dispose();
      viewer.current = null;
    };
  }, []);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    if (skin) v.loadSkin(skin, { model: slim ? "slim" : "default" });
    else v.loadSkin(null);
  }, [skin, slim]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    if (cape && back !== "none") v.loadCape(cape, { backEquipment: back === "elytra" ? "elytra" : "cape" });
    else v.loadCape(null);
  }, [cape, back]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.animation =
      pose === "walk" ? new skinview3d.WalkingAnimation()
      : pose === "run" ? new skinview3d.RunningAnimation()
      : pose === "wave" ? new skinview3d.WaveAnimation()
      : pose === "crouch" ? new skinview3d.CrouchAnimation()
      : pose === "fly" ? new skinview3d.FlyingAnimation()
      : new skinview3d.IdleAnimation();
  }, [pose]);

  useEffect(() => {
    const v = viewer.current;
    if (!v) return;
    v.nameTag = name ? new skinview3d.NameTagObject(name, { textStyle: "white", font: "48px \"Pixelify Sans\", \"Schibsted Grotesk\", sans-serif", repaintAfterLoaded: true }) : null;
  }, [name]);

  useEffect(() => {
    const v = viewer.current;
    if (v) v.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    const v = viewer.current;
    if (v?.animation) v.animation.paused = paused;
  }, [paused, pose]);

  useEffect(() => {
    viewer.current?.playerObject.skin.setOuterLayerVisible(outerLayer);
  }, [outerLayer, skin]);

  useEffect(() => {
    const v = viewer.current;
    if (!v || resetKey === 0) return;
    v.resetCameraPose();
    v.zoom = 0.62;
  }, [resetKey]);

  return (
    // Positioned by the caller (e.g. "absolute inset-0"); never mix with "relative", which
    // would collapse the box to 0 px tall (the canvas inside is absolutely positioned).
    <div ref={wrap} className={`cursor-grab active:cursor-grabbing ${className.includes("absolute") ? className : `relative h-full w-full ${className}`}`}>
      <canvas ref={canvas} className="absolute inset-0 size-full" aria-label="3D preview of your skin: drag to rotate, scroll to zoom" />
    </div>
  );
}

/** Flat front view of a skin (head, body, arms, legs) for small previews. */
export function SkinFront({ skin, slim, size = 64 }: { skin: string; slim: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const c = ref.current;
      if (!c) return;
      const g = c.getContext("2d");
      if (!g) return;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, 16, 32);
      const legacy = img.height === 32;
      const arm = slim ? 3 : 4;
      // [sx, sy, w, h, dx, dy] base layer, then the overlay ("hat"/jacket) layer
      const parts: [number, number, number, number, number, number][] = [
        [8, 8, 8, 8, 4, 0], [20, 20, 8, 12, 4, 8],
        [44, 20, arm, 12, 4 - arm, 8], legacy ? [44, 20, arm, 12, 12, 8] : [36, 52, arm, 12, 12, 8],
        [4, 20, 4, 12, 4, 20], legacy ? [4, 20, 4, 12, 8, 20] : [20, 52, 4, 12, 8, 20],
      ];
      const over: [number, number, number, number, number, number][] = legacy ? [[40, 8, 8, 8, 4, 0]] : [
        [40, 8, 8, 8, 4, 0], [20, 36, 8, 12, 4, 8], [44, 36, arm, 12, 4 - arm, 8], [52, 52, arm, 12, 12, 8], [4, 36, 4, 12, 4, 20], [4, 52, 4, 12, 8, 20],
      ];
      for (const [sx, sy, w, h, dx, dy] of [...parts, ...over]) g.drawImage(img, sx, sy, w, h, dx, dy, w, h);
    };
    img.src = skin;
  }, [skin, slim]);
  return <canvas ref={ref} width={16} height={32} style={{ width: size / 2, height: size, imageRendering: "pixelated" }} aria-hidden />;
}

/** The front of a cape texture (10x16 pixels at 1,1). */
export function CapeFront({ cape, size = 48 }: { cape: string; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const g = ref.current?.getContext("2d");
      if (!g) return;
      g.imageSmoothingEnabled = false;
      const s = img.width / 64; // HD capes are larger
      g.clearRect(0, 0, 10, 16);
      g.drawImage(img, 1 * s, 1 * s, 10 * s, 16 * s, 0, 0, 10, 16);
    };
    img.src = cape;
  }, [cape]);
  return <canvas ref={ref} width={10} height={16} style={{ width: (size * 10) / 16, height: size, imageRendering: "pixelated" }} aria-hidden />;
}
