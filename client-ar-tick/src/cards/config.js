export const CARD_CONFIG = {
  cardWidth: 600,
  cardHeight: 1000,
  referenceImage: "/cards/eatingStyle/reference.jpg",

  checkboxes: [
    {
      number: 1,
      title: "I Eat While Distracted",
      fileType: "mp4",
      x: 10.5,
      y: 46,
      size: 6.5,
    },
    {
      number: 2,
      title: "I Eat In A Hurry",
      fileType: "mp4",
      x: 10.5,
      y: 61,
      size: 6.5,
    },
    {
      number: 3,
      title: "I Eat Mindfully",
      fileType: "jpg",
      x: 10.5,
      y: 76,
      size: 6.33,
    },
  ],

  detection: {
    paddingPercent: 0.15,          // REDUCED
    blockSize: 35,
    constantOffset: 5,
    morphKernelSize: 3,
    minStrokeArea: 15,             // RAISED
    maxStrokeArea: 300,
    minDiagonalProjection: 0.25,
    strokeAreaPercentThreshold: 2.5, // NEW
    minConfidence: 50,
    maxFillRatio: 0.65,            // NEW
  },
};