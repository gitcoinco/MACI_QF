// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.20;

interface IGatingVerifier {
    /// @notice Validate user proof
    /// @param _proof Proof 
    /// @param _sender Sender
    function validateUser(
        bytes calldata _proof,
        address _sender
    ) external returns (bool);

    function setRoundVerifier(
        bytes memory _allowlistDetails
    ) external;
}
