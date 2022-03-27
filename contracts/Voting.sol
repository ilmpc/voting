// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

contract OwnerMixin {
    address private owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Caller is not an owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function getOwner() external view returns (address) {
        return owner;
    }
}

contract BalanceMixin {
    function getBalance() public view returns (uint256) {
        return address(this).balance;
    }
}

contract OnlyOnceMixin {
    mapping(address => bool) private hasVoted;
    modifier onlyOnce() {
        require(!hasVoted[msg.sender], "Transaction allowed only once");
        _;
        hasVoted[msg.sender] = true;
    }
}

contract Voting is OwnerMixin, BalanceMixin, OnlyOnceMixin {
    enum Status {
        idle,
        started,
        closed
    }
    Status public status = Status.idle;

    uint256 public startTimestamp;
    mapping(address => uint256) private votes;
    address[] public candidates;
    address private currentWinner;

    modifier fromIdle() {
        require(status == Status.idle, "Voting isn't in 'idle' state");
        _;
    }

    modifier fromStarted() {
        require(status == Status.started, "Voting isn't in 'started' state");
        _;
    }

    function getCandidates() external view returns (address[] memory) {
        return candidates;
    }

    function addCandidate(address candidate) external onlyOwner fromIdle {
        require(votes[candidate] == 0, "Candidate has already added");
        votes[candidate] = 1;
        candidates.push(candidate);
    }

    function startVoting() external onlyOwner fromIdle {
        require(candidates.length != 0, "Can't start without candidates");
        startTimestamp = block.timestamp;
        status = Status.started;
    }

    function vote(address candidate) external payable fromStarted onlyOnce {
        require(
            block.timestamp - startTimestamp < 3 days,
            "Voting has been ended"
        );
        require(msg.value == 0.01 ether, "Should be 0.01 Ether");
        require(votes[candidate] >= 1, "Candidate hasn't been proposed");

        votes[candidate]++;
        if (votes[candidate] > votes[currentWinner]) {
            currentWinner = candidate;
        }
    }

    function closeVoting() external fromStarted {
        require(
            block.timestamp - startTimestamp > 3 days,
            "Voting hasn't been ended"
        );
        status = Status.closed;

        if (currentWinner != address(0)) {
            address payable winnerAddress = payable(currentWinner);
            winnerAddress.transfer((address(this).balance / 10) * 9);
        }
    }

    function withdrawCommision(address payable to) external onlyOwner {
        require(status == Status.closed, "Profit hasn't been paid");
        to.transfer(address(this).balance);
    }
}
