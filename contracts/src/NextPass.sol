// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title NextPass — soulbound proof of a won seat
/// @notice One non-transferable ERC-721 per (campaign, winner), minted only by the Next contract on claim().
///         At the venue a winner proves they hold it by signing a challenge with the same wallet.
/// @dev Transfers are blocked in OZ v5's single `_update` hook (mints still pass: `from == address(0)`).
///      Exposes ERC-5192 `locked()` so wallets/marketplaces can tell it is soulbound.
contract NextPass is ERC721 {
    /// @notice The Next contract; the only address allowed to mint.
    address public immutable minter;

    uint256 public totalMinted;
    /// @notice campaignId => account => tokenId (0 = no pass).
    mapping(uint256 => mapping(address => uint256)) public passOf;
    /// @notice tokenId => campaignId.
    mapping(uint256 => uint256) public campaignOf;

    event PassMinted(uint256 indexed campaignId, address indexed account, uint256 indexed tokenId);
    /// @notice ERC-5192: emitted once per token, at mint, since every pass is locked forever.
    event Locked(uint256 tokenId);

    error NotMinter();
    error AlreadyHasPass();
    error Soulbound();

    constructor(address _minter) ERC721("Next Pass", "NEXTPASS") {
        minter = _minter;
    }

    function mint(address to, uint256 campaignId) external returns (uint256 tokenId) {
        if (msg.sender != minter) revert NotMinter();
        if (passOf[campaignId][to] != 0) revert AlreadyHasPass();
        tokenId = ++totalMinted;
        passOf[campaignId][to] = tokenId;
        campaignOf[tokenId] = campaignId;
        // _mint (not _safeMint): no receiver callback, so claim() can't be re-entered through the pass.
        _mint(to, tokenId);
        emit PassMinted(campaignId, to, tokenId);
        emit Locked(tokenId);
    }

    function hasPass(uint256 campaignId, address account) external view returns (bool) {
        return passOf[campaignId][account] != 0;
    }

    /// @notice ERC-5192: every pass is permanently locked.
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e /* ERC-5192 */ || super.supportsInterface(interfaceId);
    }

    /// @dev Allow mint (from == 0); reject every transfer and burn of an existing token.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (_ownerOf(tokenId) != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }
}
