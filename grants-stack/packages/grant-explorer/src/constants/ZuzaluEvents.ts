import { PipelineEdDSATicketZuAuthConfig } from "@pcd/passport-interface";

export const ZuzaluEvents = [
  //Zuzalu (Montenegro, 2023)
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "05e0c4e8517758da3a26c80310ff2fe65b9f85d89dfc9c80e6d0b6477f88173e",
      "29ae64b615383a0ebb1bc37b3a642d82d37545f0f5b1444330300e4c4eedba3f",
    ],
    eventId: "5de90d09-22db-40ca-b3ae-d934573def8b",
    eventName: "Zuzalu (Montenegro, 2023)",
  },
  //ZuConnect 2023 Instabull
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "05e0c4e8517758da3a26c80310ff2fe65b9f85d89dfc9c80e6d0b6477f88173e",
      "29ae64b615383a0ebb1bc37b3a642d82d37545f0f5b1444330300e4c4eedba3f",
    ],
    eventId: "91312aa1-5f74-4264-bdeb-f4a3ddb8670c",
    eventName: "ZuConnect-Resident (Instabull, 2023)",
  },
  //Edge City Denver (Denver, 2024)
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "1ebfb986fbac5113f8e2c72286fe9362f8e7d211dbc68227a468d7b919e75003",
      "10ec38f11baacad5535525bbe8e343074a483c051aa1616266f3b1df3fb7d204",
    ],
    eventId: "7eb74440-1891-4cd5-a351-b24a5b03e669",
    eventName: "Edge City Denver (2024)",
  },
  // Vitalia (Próspera, 2023-24)
  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "0d3388a18b89dd012cb965267ab959a6ca68f7e79abfdd5de5e3e80f86821a0d",
      "0babbc67ab5da6c9245137ae75461f64a90789ae5abf3737510d5442bbfa3113",
    ],
    eventId: "9ccc53cb-3b0a-415b-ab0d-76cfa21c72ac",
    eventName: "Vitalia (Próspera, 2023-24)",
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
    eventName: "Edge Esmeralda (Healdsburg, 2024)",
  },

  {
    pcdType: "eddsa-ticket-pcd",
    publicKey: [
      "1ebfb986fbac5113f8e2c72286fe9362f8e7d211dbc68227a468d7b919e75003",
      "10ec38f11baacad5535525bbe8e343074a483c051aa1616266f3b1df3fb7d204",
    ],
    eventId: "223b4108-348d-5f65-afa3-464b103e7d90",
    eventName: "GitcoinTest",
  },
] as PipelineEdDSATicketZuAuthConfig[];

export const examplePCDJSON = {
  id: "71e92239-b2d0-4a17-a099-c3125fb60628",
  claim: {
    partialTicket: {
      eventId: "223b4108-348d-5f65-afa3-464b103e7d90",
      productId: "574ff149-1d3f-5fd9-ba1c-f4618a590d10",
      attendeeEmail: "test@gitcoin.co",
    },
    watermark: "1109288910208281880648932699740601003808274678358",
    signer: [
      "1ebfb986fbac5113f8e2c72286fe9362f8e7d211dbc68227a468d7b919e75003",
      "10ec38f11baacad5535525bbe8e343074a483c051aa1616266f3b1df3fb7d204",
    ],
    validEventIds: [
      "5de90d09-22db-40ca-b3ae-d934573def8b",
      "9ccc53cb-3b0a-415b-ab0d-76cfa21c72ac",
      "508313ea-f16b-4729-bdf0-281c64493ca9",
      "223b4108-348d-5f65-afa3-464b103e7d90",
    ],
    nullifierHash:
      "10434580389611786529093645836054526042161477972923691190663268143436356624198",
    externalNullifier: "1109288910208281880648932699740601003808274678358",
  },
  proof: {
    pi_a: [
      "15481095596915410650404309698193209004738438376613988480850878713350980946116",
      "9419885176541156646870228538144863542429535125257771375242197043316536491236",
      "1",
    ],
    pi_b: [
      [
        "4487493688231483473031337756049737256950935360609503860154291688222427946415",
        "16785060234572617435054317629151606862905708412057169547552719949172171408584",
      ],
      [
        "14765941283340818482896928388349559570489940386279046581435408953404841604678",
        "14346933705750203187205997998508714975926198347466488153596783591517253360765",
      ],
      ["1", "0"],
    ],
    pi_c: [
      "12678658618126268191326771676252619703325598240431077524527668160638796954251",
      "18133859191240419758185975811786236865449533114579482266123953478847091410432",
      "1",
    ],
    protocol: "groth16",
    curve: "bn128",
  },
  type: "zk-eddsa-event-ticket-pcd",
};
