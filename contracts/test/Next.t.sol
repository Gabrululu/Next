// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Next} from "../src/Next.sol";
import {NextPass} from "../src/NextPass.sol";
import {Vm} from "forge-std/Vm.sol";

/// @dev Stand-in for the EIP-2935 history contract: returns whatever hash was stored for a block.
contract MockHistory {
    mapping(uint256 => bytes32) public hashes;

    function set(uint256 n, bytes32 h) external {
        hashes[n] = h;
    }

    fallback(bytes calldata data) external returns (bytes memory) {
        uint256 n = abi.decode(data, (uint256));
        bytes32 h = hashes[n];
        require(h != bytes32(0));
        return abi.encode(h);
    }
}

contract NextTest is Test {
    Next next;
    uint64 constant WINDOW = 1 hours;

    function setUp() public {
        vm.warp(1_800_000_000);
        vm.roll(1_000_000);
        next = new Next(300);
    }

    // ---------------------------------------------------------------- helpers

    function _create(uint32 slots) internal returns (uint256 id) {
        id = next.createCampaign("Test seats", slots, uint64(block.timestamp), uint64(block.timestamp) + WINDOW);
    }

    function _entrant(uint256 i) internal pure returns (address) {
        return address(uint160(0x1000 + i));
    }

    function _registerMany(uint256 id, uint256 n) internal {
        for (uint256 i = 0; i < n; ++i) {
            vm.prank(_entrant(i));
            next.register(id);
        }
    }

    /// @dev Move past drawBlock with a known hash for it.
    function _reachDraw(uint256 id, bytes32 bh) internal {
        Next.Campaign memory c = next.getCampaign(id);
        vm.warp(c.closeAt + 1);
        vm.roll(c.drawBlock + 1);
        vm.setBlockhash(c.drawBlock, bh);
    }

    // ---------------------------------------------------------------- create

    function test_createAnnouncesDrawBlockAfterClose() public {
        uint256 id = _create(10);
        Next.Campaign memory c = next.getCampaign(id);
        // 3600 s at 300 ms/block = 12000 blocks, plus the fixed delay
        assertEq(c.drawBlock, block.number + 12_000 + next.DRAW_DELAY_BLOCKS());
        assertEq(c.organizer, address(this));
    }

    function test_createRejectsBadInput() public {
        uint64 t = uint64(block.timestamp);
        vm.expectRevert(Next.InvalidSlots.selector);
        next.createCampaign("x", 0, t, t + 100);
        vm.expectRevert(Next.InvalidSlots.selector);
        next.createCampaign("x", 201, t, t + 100);
        vm.expectRevert(Next.InvalidWindow.selector);
        next.createCampaign("x", 5, t, t);
        vm.expectRevert(Next.InvalidWindow.selector);
        next.createCampaign("x", 5, t, t + 31 days);
        vm.expectRevert(Next.InvalidName.selector);
        next.createCampaign("", 5, t, t + 100);
    }

    // ---------------------------------------------------------------- window enforcement

    function test_registerOnlyInsideWindow() public {
        uint64 t = uint64(block.timestamp);
        uint256 id = next.createCampaign("Later", 5, t + 100, t + 200);

        vm.prank(_entrant(0));
        vm.expectRevert(Next.NotOpenYet.selector);
        next.register(id);

        vm.warp(t + 100);
        vm.prank(_entrant(0));
        next.register(id);

        vm.warp(t + 200);
        vm.prank(_entrant(1));
        vm.expectRevert(Next.RegistrationClosed.selector);
        next.register(id);
    }

    function test_registerClosesAtDrawBlockEvenBeforeCloseAt() public {
        uint256 id = _create(5);
        Next.Campaign memory c = next.getCampaign(id);
        vm.roll(c.drawBlock); // blocks came faster than assumed; time is still inside the window
        vm.prank(_entrant(0));
        vm.expectRevert(Next.RegistrationClosed.selector);
        next.register(id);
    }

    // ---------------------------------------------------------------- one per address

    function test_doubleRegistrationReverts() public {
        uint256 id = _create(5);
        vm.startPrank(_entrant(0));
        next.register(id);
        vm.expectRevert(Next.AlreadyRegistered.selector);
        next.register(id);
        vm.stopPrank();
        assertEq(next.registrantCount(id), 1);
    }

    function test_organizerCannotRegisterInOwnCampaign() public {
        uint256 id = _create(5); // created by this test contract
        vm.expectRevert(Next.OrganizerCannotRegister.selector);
        next.register(id);

        // ...but the same address can join someone else's campaign
        vm.prank(_entrant(42));
        uint256 other = next.createCampaign("Other", 5, uint64(block.timestamp), uint64(block.timestamp) + WINDOW);
        next.register(other);
        assertTrue(next.isRegistered(other, address(this)));
    }

    // ---------------------------------------------------------------- draw

    function test_drawTooEarlyReverts() public {
        uint256 id = _create(5);
        _registerMany(id, 3);
        Next.Campaign memory c = next.getCampaign(id);
        vm.roll(c.drawBlock);
        vm.expectRevert(Next.DrawTooEarly.selector);
        next.draw(id);
    }

    function test_drawIsDeterministic() public {
        bytes32 bh = keccak256("determinism");
        address[] memory first;
        for (uint256 round = 0; round < 2; ++round) {
            // Fresh state each round: identical inputs must give identical winners.
            setUp();
            uint256 id = _create(10);
            _registerMany(id, 50);
            _reachDraw(id, bh);
            vm.prank(address(0xBEEF)); // caller identity must not matter
            next.draw(id);
            address[] memory w = next.getWinners(id);
            assertEq(w.length, 10);
            if (round == 0) first = w;
            else assertEq(keccak256(abi.encode(w)), keccak256(abi.encode(first)));
        }
    }

    function test_drawPicksDistinctRegisteredWinners() public {
        uint256 id = _create(40);
        _registerMany(id, 60);
        _reachDraw(id, keccak256("distinct"));
        next.draw(id);
        address[] memory w = next.getWinners(id);
        assertEq(w.length, 40);
        for (uint256 i = 0; i < w.length; ++i) {
            assertTrue(next.isRegistered(id, w[i]));
            assertTrue(next.isWinner(id, w[i]));
            for (uint256 j = i + 1; j < w.length; ++j) assertTrue(w[i] != w[j]);
        }
    }

    function test_fewerRegistrantsThanSlotsEveryoneWins() public {
        uint256 id = _create(10);
        _registerMany(id, 4);
        _reachDraw(id, keccak256("few"));
        next.draw(id);
        address[] memory w = next.getWinners(id);
        assertEq(w.length, 4);
        for (uint256 i = 0; i < 4; ++i) assertTrue(next.isWinner(id, _entrant(i)));
        assertFalse(next.isWinner(id, _entrant(99)));
    }

    function test_drawTwiceReverts() public {
        uint256 id = _create(2);
        _registerMany(id, 3);
        _reachDraw(id, keccak256("twice"));
        next.draw(id);
        vm.expectRevert(Next.AlreadyDrawn.selector);
        next.draw(id);
    }

    function test_drawMaxSlotsGas() public {
        uint256 id = _create(200);
        _registerMany(id, 400);
        _reachDraw(id, keccak256("gas"));
        uint256 g = gasleft();
        next.draw(id);
        uint256 used = g - gasleft();
        emit log_named_uint("draw() gas at 200 slots / 400 registrants", used);
        assertLt(used, 30_000_000); // Monad per-tx gas limit
    }

    // ---------------------------------------------------------------- seed availability

    function test_seedFromHistoryContractAfter256Blocks() public {
        MockHistory hist = new MockHistory();
        vm.etch(next.HISTORY_STORAGE(), address(hist).code);
        uint256 id = _create(2);
        _registerMany(id, 5);
        Next.Campaign memory c = next.getCampaign(id);
        bytes32 bh = keccak256("old");
        MockHistory(next.HISTORY_STORAGE()).set(c.drawBlock, bh);
        vm.roll(c.drawBlock + 300); // outside BLOCKHASH's 256-block window
        next.draw(id);
        assertEq(next.getCampaign(id).seed, keccak256(abi.encode(bh, id, uint256(5))));
    }

    function test_expiredSeedRevertsThenRecommits() public {
        uint256 id = _create(2);
        _registerMany(id, 5);
        Next.Campaign memory c = next.getCampaign(id);
        vm.roll(c.drawBlock + 9000); // past both BLOCKHASH and EIP-2935 windows
        vm.expectRevert(Next.SeedUnavailable.selector);
        next.draw(id);

        next.recommit(id);
        Next.Campaign memory c2 = next.getCampaign(id);
        assertEq(c2.drawBlock, block.number + next.DRAW_DELAY_BLOCKS());

        // Registration stays closed after rescheduling.
        vm.prank(_entrant(77));
        vm.expectRevert(Next.RegistrationClosed.selector);
        next.register(id);

        vm.roll(c2.drawBlock + 1);
        vm.setBlockhash(c2.drawBlock, keccak256("fresh"));
        next.draw(id);
        assertTrue(next.getCampaign(id).drawn);
    }

    function test_cannotRecommitWhileSeedReadable() public {
        uint256 id = _create(2);
        _registerMany(id, 5);
        _reachDraw(id, keccak256("readable"));
        vm.expectRevert(Next.SeedStillAvailable.selector);
        next.recommit(id);
    }

    // ---------------------------------------------------------------- claim

    function test_claimOnlyByWinnersOnce() public {
        uint256 id = _create(3);
        _registerMany(id, 10);

        vm.prank(_entrant(0));
        vm.expectRevert(Next.NotDrawn.selector);
        next.claim(id);

        _reachDraw(id, keccak256("claim"));
        next.draw(id);

        address[] memory w = next.getWinners(id);
        address loser;
        for (uint256 i = 0; i < 10; ++i) {
            if (!next.isWinner(id, _entrant(i))) {
                loser = _entrant(i);
                break;
            }
        }
        vm.prank(loser);
        vm.expectRevert(Next.NotWinner.selector);
        next.claim(id);

        vm.startPrank(w[0]);
        next.claim(id);
        assertTrue(next.hasClaimed(id, w[0]));
        vm.expectRevert(Next.AlreadyClaimed.selector);
        next.claim(id);
        vm.stopPrank();
        assertEq(next.getCampaign(id).claimedCount, 1);
    }

    // ---------------------------------------------------------------- shared test vector

    /// @dev Same JSON as scripts/test-vector.ts: proves Solidity and TypeScript pick identical winners.
    function test_sharedVectorMatchesTypeScript() public {
        string memory json = vm.readFile(string.concat(vm.projectRoot(), "/../scripts/vector.json"));
        uint256 slots = vm.parseJsonUint(json, ".slots");
        bytes32 bh = vm.parseJsonBytes32(json, ".blockHash");
        bytes32 expectedSeed = vm.parseJsonBytes32(json, ".seed");
        address[] memory regs = vm.parseJsonAddressArray(json, ".registrants");
        address[] memory expected = vm.parseJsonAddressArray(json, ".winners");

        uint256 id = _create(uint32(slots));
        assertEq(id, vm.parseJsonUint(json, ".campaignId"));
        for (uint256 i = 0; i < regs.length; ++i) {
            vm.prank(regs[i]);
            next.register(id);
        }
        _reachDraw(id, bh);
        next.draw(id);

        assertEq(next.getCampaign(id).seed, expectedSeed);
        address[] memory got = next.getWinners(id);
        assertEq(got.length, expected.length);
        for (uint256 i = 0; i < got.length; ++i) assertEq(got[i], expected[i]);
    }

    // ---------------------------------------------------------------- v3: events, seed, pass

    function test_registeredEmitsZeroBasedIndex() public {
        uint256 id = _create(5);
        vm.expectEmit(true, true, false, true);
        emit Next.Registered(id, _entrant(0), 0);
        vm.prank(_entrant(0));
        next.register(id);
        vm.expectEmit(true, true, false, true);
        emit Next.Registered(id, _entrant(1), 1);
        vm.prank(_entrant(1));
        next.register(id);
    }

    function test_seedIncludesRegistrantCount() public {
        uint256 id = _create(2);
        _registerMany(id, 7);
        bytes32 bh = keccak256("seed-formula");
        _reachDraw(id, bh);
        next.draw(id);
        assertEq(next.getCampaign(id).seed, keccak256(abi.encode(bh, id, uint256(7))));
    }

    function test_drawEmitsOneWinnerEventPerWinnerInRankOrder() public {
        uint256 id = _create(6);
        _registerMany(id, 20);
        _reachDraw(id, keccak256("events"));
        vm.recordLogs();
        next.draw(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 winnerSig = keccak256("Winner(uint256,address,uint256)");
        bytes32 drawnSig = keccak256("Drawn(uint256,bytes32,uint256)");
        address[] memory w = next.getWinners(id);
        uint256 rank;
        bool sawDrawn;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] == winnerSig) {
                assertEq(uint256(logs[i].topics[1]), id);
                assertEq(address(uint160(uint256(logs[i].topics[2]))), w[rank]);
                assertEq(abi.decode(logs[i].data, (uint256)), rank + 1);
                ++rank;
            } else if (logs[i].topics[0] == drawnSig) {
                (, uint256 winnerCount) = abi.decode(logs[i].data, (bytes32, uint256));
                assertEq(winnerCount, 6);
                sawDrawn = true;
            }
        }
        assertEq(rank, 6);
        assertTrue(sawDrawn);
    }

    function test_everyoneWinsEmitsWinnersInRegistrationOrder() public {
        uint256 id = _create(10);
        _registerMany(id, 3);
        _reachDraw(id, keccak256("all"));
        next.draw(id);
        address[] memory w = next.getWinners(id);
        assertEq(w.length, 3);
        for (uint256 i = 0; i < 3; ++i) assertEq(w[i], _entrant(i));
    }

    function test_claimMintsSoulboundPass() public {
        uint256 id = _create(1);
        _registerMany(id, 3);
        _reachDraw(id, keccak256("pass"));
        next.draw(id);
        address winner = next.getWinners(id)[0];
        NextPass pass = next.pass();

        vm.prank(winner);
        uint256 tokenId = next.claim(id);
        assertEq(pass.ownerOf(tokenId), winner);
        assertTrue(pass.hasPass(id, winner));
        assertTrue(next.hasClaimed(id, winner));
        assertEq(pass.campaignOf(tokenId), id);
        assertTrue(pass.locked(tokenId));
        assertTrue(pass.supportsInterface(0xb45a3c0e)); // ERC-5192

        // non-transferable, even by the owner
        vm.prank(winner);
        vm.expectRevert(NextPass.Soulbound.selector);
        pass.transferFrom(winner, address(0xBEEF), tokenId);
        assertEq(pass.ownerOf(tokenId), winner);
    }

    function test_onlyNextCanMintPasses() public {
        NextPass pass = next.pass();
        assertEq(pass.minter(), address(next));
        vm.expectRevert(NextPass.NotMinter.selector);
        pass.mint(address(this), 1);
    }

    // ---------------------------------------------------------------- fuzz

    function testFuzz_winnerCountAndUniqueness(uint8 nRaw, uint8 kRaw, bytes32 bh) public {
        uint256 n = bound(nRaw, 0, 120);
        uint32 k = uint32(bound(kRaw, 1, 60));
        vm.assume(bh != bytes32(0));
        uint256 id = _create(k);
        _registerMany(id, n);
        _reachDraw(id, bh);
        next.draw(id);
        address[] memory w = next.getWinners(id);
        assertEq(w.length, n < k ? n : k);
        for (uint256 i = 0; i < w.length; ++i) {
            for (uint256 j = i + 1; j < w.length; ++j) assertTrue(w[i] != w[j]);
        }
    }
}
