// Message an account signs to prove it owns the address asking for a network-fee top-up.
// Shared by the client (useTx) and the server (/api/gas/topup) so both build the exact same text.
import { keccak256, type Address, type Hex } from "viem";
import { CHAIN_ID, NEXT_ADDRESS } from "./config";

export const topupMessage = (address: Address, data: Hex, time: number) =>
  ["Next network-fee top-up", `Address: ${address}`, `Contract: ${NEXT_ADDRESS}`, `Chain: ${CHAIN_ID}`, `Call: ${keccak256(data)}`, `Time: ${time}`].join("\n");
