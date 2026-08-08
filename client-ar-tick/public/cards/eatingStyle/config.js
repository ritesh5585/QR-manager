export const CARD_CONFIG = {
  id: "eating-style-v1",
  name: "Eating Style Card",
  version: "1.0.0",

  // Reference image path
  referenceImage: "/cards/eatingStyle/reference.jpg",

  // Standard card dimensions (after warp)
  cardWidth: 1000,
  cardHeight: 1500,

  // Checkbox regions in normalized coordinates (0-1 range)
  checkboxes: [
    {
      number: 1,
      title: "i_eat_while_distracted",
      fileType: "mp4",
      displayName: "I Eat While Distracted",
      roi: {
        x: 0.12, // 12% from left
        y: 0.44, // 44% from top
        width: 0.08, // 8% of card width
        height: 0.06, // 6% of card height
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

  // Detection thresholds
  detection: {
    minFillPercentage: 8,
    margin: 15,
    confidenceThreshold: 40,
    minMatches: 30, // Minimum ORB matches for card recognition
  },
};
