export const CARD_CONFIG = {
  id: "eating-style-v1",
  name: "Eating Style Card",
  version: "1.0.0",

  referenceImage: "/cards/eatingStyle/reference.jpg",

  cardWidth: 600,
  cardHeight: 1000,

  checkboxes: [
    {
      number: 1,
      title: "i_eat_while_distracted",
      fileType: "mp4",
      displayName: "I Eat While Distracted",
      roi: {
        x: 0.12,
        y: 0.44,
        width: 0.08,
        height: 0.06,
      },
    },
    {
      number: 2,
      title: "i_eat_in_a_hurry",
      fileType: "mp4",
      displayName: "I Eat In A Hurry",
      roi: {
        x: 0.12,
        y: 0.57,
        width: 0.08,
        height: 0.06,
      },
    },
    {
      number: 3,
      title: "i_eat_mindfully",
      fileType: "jpg",
      displayName: "I Eat Mindfully",
      roi: {
        x: 0.12,
        y: 0.7,
        width: 0.08,
        height: 0.06,
      },
    },
  ],

  detection: {
    minFillPercentage: 8,
    margin: 15,
    confidenceThreshold: 40,
    minMatches: 25,
  },
};
