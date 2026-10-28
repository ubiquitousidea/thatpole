// Look-and-feel knobs and the entry-time table.

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

// When you get to Queensboro Plaza on a weekday, which sets the sun (sun.js)
// and how packed the car is. The crowds follow the N's morning peak: the car
// leaves Queensboro Plaza at its fullest, and NYCT's guideline load for a 75 ft
// car is about 145. 8 AM is the peak hour, over the guideline.
//
// seated: riders already sitting when you board (72 seats; one is always left
// free). standing: riders standing, every one of them wanting a seat. jolt:
// scales every lurch of the train. holds: stops in the tunnel "by the train's
// dispatcher". claim: seconds a free pole slot stays free before a standing
// rider goes for it. space: personal-space radius in meters (it shrinks as the
// car packs in). temper: how fast riders get annoyed. bump: how much stumbling
// into someone annoys them (a packed car expects to be bumped).
export const TIMES = {
  7: {
    label: '7 AM', hour: 7, seated: 58, standing: 30, jolt: 1, holds: 0,
    claim: [6, 10], space: 0.6, temper: 0.8, bump: 1,
  },
  8: {
    label: '8 AM', hour: 8, seated: 71, standing: 80, jolt: 1, holds: 2,
    claim: [1.5, 4], space: 0.4, temper: 1.1, bump: 0.5,
  },
  9: {
    label: '9 AM', hour: 9, seated: 66, standing: 46, jolt: 1, holds: 1,
    claim: [3, 6], space: 0.55, temper: 1, bump: 0.75,
  },
};
