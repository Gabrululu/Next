import { indexer } from "envio";

// The soulbound pass itself (NextPass is deployed by Next's constructor). Claimed (Next) and PassMinted
// (NextPass) are emitted in the same tx; the Pass entity comes from the token contract.
indexer.onEvent(
  { contract: "NextPass", event: "PassMinted", fields: { block: ["timestamp"], transaction: ["hash"] } },
  async ({ event, context }) => {
    context.Pass.set({
      id: event.params.tokenId.toString(),
      tokenId: event.params.tokenId,
      campaign_id: event.params.campaignId.toString(),
      account: event.params.account.toLowerCase(),
      blockNumber: BigInt(event.block.number),
      timestamp: event.block.timestamp,
      txHash: event.transaction.hash,
    });
    const g = await context.GlobalStats.get("global");
    if (g) context.GlobalStats.set({ ...g, passes: g.passes + 1 });
  },
);
