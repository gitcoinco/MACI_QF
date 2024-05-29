// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.20;


interface IZuPassVerifier {
    /// @notice Validate proof of attendance
    /// @param _pA Proof part A
    /// @param _pB Proof part B
    /// @param _pC Proof part C
    /// @param _pubSignals The public signals
    function verifyProof(
        uint[2] memory _pA,
        uint[2][2] memory _pB,
        uint[2] memory _pC,
        uint[38] memory _pubSignals
    ) external returns (bool);

    function roundRegistration(uint256[] memory _eventIds) external;
}

