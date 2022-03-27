import * as env from "env-var";
import {
  ethers as ethersLib,
  ContractTransaction,
  ContractReceipt,
  Wallet,
  Signer,
} from "ethers";
import { task } from "hardhat/config";
import { HardhatEthersHelpers } from "hardhat/types";

const wait = (tx: ContractTransaction) => tx.wait();

const viewOnEtherScan = (tx: ContractReceipt | void) =>
  tx != null &&
  console.log(
    `Check out on etherscan: https://rinkeby.etherscan.io/tx/${tx.transactionHash}`
  );

const getContract = async (
  ethers: typeof ethersLib & HardhatEthersHelpers,
  signer?: Signer
) => {
  const contractAddress = env.get("CONTRACT_ADDRESS").required().asString();
  const Voting = await ethers.getContractFactory("Voting", signer);
  return Voting.attach(contractAddress);
};

task("addCandidate")
  .addPositionalParam("address")
  .setAction(async (args, { ethers }) => {
    const address: string = args.address.trim();
    const voting = await getContract(ethers);
    await voting
      .addCandidate(address)
      .then(wait)
      .catch(console.error)
      .then(viewOnEtherScan);
  });

task("startVoting").setAction(async (_, { ethers }) => {
  const voting = await getContract(ethers);
  await voting
    .startVoting()
    .then(wait)
    .catch(console.error)
    .then(viewOnEtherScan);
});

task("vote")
  .addPositionalParam("candidate")
  .addOptionalParam("from")
  .setAction(async (args, { ethers }) => {
    const candidate: string = args.candidate;

    const voting = await getContract(
      ethers,
      args.from != null ? new Wallet(args.from) : undefined
    );
    await voting
      .vote(candidate, {
        value: ethers.utils.parseEther("0.001"),
        gasLimit: 100000,
      }) // TODO: replace with env
      .then(wait)
      .catch(console.error)
      .then(viewOnEtherScan);
  });

task("closeVoting").setAction(async (_, { ethers }) => {
  const voting = await getContract(ethers);
  await voting
    .closeVoting({ gasLimit: 100000 })
    .then(wait)
    .catch(console.error)
    .then(viewOnEtherScan);
});

task("withdraw")
  .addOptionalParam("to")
  .setAction(async (args, { ethers }) => {
    const to: string =
      args.to ?? (await ethers.provider.getSigner().getAddress());
    const voting = await getContract(ethers);
    await voting
      .withdrawCommision(to, { gasLimit: 100000 })
      .then(wait)
      .catch(console.error)
      .then(viewOnEtherScan);
  });
