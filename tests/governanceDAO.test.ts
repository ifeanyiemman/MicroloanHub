import { describe, it, expect, beforeEach } from "vitest";

interface Proposal {
  proposer: string;
  description: string;
  targetContract: string;
  targetFunction: string;
  parameter: bigint;
  votesFor: bigint;
  votesAgainst: bigint;
  startBlock: bigint;
  endBlock: bigint;
  executed: boolean;
}

interface VoterDetails {
  voted: boolean;
  tokens: bigint;
}

class MockContract {
  admin: string;
  paused: boolean;
  loanFactory: string;
  lendingPool: string;
  collateralManager: string;
  proposalCount: bigint;
  proposals: Map<bigint, Proposal>;
  votes: Map<string, boolean>;
  voterTokens: Map<string, bigint>;
  tokenBalances: Map<string, bigint>;
  blockHeight: bigint;
  MIN_PROPOSAL_THRESHOLD: bigint = 1000000n;
  VOTING_PERIOD: bigint = 1440n;
  QUORUM_PERCENT: bigint = 5000n;
  TOKEN_CONTRACT: string = "SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.mhl-token";

  constructor(admin: string) {
    this.admin = admin;
    this.paused = false;
    this.loanFactory = "SP1LOANFACTORY000000000000000000000000000";
    this.lendingPool = "SP1LENDINGPOOL0000000000000000000000000000";
    this.collateralManager = "SP1COLLATERALMANAGER000000000000000000000";
    this.proposalCount = 0n;
    this.proposals = new Map();
    this.votes = new Map();
    this.voterTokens = new Map();
    this.tokenBalances = new Map();
    this.blockHeight = 1000n;
  }

  isAdmin(caller: string): boolean {
    return caller === this.admin;
  }

  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 400 };
    this.paused = pause;
    return { value: pause };
  }

  setContracts(caller: string, factory: string, pool: string, collateral: string): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 400 };
    if ([factory, pool, collateral].includes("SP000000000000000000002Q6VF78")) return { error: 406 };
    this.loanFactory = factory;
    this.lendingPool = pool;
    this.collateralManager = collateral;
    return { value: true };
  }

  createProposal(caller: string, description: string, targetContract: string, targetFunction: string, parameter: bigint): { value: bigint } | { error: number } {
    if (this.paused) return { error: 405 };
    if (targetContract === "SP000000000000000000002Q6VF78") return { error: 407 };
    const tokenBalance = this.tokenBalances.get(caller) || 0n;
    if (tokenBalance < this.MIN_PROPOSAL_THRESHOLD) return { error: 404 };
    const proposalId = this.proposalCount + 1n;
    this.proposals.set(proposalId, {
      proposer: caller,
      description,
      targetContract,
      targetFunction,
      parameter,
      votesFor: 0n,
      votesAgainst: 0n,
      startBlock: this.blockHeight,
      endBlock: this.blockHeight + this.VOTING_PERIOD,
      executed: false,
    });
    this.proposalCount = proposalId;
    return { value: proposalId };
  }

  vote(caller: string, proposalId: bigint, inFavor: boolean, tokens: bigint): { value: boolean } | { error: number } {
    if (this.paused) return { error: 405 };
    if (tokens <= 0n) return { error: 401 };
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return { error: 402 };
    if (this.blockHeight >= proposal.endBlock) return { error: 409 };
    if (proposal.executed) return { error: 403 };
    if (this.votes.has(`${proposalId}-${caller}`)) return { error: 408 };
    const tokenBalance = this.tokenBalances.get(caller) || 0n;
    if (tokenBalance < tokens) return { error: 404 };
    this.votes.set(`${proposalId}-${caller}`, inFavor);
    this.voterTokens.set(`${proposalId}-${caller}`, tokens);
    this.proposals.set(proposalId, {
      ...proposal,
      votesFor: inFavor ? proposal.votesFor + tokens : proposal.votesFor,
      votesAgainst: inFavor ? proposal.votesAgainst : proposal.votesAgainst + tokens,
    });
    return { value: true };
  }

  executeProposal(proposalId: bigint): { value: boolean } | { error: number } {
    if (this.paused) return { error: 405 };
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return { error: 402 };
    if (this.blockHeight < proposal.endBlock) return { error: 409 };
    if (proposal.executed) return { error: 403 };
    const totalVotes = proposal.votesFor + proposal.votesAgainst;
    const tokenSupply = 10000000n; // Adjusted to 10 million tokens
    const quorumRequired = (tokenSupply * this.QUORUM_PERCENT) / 10000n;
    if (totalVotes < quorumRequired) return { error: 401 };
    if (proposal.votesFor <= proposal.votesAgainst) return { error: 401 };
    this.proposals.set(proposalId, { ...proposal, executed: true });
    return { value: true }; // Mock execution (no real contract calls)
  }

  getProposal(proposalId: bigint): { value: Proposal } | { error: number } {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return { error: 402 };
    return { value: proposal };
  }

  getVoterDetails(proposalId: bigint, voter: string): { value: VoterDetails } {
    return {
      value: {
        voted: this.votes.get(`${proposalId}-${voter}`) !== undefined,
        tokens: this.voterTokens.get(`${proposalId}-${voter}`) || 0n,
      },
    };
  }

  getProposalCount(): { value: bigint } {
    return { value: this.proposalCount };
  }
}

describe("GovernanceDAO Contract", () => {
  let mockContract: MockContract;

  beforeEach(() => {
    mockContract = new MockContract("STADMINADDRESS");
    mockContract.tokenBalances.set("STVOTER1", 4000000n); // Increased to support higher vote
    mockContract.tokenBalances.set("STVOTER2", 4000000n); // Increased to support higher vote
    mockContract.blockHeight = 1000n;
  });

  it("should allow user to create a proposal", () => {
    const result = mockContract.createProposal(
      "STVOTER1",
      "Update interest rate",
      mockContract.loanFactory,
      "set-max-interest-rate",
      1000n
    );
    expect(result).toEqual({ value: 1n });
    const proposal = mockContract.getProposal(1n);
    if ("value" in proposal) {
      expect(proposal.value).toEqual({
        proposer: "STVOTER1",
        description: "Update interest rate",
        targetContract: mockContract.loanFactory,
        targetFunction: "set-max-interest-rate",
        parameter: 1000n,
        votesFor: 0n,
        votesAgainst: 0n,
        startBlock: 1000n,
        endBlock: 2440n,
        executed: false,
      });
    } else {
      expect(proposal).toEqual({ value: expect.any(Object) }); // Should not reach here
    }
  });

  it("should prevent proposal creation with insufficient tokens", () => {
    mockContract.tokenBalances.set("STVOTER1", 500000n);
    const result = mockContract.createProposal(
      "STVOTER1",
      "Update interest rate",
      mockContract.loanFactory,
      "set-max-interest-rate",
      1000n
    );
    expect(result).toEqual({ error: 404 });
  });

  it("should allow users to vote on a proposal", () => {
    mockContract.createProposal(
      "STVOTER1",
      "Update interest rate",
      mockContract.loanFactory,
      "set-max-interest-rate",
      1000n
    );
    const result = mockContract.vote("STVOTER1", 1n, true, 1000000n);
    expect(result).toEqual({ value: true });
    const proposal = mockContract.getProposal(1n);
    if ("value" in proposal) {
      expect(proposal.value.votesFor).toBe(1000000n);
    } else {
      expect(proposal).toEqual({ value: expect.any(Object) }); // Should not reach here
    }
    const voterDetails = mockContract.getVoterDetails(1n, "STVOTER1");
    expect(voterDetails).toEqual({ value: { voted: true, tokens: 1000000n } });
  });

  it("should prevent voting with insufficient tokens", () => {
    mockContract.createProposal(
      "STVOTER1",
      "Update interest rate",
      mockContract.loanFactory,
      "set-max-interest-rate",
      1000n
    );
    mockContract.tokenBalances.set("STVOTER2", 500000n);
    const result = mockContract.vote("STVOTER2", 1n, true, 1000000n);
    expect(result).toEqual({ error: 404 });
  });

  it("should prevent double voting", () => {
    mockContract.createProposal(
      "STVOTER1",
      "Update interest rate",
      mockContract.loanFactory,
      "set-max-interest-rate",
      1000n
    );
    mockContract.vote("STVOTER1", 1n, true, 1000000n);
    const result = mockContract.vote("STVOTER1", 1n, false, 1000000n);
    expect(result).toEqual({ error: 408 });
  });

  it("should execute an approved proposal", () => {
    mockContract.createProposal(
      "STVOTER1",
      "Update interest rate",
      mockContract.loanFactory,
      "set-max-interest-rate",
      1000n
    );
    mockContract.vote("STVOTER1", 1n, true, 3000000n); // Increased to meet quorum
    mockContract.vote("STVOTER2", 1n, true, 3000000n); // Increased to meet quorum
    mockContract.blockHeight = 2440n; // End voting period
    const result = mockContract.executeProposal(1n);
    expect(result).toEqual({ value: true });
    const proposal = mockContract.getProposal(1n);
    if ("value" in proposal) {
      expect(proposal.value.executed).toBe(true);
    } else {
      expect(proposal).toEqual({ value: expect.any(Object) }); // Should not reach here
    }
  });

  it("should prevent execution before voting period ends", () => {
    mockContract.createProposal(
      "STVOTER1",
      "Update interest rate",
      mockContract.loanFactory,
      "set-max-interest-rate",
      1000n
    );
    mockContract.vote("STVOTER1", 1n, true, 1000000n);
    const result = mockContract.executeProposal(1n);
    expect(result).toEqual({ error: 409 });
  });

  it("should prevent execution without quorum", () => {
    mockContract.createProposal(
      "STVOTER1",
      "Update interest rate",
      mockContract.loanFactory,
      "set-max-interest-rate",
      1000n
    );
    mockContract.vote("STVOTER1", 1n, true, 100000n); // Too few tokens
    mockContract.blockHeight = 2440n;
    const result = mockContract.executeProposal(1n);
    expect(result).toEqual({ error: 401 });
  });

  it("should prevent execution if votes against exceed votes for", () => {
    mockContract.createProposal(
      "STVOTER1",
      "Update interest rate",
      mockContract.loanFactory,
      "set-max-interest-rate",
      1000n
    );
    mockContract.vote("STVOTER1", 1n, true, 1000000n);
    mockContract.vote("STVOTER2", 1n, false, 1500000n);
    mockContract.blockHeight = 2440n;
    const result = mockContract.executeProposal(1n);
    expect(result).toEqual({ error: 401 });
  });

  it("should return proposal details", () => {
    mockContract.createProposal(
      "STVOTER1",
      "Update interest rate",
      mockContract.loanFactory,
      "set-max-interest-rate",
      1000n
    );
    const result = mockContract.getProposal(1n);
    if ("value" in result) {
      expect(result.value.description).toBe("Update interest rate");
    } else {
      expect(result).toEqual({ value: expect.any(Object) }); // Should not reach here
    }
  });
});