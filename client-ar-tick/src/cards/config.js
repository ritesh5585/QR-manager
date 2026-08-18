export const CARD_CONFIG = {
  cardWidth: 600,
  cardHeight: 1000,
  referenceImage: "/cards/eatingStyle/reference.jpg",

  checkboxes: [
    { number: 1, title: "I Eat While Distracted", x: 10.5, y: 46.0, size: 6.5 },
    { number: 2, title: "I Eat In A Hurry", x: 10.5, y: 61.0, size: 6.5 },
    { number: 3, title: "I Eat Mindfully", x: 10.5, y: 76.0, size: 6.3 },
  ],

  detection: {
    claheClipLimit: 2.0,
    claheGridSize: 8,
    insetPercent: 0.1,
    searchPaddingPercent: 0.6,
    diffPixelDelta: 40,
    absoluteFloor: 4,
    absoluteCeiling: 90,
    relativeDeltaOverBaseline: 6,
    minConfidence: 50,
  },
};