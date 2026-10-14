# Next — Pitch

**Everyone in line. Nobody cuts in.**
Live: https://next-monad.vercel.app · Track: Social, Attention & Culture (Monad Metropolis)

All numbers in this document come from the chain or from our recorded testnet run. Nothing is projected or invented.

---

## 1. Elevator pitches

**10 seconds.** Next is a fair way to hand out things that run out. Join any time while it's open, a fair draw picks the winners, and anyone can check it.

**30 seconds.** When something is scarce (workshop seats, concert tickets, a scholarship), it goes to whoever clicks fastest or runs the best bot. Next removes the race. An organizer opens a window, people join once, and when it closes a smart contract on Monad draws the winners from a random number nobody could know in advance. Winners get a pass that can't be transferred and show a signed QR at the door. Anyone can recompute the draw.

**2 minutes.** See the demo script in [DEMO.md](DEMO.md).

---

## 2. The problem

- **Speed beats need.** First-come-first-served rewards fast connections, refresh scripts and bots.
- **Opaque raffles.** Off-chain "random" picks can't be checked; people have to trust the organizer.
- **Resale and transfer.** Spots meant for one person end up resold.
- **Friction.** Fair on-chain systems usually ask newcomers to install a wallet, buy gas and understand networks.

## 3. The solution

| Step | What happens | Why it's fair |
|---|---|---|
| Open | The organizer sets spots and a window. The draw moment (a future block) is fixed at creation. | Nobody, including the organizer, can pick a convenient moment. |
| Join | One entry per account while the window is open. Sign in with email (no wallet, no fees) or with your own wallet. | Joining first gives no advantage, so there's nothing to race for. |
| Draw | Anyone presses the button after the announced block. | The result depends only on that block's hash, the campaign and the number of people in line, so it's the same whoever presses it. |
| Claim | Winners claim a pass. | It's non-transferable, so it can't be resold. |
| Check in | Winners show a QR signed by their account, and the organizer scans it. | The scanner checks the signature, freshness and the pass on-chain. |
| Verify | Anyone opens `/verify/<id>` or runs the CLI. | The same algorithm runs in Solidity and TypeScript, tied together by a shared test vector. |

## 4. Why Monad

- **Bursts are the whole point.** A drop is thousands of people pressing a button in the same second. Monad's ~300 ms blocks and throughput absorb that.
- **Proof from our run:** 200 simulated entrants fired `register()` at the same moment. **200/200 confirmed** across 12 blocks, **4.98 s** from the first send to the last confirmation seen, 0 failures. The draw for 50 winners used 4.2M gas and verified. Full data is in `scripts/results/results.json`.
- **Cheap enough to be fair.** Joining costs one small transaction, and with email accounts the app pays it.
- We designed around Monad specifics we measured: the gas *limit* is charged, BLOCKHASH covers 256 blocks plus EIP-2935 history (~8,191 blocks), and reserve-balance rules apply. See [ARCHITECTURE.md](ARCHITECTURE.md) §10.

## 5. Sponsor integrations (depth, not logos)

- **Dynamic**
  - Email sign-in creates an embedded wallet.
  - The app pays network fees with `sendSponsoredTransaction`.
  - People with a wallet can use it instead.
  - The server verifies Dynamic JWTs to protect the email opt-in.
- **Envio**
  - A HyperIndex indexer of every campaign, entry, draw, winner and pass, with per-block stats.
  - It feeds the live panel, "Latest in line" and the verifier's registrant list, always with an RPC fallback.
- **Alchemy**
  - Monad RPC with a public fallback.
  - A Custom Webhook on the `Drawn` event triggers result emails (Upstash + Resend). The webhook is signature-verified, and the results are re-read from the contract.

## 6. Who it's for

Use cases. These are examples, not customers:
- Community workshops and bootcamps with limited seats
- Scholarships and grants with more applicants than places
- Small venues, meetups, hackathon spots, mentor office hours
- Limited merch or art drops

**Possible model (future, not built):** free for small communities, with a paid tier for organizers that adds a custom domain, allow-lists or credential checks, and bulk check-in.

## 7. Roadmap

1. **Stronger fairness:** a VRF or commit-reveal seed to remove the block producer's theoretical influence.
2. **Stronger "one per person":** optional personhood or credential checks (organizer's choice), plus deposits against multi-accounts.
3. **Shared replay protection** for multi-gate check-in (server-side nonce set).
4. **Organizer tools:** CSV export, reminders, waitlists that roll over to the next draw.
5. **Mainnet**, after an audit.

## 8. Demo

The full on-stage script, setup checklist and plan B are in [DEMO.md](DEMO.md).

## 9. Honest limits (say them before someone asks)

- One entry per **account**, not per person.
- A pass QR can be replayed for ~5 minutes at a *different* scanner device.
- The seed block's producer could, in theory, withhold it. A VRF would fix that (roadmap).
- Someone must run the draw within ~41 minutes of the seed block, or anyone can set a new one.
- Fee sponsorship covers email accounts. People who bring their own wallet pay a small fee.
- Testnet only, not audited.

## 10. Submission drafts

**Short description (≤ 140 chars).**
Fair draws for scarce things: join any time, a fair on-chain draw picks the winners, anyone can check it. Built on Monad.

**Description.**
Next replaces the race for scarce things (seats, spots, scholarships, drops) with a fair draw. An organizer opens a window, and anyone joins once, by email or with their own wallet, with fees covered for email accounts via Dynamic. When the window closes, a contract on Monad picks the winners using the hash of a block announced at creation, so nobody can know or choose the result in advance. Winners claim a non-transferable pass and show a signed QR at the door. Every draw can be recomputed in the browser or from a CLI, using the same algorithm as the contract. An Envio indexer powers live stats and an Alchemy webhook emails each participant their result. In a testnet stress run, 200 simulated sign-ups sent at the same second all confirmed in under 5 seconds, and the draw verified.

**What's next.** VRF-based seed, optional personhood/credential checks, shared multi-gate check-in, organizer tools, audit and mainnet.

**Team.** _[Add names, roles and links.]_

## 11. FAQ

- **Is it really random?** The seed comes from a block hash that doesn't exist yet when people are joining. Registration even stops before that block. The hash is combined with the campaign id and the number of entrants.
- **Can the organizer cheat?** They can't join their own campaign from their own account, can't choose the draw moment, and can't change the result. They could join from a second account, which is the per-account limit.
- **What if nobody presses "draw"?** Anyone can, at any time within ~41 minutes. After that, anyone can set a new future seed block.
- **Do people need crypto?** No. Email sign-in creates an account, and the app pays the network fee.
- **Can I check a result without trusting the site?** Yes: `pnpm verify <id>` recomputes it from public chain data.
