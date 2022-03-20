import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { Voting } from "../typechain";

const { utils } = ethers;

enum Status {
  Idle = 0,
  Started = 1,
  Close = 2,
}

describe("Voting", async () => {
  let owner: SignerWithAddress;
  let others: SignerWithAddress[];
  let voting: Voting;

  beforeEach(async () => {
    [owner, ...others] = await ethers.getSigners();
    const Voting = await ethers.getContractFactory("Voting");
    voting = await Voting.deploy();
    await voting.deployed();
  });

  const assertStatus = async (status: Status) =>
    expect(await voting.status()).to.equal(status);

  it("should be deployed", async () => {
    expect(voting.address).to.be.properAddress;
  });

  it("Should add candidate and stay idle", async () => {
    await assertStatus(Status.Idle);

    await voting.addCandidate(others[0].address).then((tx) => tx.wait());

    const firstCandidateAddress = await voting.candidates(0);
    expect(firstCandidateAddress).to.equal(others[0].address);

    await assertStatus(Status.Idle);
  });

  it("Happy path", async () => {
    await assertStatus(Status.Idle);

    await voting.addCandidate(others[0].address).then((tx) => tx.wait());
    await voting.addCandidate(others[1].address).then((tx) => tx.wait());
    await voting.addCandidate(others[2].address).then((tx) => tx.wait());

    expect(await voting.getCandidates()).deep.be.equal(
      others.slice(0, 3).map((e) => e.address)
    );

    await voting.startVoting().then((tx) => tx.wait());
    await assertStatus(Status.Started);

    const votingFee = utils.parseEther("0.01");
    const voteTx = await voting
      .connect(others[3])
      .vote(others[0].address, { value: votingFee });

    await expect(voteTx).to.changeEtherBalances(
      [others[3], voting],
      [votingFee.mul(-1), votingFee]
    );

    // await expect(
    //   voting.connect(others[3]).vote(others[0].address, { value: votingFee })
    // ).to.be.revertedWith("Transaction allowed only once");

    await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60 + 1]);

    const winnerSum = votingFee.div(9).mul(10);
    const closeTx = await voting.closeVoting().then((tx) => tx.wait());

    expect(closeTx).to.changeEtherBalances(
      [voting, others[3]],
      [winnerSum.mul(-1), winnerSum]
    );
    await assertStatus(Status.Close);

    const commison = await voting.getBalance();
    const withdrawTx = await voting.withdrawCommision(others[4].address);

    expect(withdrawTx).to.changeEtherBalances(
      [voting, others[4]],
      [commison.mul(-1), commison]
    );
    expect(await voting.getBalance()).to.be.equals(0);
  });
});
