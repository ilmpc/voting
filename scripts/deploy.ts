import { appendFileSync } from "fs";
import { join } from "path";
import { ethers } from "hardhat";

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  // We get the contract to deploy
  const Voting = await ethers.getContractFactory("Voting");
  const voting = await Voting.deploy();
  await voting.deployed();
  console.log("Voting deployed to:", voting.address);
  console.log(
    `Check out on etherscan: https://rinkeby.etherscan.io/address/${voting.address}`
  );
  appendFileSync(
    join(__dirname, "..", ".env"),
    `CONTRACT_ADDRESS=${voting.address}\n`
  );
  console.log("Contract address was saved into .env file");
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
