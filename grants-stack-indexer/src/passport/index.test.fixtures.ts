import { Logger } from "pino";
import { tmpNameSync } from "tmp";
import { test as baseTest } from "vitest";

export const test = baseTest.extend<{
  passportData: string;
  dbPath: string;
  logger: Logger;
}>({
  passportData: async ({ task: _task }, use) => {
    await use(SAMPLE_PASSPORT_DATA);
  },
  dbPath: async ({ task: _task }, use) => {
    await use(tmpNameSync());
  },
  logger: async ({ task: _task }, use) => {
    await use({
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    } as unknown as Logger);
  },
});

const SAMPLE_PASSPORT_DATA = `{"passport": {"address": "0x85ff01cff157199527528788ec4ea6336615c989","community": 2,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:00:18.579Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "17.178","threshold": "20.00000"},"id": 1}
{"passport": {"address": "0xcdce07979b519bcabb91ab284dd5ee51c78347db","community": 6,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:00:20.366Z","status": "DONE","error": null,"evidence": null,"id": 2}
{"passport": {"address": "0xa6a3d325d9f37627d8fc2e6ffe228efe44adf144","community": 6,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:00:19.318Z","status": "DONE","error": null,"evidence": null,"id": 3}
{"passport": {"address": "0x4a7b6f4ba99011c94c3b64cccd9b6d8e3eea4bd8","community": 2,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:00:18.395Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 4}
{"passport": {"address": "0x0000008735754eda8db6b50aeb93463045fc5c55","community": 12,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:38.444Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "13.070","threshold": "20.00000"},"id": 5}
{"passport": {"address": "0x997d35b300ba1775fdb175df045252e57d6ea5b0","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.428Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "9.79","threshold": "20.00000"},"id": 6}
{"passport": {"address": "0x4614291bb169905074da4afaa39784d175162f79","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.553Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "3.828","threshold": "20.00000"},"id": 7}
{"passport": {"address": "0xb41077b88ff9e42355fc2ffeaa1810560ac5f192","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.763Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "11.65","threshold": "20.00000"},"id": 8}
{"passport": {"address": "0x1bcd46b724fd4c08995cec46ffd51bd45fede200","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.110Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 9}
{"passport": {"address": "0x098c4d4124f4ece308a02ea15f044afde6ba7fff","community": 2,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:00:20.367Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 10}
{"passport": {"address": "0x4a13f4394cf05a52128bda527664429d5376c67f","community": 2,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:00:18.416Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 11}
{"passport": {"address": "0xbfde67f2eb1dd115333c99b1e44ea0a4dd634c1c","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.120Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 12}
{"passport": {"address": "0x4873178bea2dcd7022f0ef6c70048b0e05bf9017","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:36.754Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 13}
{"passport": {"address": "0x0d4172e28e8cb4aa8100c380bf93de5d4ae89644","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.211Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 14}
{"passport": {"address": "0x5f390415db0f7d4d336095f3fd266d6b3b616e7a","community": 12,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.116Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 15}
{"passport": {"address": "0x3d09a4cf64591a96be4d9205ec3e303d1595a439","community": 12,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.269Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "7.77","threshold": "20.00000"},"id": 16}
{"passport": {"address": "0x0000008735754eda8db6b50aeb93463045fc5c55","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:38.519Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "13.070","threshold": "20.00000"},"id": 17}
{"passport": {"address": "0x802999c71263f7b30927f720cf0ac10a76a0494c","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.118Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 18}
{"passport": {"address": "0x0b58857708a6f84e7ee04beaef069a7e6d1d4a0b","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:38.908Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "15.247","threshold": "20.00000"},"id": 19}
{"passport": {"address": "0x0d4fbb2c0003afc1bf5dd6d80aed1b9962b1f0d2","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:38.330Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "10.039","threshold": "20.00000"},"id": 20}
{"passport": {"address": "0x277d46fcbe71144c6489d182a8aa00da61b57b07","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:36.993Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 21}
{"passport": {"address": "0x5c038cb4a3bc5189670de3d01ea4bfdb58c917a5","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:38.901Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "17.279","threshold": "20.00000"},"id": 22}
{"passport": {"address": "0x3974b852180bd7a1e8f09287494d6f79b94aad5a","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.475Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 23}
{"passport": {"address": "0xd303f96913bbf161803d7e8854d054be0f4f4bc3","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:38.556Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "12.978","threshold": "20.00000"},"id": 24}
{"passport": {"address": "0x841c11b14c428dd591093348b8afa2652c863988","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.425Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 25}
{"passport": {"address": "0xd2c7c945b89ba0173264961460a596dd601cc631","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:39.126Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "19.307","threshold": "20.00000"},"id": 26}
{"passport": {"address": "0x7ae1849b71afa393dde2988c42697fde5c8c5511","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.474Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 27}
{"passport": {"address": "0x455f491985c2f18b2c77d181f009ee6bdc41b1f8","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.475Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 28}
{"passport": {"address": "0xbdf05e45143d65139978c46ad5c3e2a7c3dd1aea","community": 13,"requires_calculation": false},"score": "1.000000000","last_score_timestamp": "2023-07-25T20:03:39.170Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": true,"rawScore": "22.917","threshold": "20.00000"},"id": 29}
{"passport": {"address": "0xfd9f8a0f4bdeac72f08af1c708023cc31dd2e3be","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.631Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 30}
{"passport": {"address": "0xc3afeb93ae73f160347bcae82097c1f8f3dac75c","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.139Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 31}
{"passport": {"address": "0x7c5cd584fc92992caeed3771a26c518e0e7f4edc","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:38.528Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "10.287","threshold": "20.00000"},"id": 32}
{"passport": {"address": "0x40f98a017a39c620d038d33801a8d0f73620d204","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.221Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 33}
{"passport": {"address": "0x2e85d0a021eda2fda2cfe3ef38734dde93613c03","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.765Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "5.74","threshold": "20.00000"},"id": 34}
{"passport": {"address": "0xde0ccfbcc11052328c7c928939ebc49e9a15f417","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:38.532Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "13.298","threshold": "20.00000"},"id": 35}
{"passport": {"address": "0x7587cfbd20e5a970209526b4d1f69dbaae8bed37","community": 13,"requires_calculation": false},"score": "1.000000000","last_score_timestamp": "2023-07-25T20:03:39.244Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": true,"rawScore": "30.645","threshold": "20.00000"},"id": 36}
{"passport": {"address": "0x7bec70fa7ef926878858333b0fa581418e2ef0b5","community": 13,"requires_calculation": false},"score": "1.000000000","last_score_timestamp": "2023-07-25T20:03:38.747Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": true,"rawScore": "22.748","threshold": "20.00000"},"id": 37}
{"passport": {"address": "0x2caafafbc21f65697824f83aeae6a9b1cb2a5b9d","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:38.433Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "16.139","threshold": "20.00000"},"id": 38}
{"passport": {"address": "0xee6c21046ebf0250db07d3b136251de3d86decf5","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:38.285Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "6.77","threshold": "20.00000"},"id": 39}
{"passport": {"address": "0x2b1a6dd2a80f7e9a2305205572df0f4b38b205a1","community": 13,"requires_calculation": false},"score": "0E-9","last_score_timestamp": "2023-07-25T20:03:37.127Z","status": "DONE","error": null,"evidence": {"type": "ThresholdScoreCheck","success": false,"rawScore": "0","threshold": "20.00000"},"id": 40}`;