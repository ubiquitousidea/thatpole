// Look-and-feel knobs and the difficulty table.

// Chunkiness of the 3D view: about how many fat pixels tall the screen is, on
// every screen. Lower is chunkier.
export const SCENE_RES = 230;

// The first-person lens. corner: half-angle in degrees at the screen corner.
// fisheye: kappa in r ~ kappa tan(theta / kappa); 1 is a plain perspective
// camera, 2 is stereographic. supersample: the most the scene is rendered
// over the scene grid, to keep the magnified middle of the view sharp.
export const VIEW = { corner: 75, fisheye: 2, supersample: 3 };

// The HUD (text, panels) gets the largest whole-CSS-px fat pixel that still
// leaves at least this many fat pixels across, so the 8px font always fits.
export const HUD_RES = { w: 480, h: 280 };

// seated: riders already sitting when you board. standing: riders standing,
// every one of them looking for a seat (60 in the car). jolt: scales every
// lurch of the train. holds: stops in the tunnel "by the train's dispatcher".
// claim: seconds a free pole slot stays free before a standing rider goes for
// it. space: personal-space radius in meters. temper: how fast riders get
// annoyed.
export const DIFFICULTY = {
  easy: {
    label: 'Easy', seated: 6, standing: 12, jolt: 0.7, holds: 0,
    claim: [9, 15], space: 0.55, temper: 0.6,
  },
  normal: {
    label: 'Normal', seated: 22, standing: 48, jolt: 1, holds: 1,
    claim: [4, 8], space: 0.65, temper: 1,
  },
  rush: {
    label: 'Rush Hour', seated: 30, standing: 57, jolt: 1.3, holds: 2,
    claim: [1.5, 4], space: 0.7, temper: 1.3,
  },
};
