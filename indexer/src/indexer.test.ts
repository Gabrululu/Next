import { describe, it } from "vitest";
import { createTestIndexer } from "envio";

// Simulated events only (no HyperSync): checks the handler logic end to end for one campaign.
const CHAIN = 10143;
const ORG = "0x00000000000000000000000000000000000000aA";
const A = "0x00000000000000000000000000000000000000A1";
const B = "0x00000000000000000000000000000000000000b2";
const C = "0x00000000000000000000000000000000000000C3";
const SEED = "0x1111111111111111111111111111111111111111111111111111111111111111";

describe("Next indexer", () => {
  it("indexes a campaign lifecycle: create -> register x3 -> draw -> claim", async (t) => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            {
              contract: "Next",
              event: "CampaignCreated",
              params: { campaignId: 1n, organizer: ORG, name: "Demo", slots: 2n, openAt: 100n, closeAt: 200n, drawBlock: 500n },
            },
            { contract: "Next", event: "Registered", params: { campaignId: 1n, account: A, index: 0n } },
            { contract: "Next", event: "Registered", params: { campaignId: 1n, account: B, index: 1n } },
            { contract: "Next", event: "Registered", params: { campaignId: 1n, account: C, index: 2n } },
            { contract: "Next", event: "Winner", params: { campaignId: 1n, account: C, rank: 1n } },
            { contract: "Next", event: "Winner", params: { campaignId: 1n, account: A, rank: 2n } },
            { contract: "Next", event: "Drawn", params: { campaignId: 1n, seed: SEED, winnerCount: 2n } },
            { contract: "Next", event: "Claimed", params: { campaignId: 1n, account: C, tokenId: 1n } },
            { contract: "NextPass", event: "PassMinted", params: { campaignId: 1n, account: C, tokenId: 1n } },
          ],
        },
      },
    });

    const campaign = await indexer.Campaign.getOrThrow("1");
    t.expect(campaign.organizer).toBe(ORG.toLowerCase());
    t.expect(campaign.registrantCount).toBe(3);
    t.expect(campaign.drawn).toBe(true);
    t.expect(campaign.seed).toBe(SEED);
    t.expect(campaign.winnerCount).toBe(2);
    t.expect(campaign.claimedCount).toBe(1);

    const regB = await indexer.Registration.getOrThrow(`1_${B.toLowerCase()}`);
    t.expect(regB.index).toBe(1);

    const winnerC = await indexer.Winner.getOrThrow(`1_${C.toLowerCase()}`);
    t.expect(winnerC.rank).toBe(1);
    t.expect(winnerC.claimed).toBe(true);
    const winnerA = await indexer.Winner.getOrThrow(`1_${A.toLowerCase()}`);
    t.expect(winnerA.claimed).toBe(false);

    const pass = await indexer.Pass.getOrThrow("1");
    t.expect(pass.account).toBe(C.toLowerCase());
    t.expect(pass.campaign_id).toBe("1");

    const stats = await indexer.CampaignStats.getOrThrow("1");
    t.expect(stats.registrations).toBe(3);
    const buckets = await indexer.CampaignBlockStat.getAll();
    t.expect(buckets.reduce((s, b) => s + b.registrations, 0)).toBe(3);
    t.expect(stats.blocksWithRegistrations).toBe(buckets.length);
    t.expect(stats.maxPerBlock).toBe(Math.max(...buckets.map((b) => b.registrations)));

    const global = await indexer.GlobalStats.getOrThrow("global");
    t.expect(global).toMatchObject({ campaigns: 1, registrations: 3, draws: 1, winners: 2, passes: 1 });
  });
});
