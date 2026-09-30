/*
 * PATCH (Aqua Clock): a level-of-detail dial for the vendored Riverscape.
 *
 * Riverscape is a desktop wallpaper on mains power: ~1.28M triangles, of which
 * 873k go through the shadow map a second time. An ambient clock left running
 * for hours on an old iPad is the opposite load profile, so the counts and
 * tessellation it hard-codes are scaled through here instead.
 *
 * Set before createEnvironment/createPlants are called; nothing reads it after
 * the scene is built.
 */
export const LOD = {
  leaf: 1,       // ribbon-leaf tessellation (rows and cols)
  rockDetail: 1, // sphere detail the stones are carved from
  fronds: 1,     // moss fronds on wood, stone and sand
  particles: 1,  // suspended detritus and pearling bubbles
};

export const PROFILES = {
  rich: { leaf: 1, rockDetail: 1, fronds: 1, particles: 1 },
  lite: { leaf: 0.45, rockDetail: 0.34, fronds: 0.28, particles: 0.4 },
};

export function setLOD(profile) {
  Object.assign(LOD, PROFILES[profile] || PROFILES.rich);
  return LOD;
}

/** Scale a hard-coded count, never below a floor that keeps the shape. */
export const lodCount = (n, factor, floor = 1) =>
  Math.max(floor, Math.round(n * factor));
