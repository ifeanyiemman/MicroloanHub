import { describe, it, expect, beforeEach } from "vitest";

interface Loan {
  borrower: string;
  amount: bigint;
  interestRate: bigint;
  duration: bigint;
  startBlock: bigint;
  deadlineBlock: bigint;
  status: bigint;
  totalRepaid: bigint;
  lendingPool: string | null;
  collateralManager: string | null;
}

const mockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  loanCounter: 0n,
  loans: new Map<bigint, Loan>(),
  MIN_LOAN_AMOUNT: 100n,
  MAX_LOAN_AMOUNT: 1_000_000_000n,
  MIN_INTEREST_RATE: 100n,
  MAX_INTEREST_RATE: 2000n,
  MIN_DURATION: 43_200n,
  MAX_DURATION: 525_600n,
  STATUS_PENDING: 0n,
  STATUS_ACTIVE: 1n,
  STATUS_REPAID: 2n,
  STATUS_DEFAULTED: 3n,
  blockHeight: 1000n,

  isAdmin(caller: string): boolean {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  validateLoanParams(amount: bigint, interestRate: bigint, duration: bigint): boolean {
    return (
      amount >= this.MIN_LOAN_AMOUNT &&
      amount <= this.MAX_LOAN_AMOUNT &&
      interestRate >= this.MIN_INTEREST_RATE &&
      interestRate <= this.MAX_INTEREST_RATE &&
      duration >= this.MIN_DURATION &&
      duration <= this.MAX_DURATION
    );
  },

  createLoan(caller: string, borrower: string, amount: bigint, interestRate: bigint, duration: bigint): { value: bigint } | { error: number } {
    if (this.paused) return { error: 106 };
    if (borrower === "SP000000000000000000002Q6VF78") return { error: 107 };
    if (!this.validateLoanParams(amount, interestRate, duration)) return { error: 101 };
    this.loanCounter += 1n;
    const loanId = this.loanCounter;
    const startBlock = this.blockHeight;
    const deadlineBlock = startBlock + duration;
    this.loans.set(loanId, {
      borrower,
      amount,
      interestRate,
      duration,
      startBlock,
      deadlineBlock,
      status: this.STATUS_PENDING,
      totalRepaid: 0n,
      lendingPool: null,
      collateralManager: null,
    });
    return { value: loanId };
  },

  updateLoanStatus(caller: string, loanId: bigint, newStatus: bigint): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (this.paused) return { error: 106 };
    const loan = this.loans.get(loanId);
    if (!loan) return { error: 104 };
    if (newStatus !== this.STATUS_ACTIVE && newStatus !== this.STATUS_REPAID && newStatus !== this.STATUS_DEFAULTED) return { error: 108 };
    if (loan.status === this.STATUS_REPAID || loan.status === this.STATUS_DEFAULTED) return { error: 108 };
    this.loans.set(loanId, { ...loan, status: newStatus });
    return { value: true };
  },

  recordRepayment(caller: string, loanId: bigint, amount: bigint): { value: boolean } | { error: number } {
    if (this.paused) return { error: 106 };
    const loan = this.loans.get(loanId);
    if (!loan) return { error: 104 };
    if (loan.status !== this.STATUS_ACTIVE) return { error: 105 };
    if (amount <= 0n) return { error: 101 };
    const totalOwed = loan.amount + (loan.amount * loan.interestRate) / 10000n;
    if (loan.totalRepaid + amount > totalOwed) return { error: 101 };
    this.loans.set(loanId, { ...loan, totalRepaid: loan.totalRepaid + amount });
    return { value: true };
  },

  setLoanContracts(caller: string, loanId: bigint, lendingPool: string | null, collateralManager: string | null): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 100 };
    const loan = this.loans.get(loanId);
    if (!loan) return { error: 104 };
    if (loan.status !== this.STATUS_PENDING) return { error: 105 };
    this.loans.set(loanId, { ...loan, lendingPool, collateralManager });
    return { value: true };
  },

  isLoanOverdue(loan: Loan): boolean {
    return loan.status === this.STATUS_ACTIVE && this.blockHeight > loan.deadlineBlock;
  },

  getLoanDetails(loanId: bigint): { value: Loan } | { error: number } {
    const loan = this.loans.get(loanId);
    if (!loan) return { error: 104 };
    return { value: loan };
  },
};

describe("LoanFactory Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.loanCounter = 0n;
    mockContract.loans = new Map();
    mockContract.blockHeight = 1000n;
  });

  it("should create a loan with valid parameters", () => {
    const result = mockContract.createLoan(
      "ST2CY5...",
      "ST3NB...",
      1000n,
      500n,
      43200n
    );
    expect(result).toEqual({ value: 1n });
    const loan = mockContract.loans.get(1n);
    expect(loan).toEqual({
      borrower: "ST3NB...",
      amount: 1000n,
      interestRate: 500n,
      duration: 43200n,
      startBlock: 1000n,
      deadlineBlock: 44200n,
      status: 0n,
      totalRepaid: 0n,
      lendingPool: null,
      collateralManager: null,
    });
  });

  it("should prevent loan creation when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.createLoan(
      "ST2CY5...",
      "ST3NB...",
      1000n,
      500n,
      43200n
    );
    expect(result).toEqual({ error: 106 });
  });

  it("should prevent loan creation with invalid amount", () => {
    const result = mockContract.createLoan(
      "ST2CY5...",
      "ST3NB...",
      50n,
      500n,
      43200n
    );
    expect(result).toEqual({ error: 101 });
  });

  it("should update loan status by admin", () => {
    mockContract.createLoan(
      mockContract.admin,
      "ST3NB...",
      1000n,
      500n,
      43200n
    );
    const result = mockContract.updateLoanStatus(mockContract.admin, 1n, 1n);
    expect(result).toEqual({ value: true });
    const loan = mockContract.loans.get(1n);
    expect(loan?.status).toBe(1n);
  });

  it("should prevent non-admin from updating loan status", () => {
    mockContract.createLoan(
      mockContract.admin,
      "ST3NB...",
      1000n,
      500n,
      43200n
    );
    const result = mockContract.updateLoanStatus("ST2CY5...", 1n, 1n);
    expect(result).toEqual({ error: 100 });
  });

  it("should record repayment for active loan", () => {
    mockContract.createLoan(
      mockContract.admin,
      "ST3NB...",
      1000n,
      500n,
      43200n
    );
    mockContract.updateLoanStatus(mockContract.admin, 1n, 1n);
    const result = mockContract.recordRepayment("ST3NB...", 1n, 500n);
    expect(result).toEqual({ value: true });
    const loan = mockContract.loans.get(1n);
    expect(loan?.totalRepaid).toBe(500n);
  });

  it("should prevent repayment for non-active loan", () => {
    mockContract.createLoan(
      mockContract.admin,
      "ST3NB...",
      1000n,
      500n,
      43200n
    );
    const result = mockContract.recordRepayment("ST3NB...", 1n, 500n);
    expect(result).toEqual({ error: 105 });
  });

  it("should set lending pool and collateral manager", () => {
    mockContract.createLoan(
      mockContract.admin,
      "ST3NB...",
      1000n,
      500n,
      43200n
    );
    const result = mockContract.setLoanContracts(
      mockContract.admin,
      1n,
      "ST4RE...",
      "ST5HF..."
    );
    expect(result).toEqual({ value: true });
    const loan = mockContract.loans.get(1n);
    expect(loan?.lendingPool).toBe("ST4RE...");
    expect(loan?.collateralManager).toBe("ST5HF...");
  });

  it("should detect overdue loan", () => {
    mockContract.createLoan(
      mockContract.admin,
      "ST3NB...",
      1000n,
      500n,
      43200n
    );
    mockContract.updateLoanStatus(mockContract.admin, 1n, 1n);
    mockContract.blockHeight = 50000n;
    const loan = mockContract.loans.get(1n)!;
    expect(mockContract.isLoanOverdue(loan)).toBe(true);
  });

  it("should return loan details", () => {
    mockContract.createLoan(
      mockContract.admin,
      "ST3NB...",
      1000n,
      500n,
      43200n
    );
    const result = mockContract.getLoanDetails(1n);
    expect(result).toEqual({
      value: {
        borrower: "ST3NB...",
        amount: 1000n,
        interestRate: 500n,
        duration: 43200n,
        startBlock: 1000n,
        deadlineBlock: 44200n,
        status: 0n,
        totalRepaid: 0n,
        lendingPool: null,
        collateralManager: null,
      },
    });
  });

  it("should prevent loan creation with zero address", () => {
    const result = mockContract.createLoan(
      "ST2CY5...",
      "SP000000000000000000002Q6VF78",
      1000n,
      500n,
      43200n
    );
    expect(result).toEqual({ error: 107 });
  });
});