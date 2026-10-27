// Look-and-feel knobs and the difficulty table.

// Chunkiness of the 3D view: about how many fat pixels tall the screen is, on
// every screen. Lower is chunkier.
export const SCENE_RES = 230;

// The HUD (text, panels) gets the largest whole-CSS-px fat pixel that still
// leaves at least this many fat pixels across, so the 8px font always fits.
export const HUD_RES = { w: 480, h: 280 };

// seated/standing: how many riders. jolt: scales every lurch of the train.
// holds: stops in the tunnel "by the train's dispatcher". claim: seconds a
// free pole slot stays free before a standing rider goes for it. stay: seconds
// a rider keeps a pole before moving. space: personal-space radius in meters.
// temper: how fast riders get annoyed.
export const DIFFICULTY = {
  easy: {
    label: 'Easy', seated: 12, standing: 6, jolt: 0.7, holds: 0,
    claim: [9, 15], stay: [25, 50], space: 0.55, temper: 0.6,
  },
  normal: {
    label: 'Normal', seated: 30, standing: 14, jolt: 1, holds: 1,
    claim: [4, 8], stay: [15, 35], space: 0.65, temper: 1,
  },
  rush: {
    label: 'Rush Hour', seated: 59, standing: 28, jolt: 1.3, holds: 2,
    claim: [1.5, 4], stay: [10, 25], space: 0.7, temper: 1.3,
  },
};
