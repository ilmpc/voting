import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect, util } from "chai";
import { BigNumber, ContractTransaction } from "ethers";
import { ethers } from "hardhat";

import { Voting } from "typechain";

const { utils } = ethers;

enum Status {
  Idle,
  Started,
  Close,
}

enum Errors {
  NotAnOwner = "Caller is not an owner",
  OnlyOnce = "Transaction allowed only once",
  NotIdle = "Voting isn't in 'idle' state",
  NotStarted = "Voting isn't in 'started' state",
  AlreadyAddedCandidate = "Candidate has already added",
  NoCandidates = "Can't start without candidates",
  VotingHasEnded = "Voting has been ended",
  WrongFee = "Should be 0.01 Ether",
  UnknownCandidate = "Candidate hasn't been proposed",
  VotingHasNotEnded = "Voting hasn't been ended",
  NotEnded = "Profit hasn't been paid",
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

  // Helpers

  const VOTING_FEE = utils.parseEther("0.01");

  const wait = (tx: ContractTransaction) => tx.wait();

  const assertStatus = async (status: Status) =>
    expect(await voting.status()).to.equal(status);

  const addCandidate = (
    candidate: SignerWithAddress,
    by: SignerWithAddress = owner
  ) => {
    return voting.connect(by).addCandidate(candidate.address).then(wait);
  };

  const addCandidateAndCheck = async (candidate: SignerWithAddress) => {
    await addCandidate(candidate);
    const candidates = await voting.getCandidates();
    expect(candidates.at(-1)).to.equal(candidate.address);
  };

  const passTime = async () => {
    await ethers.provider.send("evm_increaseTime", [3 * 24 * 60 * 60 + 1]);
  };

  // Tests
  describe("Basic", () => {
    it("should be deployed", async () => {
      expect(voting.address).to.be.properAddress;
    });

    it("should set the right owner", async function () {
      expect(await voting.getOwner()).to.equal(owner.address);
    });

    it("Happy path", async () => {
      await assertStatus(Status.Idle);

      await voting.addCandidate(others[0].address).then(wait);
      await voting.addCandidate(others[1].address).then(wait);
      await voting.addCandidate(others[2].address).then(wait);

      expect(await voting.getCandidates()).deep.be.equal(
        others.slice(0, 3).map((e) => e.address)
      );

      await voting.startVoting().then(wait);
      await assertStatus(Status.Started);

      const voteTx = await voting
        .connect(others[3])
        .vote(others[0].address, { value: VOTING_FEE });

      expect(voteTx).to.changeEtherBalances(
        [others[3], voting],
        [VOTING_FEE.mul(-1), VOTING_FEE]
      );

      await passTime();

      const winnerSum = VOTING_FEE.div(9).mul(10);
      const closeTx = await voting.closeVoting();

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

  describe("Candidates", () => {
    it("should return empty array of candidates", async () => {
      expect(await voting.getCandidates()).to.be.empty;
    });

    it("should add candidate and stay idle", async () => {
      await assertStatus(Status.Idle);
      await addCandidateAndCheck(others[0]);
      await assertStatus(Status.Idle);
    });

    it("should add candidate only once", async () => {
      await addCandidateAndCheck(others[0]);
      await expect(addCandidate(others[0])).to.be.revertedWith(
        Errors.AlreadyAddedCandidate
      );
    });

    it("should restrict adding candidate by not owner", async () => {
      await expect(addCandidate(others[0], others[0])).to.be.revertedWith(
        Errors.NotAnOwner
      );
    });

    it("should restrict add candidates after voting has been started", async () => {
      await addCandidateAndCheck(others[0]);
      await voting.startVoting().then(wait);
      await expect(addCandidate(others[1])).to.be.revertedWith(Errors.NotIdle);
    });

    it("should restrict add candaidates after voting has been ended", async () => {
      await addCandidateAndCheck(others[0]);
      await voting.startVoting().then(wait);
      await passTime();
      await voting.closeVoting().then(wait);
      await expect(addCandidate(others[1])).to.be.revertedWith(Errors.NotIdle);
    });
  });

  describe("Voting launch", () => {
    it("should use block time as start time", async () => {
      await addCandidateAndCheck(others[0]);
      const { blockNumber } = await voting.startVoting().then(wait);
      const { timestamp: blockTimestamp } = await ethers.provider.getBlock(
        blockNumber
      );
      expect(await voting.startTimestamp()).to.be.equal(blockTimestamp);
    });

    it("should restrict launch without candidates", async () => {
      await expect(voting.startVoting()).to.be.revertedWith(
        Errors.NoCandidates
      );
    });

    it("should restrict launch by not owner", async () => {
      await addCandidateAndCheck(others[0]);
      await expect(voting.connect(others[0]).startVoting()).to.be.revertedWith(
        Errors.NotAnOwner
      );
    });

    it("should be started only once", async () => {
      await addCandidateAndCheck(others[0]);
      await voting.startVoting().then(wait);
      await expect(voting.startVoting().then(wait)).to.be.revertedWith(
        Errors.NotIdle
      );
    });
  });

  describe("Voting process", () => {
    beforeEach(async () => {
      await addCandidateAndCheck(others[0]);
      await addCandidateAndCheck(others[1]);
      await voting.startVoting().then(wait);
    });

    it("should be able to vote only once for one candidate", async () => {
      const vote = () => voting.vote(others[0].address, { value: VOTING_FEE });
      await vote().then(wait);
      expect(vote()).to.be.revertedWith(Errors.OnlyOnce);
    });

    it("should be able to vote only once at all", async () => {
      const vote = (candidate: SignerWithAddress) =>
        voting.vote(candidate.address, { value: VOTING_FEE });
      await vote(others[0]).then(wait);
      expect(vote(others[1])).to.be.revertedWith(Errors.OnlyOnce);
    });

    it(`should be able to vote only for ${utils.formatEther(
      VOTING_FEE
    )} eth`, async () => {
      const vote = (amount?: BigNumber) =>
        voting.vote(others[0].address, { value: amount });
      // More than needed
      expect(vote(VOTING_FEE.mul(2))).to.be.revertedWith(Errors.WrongFee);
      // Less than needed
      expect(vote(VOTING_FEE.div(2))).to.be.revertedWith(Errors.WrongFee);
      // 0
      expect(vote(BigNumber.from(0))).to.be.revertedWith(Errors.WrongFee);
      // undefined
      expect(vote()).to.be.revertedWith(Errors.WrongFee);
    });

    it("should restrict voting for unproposed candidate", async () => {
      await expect(
        voting.vote(others[5].address, { value: VOTING_FEE })
      ).to.be.revertedWith(Errors.UnknownCandidate);
    });

    it("should not allow to vote after voting is ended", async () => {
      await passTime();
      await expect(
        voting.vote(others[0].address, { value: VOTING_FEE })
      ).to.be.revertedWith(Errors.VotingHasEnded);
    });
  });

  it("should not allow to vote before start", async () => {
    await addCandidateAndCheck(others[0]);
    await expect(
      voting.vote(others[0].address, { value: VOTING_FEE })
    ).to.be.revertedWith(Errors.NotStarted);
  });

  describe("after successful voting", () => {
    beforeEach(async () => {
      await addCandidateAndCheck(others[0]);
      await addCandidateAndCheck(others[1]);
      await voting.startVoting().then(wait);
      await voting.vote(others[0].address, { value: VOTING_FEE }).then(wait);
      await voting
        .connect(others[0])
        .vote(others[1].address, { value: VOTING_FEE })
        .then(wait);
      await voting
        .connect(others[1])
        .vote(others[1].address, { value: VOTING_FEE })
        .then(wait);
      // others[1] is the winner
    });

    it("should not be able to close voting before end", async () => {
      await expect(voting.closeVoting().then(wait)).to.be.revertedWith(
        Errors.VotingHasNotEnded
      );

      await expect(
        voting.connect(others[5]).closeVoting().then(wait)
      ).to.be.revertedWith(Errors.VotingHasNotEnded);
    });

    it("anyone should be able to close voting", async () => {
      await passTime();

      const closeTx = await voting.connect(others[5]).closeVoting();
      const balance = VOTING_FEE.mul(3); // await ethers.provider.getBalance(voting.address);
      const winnerSum = balance.div(10).mul(9);

      await expect(closeTx).to.changeEtherBalances(
        [voting, others[1]],
        [winnerSum.mul(-1), winnerSum]
      );
      await assertStatus(Status.Close);
    });

    it("should not able to withdraw commision before voting been closed", async () => {
      await expect(voting.withdrawCommision(owner.address)).to.be.revertedWith(
        Errors.NotEnded
      );
    });

    it("owner should be able to withdraw commision", async () => {
      await passTime();
      await voting.closeVoting().then(wait);
      const withdrawTx = await voting.withdrawCommision(owner.address);
      const commision = VOTING_FEE.mul(3).div(10).mul(1);
      await expect(withdrawTx).to.changeEtherBalances(
        [voting, owner],
        [commision.mul(-1), commision]
      );
    });

    it("only owner should be able to withdraw commision", async () => {
      await passTime();
      await voting.closeVoting().then(wait);
      await expect(
        voting.connect(others[0]).withdrawCommision(others[0].address)
      ).to.be.revertedWith(Errors.NotAnOwner);
    });
  });

  it("should skip paying prize if no one voted", async () => {
    await addCandidateAndCheck(others[0]);
    await voting.startVoting().then(wait);
    await passTime();
    await voting.closeVoting().then(wait);
    await assertStatus(Status.Close);
  });
});
