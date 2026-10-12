// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {NextPass} from "./NextPass.sol";

/// @title Next — fair-access draws for scarce resources
/// @notice "Everyone in line. Nobody cuts in."
///         Organizers open a time window. Anyone else registers once per address inside it.
///         After the window, the hash of a block announced at creation time seeds a partial
///         Fisher-Yates shuffle that picks the winners. Anyone can recompute it. Winners claim a
///         soulbound NextPass.
/// @dev PROTOTYPE. The one-entry-per-address rule reduces multi-account abuse but does not prevent
///      it; it is not a proof of unique personhood.
contract Next {
    // ------------------------------------------------------------------ constants

    /// @notice Upper bound on winners per campaign, derived from measured gas: on Monad testnet,
    ///         draw() measured 2,178,030 gas for 25 winners (~87k per winner, Monad prices fresh
    ///         storage pages at ~28k). v3 adds one Winner event per winner (~2k). At ~90k per winner,
    ///         200 winners ≈ 18M gas, which keeps the worst case within Monad's 30M per-transaction
    ///         limit with ~40% headroom, so a draw can never become impossible to execute.
    uint256 public constant MAX_SLOTS = 200;

    /// @notice Gap (in blocks) between the estimated closing block and the seed block.
    uint256 public constant DRAW_DELAY_BLOCKS = 10;

    /// @notice Longest registration window an organizer can open.
    uint256 public constant MAX_WINDOW = 30 days;

    uint256 public constant MAX_NAME_LENGTH = 64;

    /// @notice EIP-2935 history contract (serves the last 8191 block hashes). Verified deployed
    ///         on Monad testnet; used when the 256-block BLOCKHASH window has passed.
    address public constant HISTORY_STORAGE = 0x0000F90827F1C53a10cb7A02335B175320002935;
    uint256 public constant HISTORY_WINDOW = 8191;

    /// @notice Block time assumed when converting closeAt into a block number (milliseconds).
    uint256 public immutable blockTimeMs;

    /// @notice Soulbound pass minted to winners on claim(). Deployed by this contract.
    NextPass public immutable pass;

    // ------------------------------------------------------------------ storage

    struct Campaign {
        uint256 id;
        address organizer;
        string name;
        uint32 slots;
        uint64 openAt;
        uint64 closeAt;
        uint64 drawBlock;
        bytes32 seed;
        bool drawn;
        uint32 claimedCount;
    }

    uint256 public campaignCount;

    mapping(uint256 => Campaign) internal _campaigns;
    mapping(uint256 => address[]) internal _registrants;
    mapping(uint256 => mapping(address => bool)) public isRegistered;
    mapping(uint256 => address[]) internal _winners;
    mapping(uint256 => mapping(address => bool)) internal _picked;
    /// @dev Virtual shuffle: campaignId => index => (value + 1). 0 means "untouched, holds itself".
    mapping(uint256 => mapping(uint256 => uint256)) internal _swap;

    // ------------------------------------------------------------------ events

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed organizer,
        string name,
        uint32 slots,
        uint64 openAt,
        uint64 closeAt,
        uint64 drawBlock
    );
    /// @param index 0-based position in the registrant list (arrival order; it has no effect on the draw).
    event Registered(uint256 indexed campaignId, address indexed account, uint256 index);
    event Drawn(uint256 indexed campaignId, bytes32 seed, uint256 winnerCount);
    /// @param rank 1-based pick order.
    event Winner(uint256 indexed campaignId, address indexed account, uint256 rank);
    event Recommitted(uint256 indexed campaignId, uint64 oldDrawBlock, uint64 newDrawBlock);
    event Claimed(uint256 indexed campaignId, address indexed account, uint256 tokenId);

    // ------------------------------------------------------------------ errors

    error InvalidSlots();
    error InvalidName();
    error InvalidWindow();
    error UnknownCampaign();
    error NotOpenYet();
    error RegistrationClosed();
    error AlreadyRegistered();
    error OrganizerCannotRegister();
    error DrawTooEarly();
    error AlreadyDrawn();
    /// @notice The committed seed block's hash can no longer be read (older than BLOCKHASH's 256
    ///         blocks and EIP-2935's 8191). Call recommit() to announce a new future seed block.
    error SeedUnavailable();
    error SeedStillAvailable();
    error NotDrawn();
    error NotWinner();
    error AlreadyClaimed();

    constructor(uint256 _blockTimeMs) {
        require(_blockTimeMs > 0, "blockTimeMs");
        blockTimeMs = _blockTimeMs;
        pass = new NextPass(address(this));
    }

    // ------------------------------------------------------------------ organizer

    /// @notice Open a campaign. The seed block (drawBlock) is fixed and announced here.
    /// @param openAt Unix seconds; a value in the past means "open now".
    function createCampaign(string calldata name, uint32 slots, uint64 openAt, uint64 closeAt)
        external
        returns (uint256 id)
    {
        uint256 nameLen = bytes(name).length;
        if (nameLen == 0 || nameLen > MAX_NAME_LENGTH) revert InvalidName();
        if (slots == 0 || slots > MAX_SLOTS) revert InvalidSlots();
        uint256 start = openAt > block.timestamp ? openAt : block.timestamp;
        if (closeAt <= start || closeAt - start > MAX_WINDOW) revert InvalidWindow();

        // closeAt (seconds) -> estimated block number, rounded up, then a fixed delay.
        uint256 blocksUntilClose = ((uint256(closeAt) - block.timestamp) * 1000 + blockTimeMs - 1) / blockTimeMs;
        uint64 drawBlock = uint64(block.number + blocksUntilClose + DRAW_DELAY_BLOCKS);

        id = ++campaignCount;
        Campaign storage c = _campaigns[id];
        c.id = id;
        c.organizer = msg.sender;
        c.name = name;
        c.slots = slots;
        c.openAt = openAt;
        c.closeAt = closeAt;
        c.drawBlock = drawBlock;

        emit CampaignCreated(id, msg.sender, name, slots, openAt, closeAt, drawBlock);
    }

    // ------------------------------------------------------------------ participants

    /// @notice One entry per address, only inside the window. Arrival order does not matter.
    ///         The organizer's own address cannot enter (organizer and participants are separate
    ///         roles; like the per-address rule, this does not stop someone using a second address).
    /// @dev Registration also stops before drawBlock, so the seed is never known while entries
    ///      are still accepted (guards against block-time drift from the closeAt estimate).
    function register(uint256 id) external {
        Campaign storage c = _get(id);
        if (block.timestamp < c.openAt) revert NotOpenYet();
        if (block.timestamp >= c.closeAt || block.number >= c.drawBlock) revert RegistrationClosed();
        if (msg.sender == c.organizer) revert OrganizerCannotRegister();
        if (isRegistered[id][msg.sender]) revert AlreadyRegistered();

        isRegistered[id][msg.sender] = true;
        address[] storage regs = _registrants[id];
        emit Registered(id, msg.sender, regs.length);
        regs.push(msg.sender);
    }

    // ------------------------------------------------------------------ draw

    /// @notice Anyone can trigger the draw once drawBlock is in the past. The result does not
    ///         depend on who calls or when: the seed is fixed by drawBlock's hash.
    /// @dev seed = keccak256(abi.encode(blockhash(drawBlock), campaignId, registrantCount)).
    function draw(uint256 id) external {
        Campaign storage c = _get(id);
        if (c.drawn) revert AlreadyDrawn();
        if (block.number <= c.drawBlock) revert DrawTooEarly();

        bytes32 bh = _blockHash(c.drawBlock);
        if (bh == bytes32(0)) revert SeedUnavailable();

        address[] storage regs = _registrants[id];
        uint256 n = regs.length;
        bytes32 seed = keccak256(abi.encode(bh, id, n));
        c.seed = seed;
        c.drawn = true;

        uint256 k = c.slots;
        uint256 winnerCount = n > k ? k : n;
        if (n > k) _shuffle(id, seed, regs, n, k);
        else _everyoneWins(id, regs, n);

        emit Drawn(id, seed, winnerCount);
    }

    /// @notice Fallback when the committed seed block has aged out of both BLOCKHASH (256 blocks)
    ///         and the EIP-2935 history window (8191 blocks): commits a NEW future seed block.
    ///         Only possible while the old hash is truly unreadable, so nobody can pick a seed after
    ///         seeing it. Registration stays closed.
    function recommit(uint256 id) external {
        Campaign storage c = _get(id);
        if (c.drawn) revert AlreadyDrawn();
        if (block.number <= c.drawBlock) revert DrawTooEarly();
        if (_blockHash(c.drawBlock) != bytes32(0)) revert SeedStillAvailable();

        uint64 old = c.drawBlock;
        c.drawBlock = uint64(block.number + DRAW_DELAY_BLOCKS);
        // Entries after the original seed block are never accepted.
        if (c.closeAt > block.timestamp) c.closeAt = uint64(block.timestamp);
        emit Recommitted(id, old, c.drawBlock);
    }

    // ------------------------------------------------------------------ claim

    /// @notice Winners claim once; this mints their soulbound NextPass.
    function claim(uint256 id) external returns (uint256 tokenId) {
        Campaign storage c = _get(id);
        if (!c.drawn) revert NotDrawn();
        if (!_picked[id][msg.sender]) revert NotWinner();
        if (pass.hasPass(id, msg.sender)) revert AlreadyClaimed();

        c.claimedCount += 1; // effects before the external call
        tokenId = pass.mint(msg.sender, id);
        emit Claimed(id, msg.sender, tokenId);
    }

    // ------------------------------------------------------------------ views

    function getCampaign(uint256 id) external view returns (Campaign memory) {
        return _get(id);
    }

    function registrantCount(uint256 id) external view returns (uint256) {
        return _registrants[id].length;
    }

    function getRegistrants(uint256 id) external view returns (address[] memory) {
        return _registrants[id];
    }

    /// @notice Paginated variant for large campaigns (RPC eth_call limits).
    function getRegistrantsSlice(uint256 id, uint256 start, uint256 count) external view returns (address[] memory out) {
        address[] storage regs = _registrants[id];
        if (start >= regs.length) return out;
        uint256 end = start + count > regs.length ? regs.length : start + count;
        out = new address[](end - start);
        for (uint256 i = start; i < end; ++i) out[i - start] = regs[i];
    }

    /// @notice Winners in pick order (rank 1 first). Empty before the draw.
    function getWinners(uint256 id) external view returns (address[] memory) {
        return _winners[id];
    }

    function isWinner(uint256 id, address who) external view returns (bool) {
        return _picked[id][who];
    }

    function hasClaimed(uint256 id, address who) external view returns (bool) {
        return pass.hasPass(id, who);
    }

    /// @notice Hash of drawBlock if still readable, else zero. Lets UIs show whether a draw is possible.
    function seedBlockHash(uint256 id) external view returns (bytes32) {
        Campaign storage c = _get(id);
        if (block.number <= c.drawBlock) return bytes32(0);
        return _blockHash(c.drawBlock);
    }

    // ------------------------------------------------------------------ internal

    /// @dev Partial Fisher-Yates over a virtual array [0..n): O(k) writes, no copy of registrants.
    ///      Mirrored exactly by scripts/lib/select.ts.
    function _shuffle(uint256 id, bytes32 seed, address[] storage regs, uint256 n, uint256 k) internal {
        mapping(uint256 => uint256) storage swap = _swap[id];
        mapping(address => bool) storage picked = _picked[id];
        address[] storage winners = _winners[id];
        for (uint256 i = 0; i < k; ++i) {
            uint256 j = i + (uint256(keccak256(abi.encode(seed, i))) % (n - i));
            uint256 vj = swap[j];
            vj = vj == 0 ? j : vj - 1;
            uint256 vi = swap[i];
            vi = vi == 0 ? i : vi - 1;
            swap[j] = vi + 1; // position i is never read again, so only j needs updating
            address w = regs[vj];
            picked[w] = true;
            winners.push(w);
            emit Winner(id, w, i + 1);
        }
    }

    /// @dev n <= slots: everyone wins, in registration order (bounded by MAX_SLOTS).
    function _everyoneWins(uint256 id, address[] storage regs, uint256 n) internal {
        mapping(address => bool) storage picked = _picked[id];
        address[] storage winners = _winners[id];
        for (uint256 i = 0; i < n; ++i) {
            address w = regs[i];
            picked[w] = true;
            winners.push(w);
            emit Winner(id, w, i + 1);
        }
    }

    function _get(uint256 id) internal view returns (Campaign storage c) {
        c = _campaigns[id];
        if (c.id == 0) revert UnknownCampaign();
    }

    /// @dev BLOCKHASH covers the last 256 blocks; beyond that, ask the EIP-2935 history contract
    ///      (last 8191 blocks). Returns zero if neither can serve the hash.
    function _blockHash(uint256 number) internal view returns (bytes32 h) {
        h = blockhash(number);
        if (h != bytes32(0)) return h;
        if (block.number - number > HISTORY_WINDOW) return bytes32(0);
        (bool ok, bytes memory ret) = HISTORY_STORAGE.staticcall(abi.encode(number));
        if (ok && ret.length == 32) h = abi.decode(ret, (bytes32));
    }
}
