// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://v2.hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const EscrowFreelanceModule = buildModule("EscrowFreelanceModule", (m) => {
  // Déploie le contrat (pas d'arguments)
  const escrow = m.contract("EscrowFreelance");

  return { escrow };
});

export default EscrowFreelanceModule;
