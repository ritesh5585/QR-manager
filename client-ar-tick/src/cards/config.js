export const CARD_CONFIG = {
  cardWidth: 600,
  cardHeight: 1000,
  referenceImage: "/cards/eatingStyle/reference.jpg",

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
    margin: 15,
    minConfidence: 40,
    maxFillPercentage: 100,
    minFillPercentage: 20,
  },
};