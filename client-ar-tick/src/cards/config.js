// cards/config.js - Updated to match reference-style detection

export const CARD_CONFIG = {
  cardWidth: 600,
  cardHeight: 1000,
  referenceImage: "/cards/eatingStyle/reference.jpg",

  // These are now used only for titles/debug, not for ROI positions
  checkboxes: [
    {
      number: 1,
      title: "I Eat While Distracted",
      fileType: "mp4",
    },
    {
      number: 2,
      title: "I Eat In A Hurry",
      fileType: "mp4",
    },
    {
      number: 3,
      title: "I Eat Mindfully",
      fileType: "jpg",
    },
  ],

  detection: {
    margin: 12,  // Percentage points above baseline
    minConfidence: 30,
    maxFillPercentage: 100,
    minFillPercentage: 20,
  },
};