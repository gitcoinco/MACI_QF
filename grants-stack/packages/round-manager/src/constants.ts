export const errorModalDelayMs = 3000;
export const modalDelayMs = 1000;
export const maxDateForUint256 = new Date(8640000000000000);
export const ZuzaluEvents = [
  //Zuzalu (Montenegro, 2023)
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "05e0c4e8517758da3a26c80310ff2fe65b9f85d89dfc9c80e6d0b6477f88173e",
      "29ae64b615383a0ebb1bc37b3a642d82d37545f0f5b1444330300e4c4eedba3f",
    ],
    eventId: "5de90d09-22db-40ca-b3ae-d934573def8b",
    eventName: "Zuzalu",
  },
  //ZuConnect 2023 Instabull
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "05e0c4e8517758da3a26c80310ff2fe65b9f85d89dfc9c80e6d0b6477f88173e",
      "29ae64b615383a0ebb1bc37b3a642d82d37545f0f5b1444330300e4c4eedba3f",
    ],
    eventId: "91312aa1-5f74-4264-bdeb-f4a3ddb8670c",
    eventName: "ZuConnect",
  },
  //Edge City Denver (Denver, 2024)
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "1ebfb986fbac5113f8e2c72286fe9362f8e7d211dbc68227a468d7b919e75003",
      "10ec38f11baacad5535525bbe8e343074a483c051aa1616266f3b1df3fb7d204",
    ],
    eventId: "7eb74440-1891-4cd5-a351-b24a5b03e669",
    eventName: "Edge City Denver",
  },
  // Vitalia (Próspera, 2023-24)
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "0d3388a18b89dd012cb965267ab959a6ca68f7e79abfdd5de5e3e80f86821a0d",
      "0babbc67ab5da6c9245137ae75461f64a90789ae5abf3737510d5442bbfa3113",
    ],
    eventId: "9ccc53cb-3b0a-415b-ab0d-76cfa21c72ac",
    eventName: "Vitalia",
    productId: "cd3f2b06-e520-4eff-b9ed-c52365c60848",
    productName: "Resident",
  },
  //ETHBerlin (Berlin, 2024)
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "1ebfb986fbac5113f8e2c72286fe9362f8e7d211dbc68227a468d7b919e75003",
      "10ec38f11baacad5535525bbe8e343074a483c051aa1616266f3b1df3fb7d204",
    ],
    eventId: "53edb3e7-6733-41e0-a9be-488877c5c572",
    eventName: "ETHBerlin04",
  },
  //ETHPrague (Prague, 2024)
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "1ebfb986fbac5113f8e2c72286fe9362f8e7d211dbc68227a468d7b919e75003",
      "10ec38f11baacad5535525bbe8e343074a483c051aa1616266f3b1df3fb7d204",
    ],
    eventId: "508313ea-f16b-4729-bdf0-281c64493ca9",
    eventName: "ETHPrague 2024",
  },

  // Edge Esmeralda (Healdsburg, 2024)
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "1ebfb986fbac5113f8e2c72286fe9362f8e7d211dbc68227a468d7b919e75003",
      "10ec38f11baacad5535525bbe8e343074a483c051aa1616266f3b1df3fb7d204",
    ],
    eventId: "21c7db2e-08e3-4234-9a6e-386a592d63c8",
    eventName: "Edge Esmeralda",
  },
] as {
  pcdType: string;
  publicKey: string[];
  eventId: string;
  eventName: string;
  productId?: undefined;
  productName?: undefined;
}[];
