import { indexer, type GlobalStats } from "envio";

// Every handler reads the block timestamp and tx hash, so they list them (https://docs.envio.dev: `fields`).
const fields = { block: ["timestamp"], transaction: ["hash"] } as const;

const GLOBAL_ID = "global";
const EMPTY_GLOBAL: GlobalStats = { id: GLOBAL_ID, campaigns: 0, registrations: 0, draws: 0, winners: 0, passes: 0 };

/** Accounts are stored lowercase so the frontend can filter with a plain equality. */
const lc = (a: string) => a.toLowerCase();
const pair = (campaignId: bigint, account: string) => `${campaignId}_${lc(account)}`;

type GlobalCounter = Exclude<keyof GlobalStats, "id">;
async function bumpGlobal(context: { GlobalStats: { get(id: string): Promise<GlobalStats | undefined>; set(e: GlobalStats): void } }, key: GlobalCounter, by = 1) {
  const g = (await context.GlobalStats.get(GLOBAL_ID)) ?? EMPTY_GLOBAL;
  context.GlobalStats.set({ ...g, [key]: g[key] + by });
}

indexer.onEvent({ contract: "Next", event: "CampaignCreated", fields }, async ({ event, context }) => {
  const id = event.params.campaignId.toString();
  context.Campaign.set({
    id,
    campaignId: event.params.campaignId,
    organizer: lc(event.params.organizer),
    name: event.params.name,
    slots: Number(event.params.slots),
    openAt: event.params.openAt,
    closeAt: event.params.closeAt,
    drawBlock: event.params.drawBlock,
    createdBlock: BigInt(event.block.number),
    createdAt: event.block.timestamp,
    createdTx: event.transaction.hash,
    registrantCount: 0,
    drawn: false,
    seed: undefined,
    winnerCount: 0,
    claimedCount: 0,
    recommitCount: 0,
  });
  context.CampaignStats.set({
    id,
    campaign_id: id,
    registrations: 0,
    blocksWithRegistrations: 0,
    maxPerBlock: 0,
    firstBlock: undefined,
    lastBlock: undefined,
    firstTimestamp: undefined,
    lastTimestamp: undefined,
  });
  await bumpGlobal(context, "campaigns");
});

indexer.onEvent({ contract: "Next", event: "Registered", fields }, async ({ event, context }) => {
  const id = event.params.campaignId.toString();
  const block = BigInt(event.block.number);
  const ts = event.block.timestamp;

  context.Registration.set({
    id: pair(event.params.campaignId, event.params.account),
    campaign_id: id,
    account: lc(event.params.account),
    index: Number(event.params.index),
    blockNumber: block,
    timestamp: ts,
    txHash: event.transaction.hash,
  });

  const campaign = await context.Campaign.get(id);
  if (campaign) context.Campaign.set({ ...campaign, registrantCount: campaign.registrantCount + 1 });

  // Per-block bucket: how many registrations this campaign got in this block.
  const bucketId = `${id}_${block}`;
  const bucket = await context.CampaignBlockStat.get(bucketId);
  const inBlock = (bucket?.registrations ?? 0) + 1;
  context.CampaignBlockStat.set({ id: bucketId, campaign_id: id, blockNumber: block, timestamp: ts, registrations: inBlock });

  const stats = await context.CampaignStats.get(id);
  if (stats) {
    context.CampaignStats.set({
      ...stats,
      registrations: stats.registrations + 1,
      blocksWithRegistrations: stats.blocksWithRegistrations + (bucket ? 0 : 1),
      maxPerBlock: Math.max(stats.maxPerBlock, inBlock),
      firstBlock: stats.firstBlock ?? block,
      lastBlock: block,
      firstTimestamp: stats.firstTimestamp ?? ts,
      lastTimestamp: ts,
    });
  }
  await bumpGlobal(context, "registrations");
});

indexer.onEvent({ contract: "Next", event: "Winner" }, async ({ event, context }) => {
  const id = event.params.campaignId.toString();
  context.Winner.set({
    id: pair(event.params.campaignId, event.params.account),
    campaign_id: id,
    account: lc(event.params.account),
    rank: Number(event.params.rank),
    claimed: false,
    blockNumber: BigInt(event.block.number),
  });
  await bumpGlobal(context, "winners");
});

indexer.onEvent({ contract: "Next", event: "Drawn", fields }, async ({ event, context }) => {
  const id = event.params.campaignId.toString();
  const winnerCount = Number(event.params.winnerCount);
  context.Draw.set({
    id,
    campaign_id: id,
    seed: event.params.seed,
    winnerCount,
    blockNumber: BigInt(event.block.number),
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
  const campaign = await context.Campaign.get(id);
  if (campaign) context.Campaign.set({ ...campaign, drawn: true, seed: event.params.seed, winnerCount });
  await bumpGlobal(context, "draws");
});

indexer.onEvent({ contract: "Next", event: "Recommitted" }, async ({ event, context }) => {
  const id = event.params.campaignId.toString();
  const campaign = await context.Campaign.get(id);
  if (campaign) {
    context.Campaign.set({ ...campaign, drawBlock: event.params.newDrawBlock, recommitCount: campaign.recommitCount + 1 });
  }
});

indexer.onEvent({ contract: "Next", event: "Claimed" }, async ({ event, context }) => {
  const id = event.params.campaignId.toString();
  const winner = await context.Winner.get(pair(event.params.campaignId, event.params.account));
  if (winner) context.Winner.set({ ...winner, claimed: true });
  const campaign = await context.Campaign.get(id);
  if (campaign) context.Campaign.set({ ...campaign, claimedCount: campaign.claimedCount + 1 });
});
