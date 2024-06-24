// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.20;

interface IAlowlistVerifier {
    /// @notice Validate allowlist proof
    /// @param _proof Proof 
    function validateAllowlist(
        bytes memory _proof
    ) external returns (uint256);

    function setRoundAllowlist(bytes memory _allowlistDetails) external;
}
