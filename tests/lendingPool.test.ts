import { describe, it, expect, beforeEach } from "vitest";

type LoanStatus = "pending" | "active" | "repaid" | "defaulted";

interface Loan {
  borrower: string;
  amount: bigint;
  interestRate: bigint;
  duration: bigint;
  startBlock: bigint;
  deadlineBlock: bigint;
  status: LoanStatus;
  totalRepaid: bigint;
  lendingPool: string | null;
  collateralManager: string | null;
}

interface LoanFunding {
  totalFunded: bigint;
  funded: boolean;
}

class MockContract {
  admin: string;
  paused: boolean;
  totalPooled: bigint;
  loans: Map<bigint, Loan>;
  lenderBalances: Map<string, bigint>;
  lenderLoanContributions: Map<string, bigint>;
  loanFunding: Map<bigint, LoanFunding>;
  MIN_DEPOSIT: bigint = 100n;
  MAX_DEPOSIT: bigint = 1000000000n;

  constructor(admin: string) {
    this.admin = admin;
    this.paused = false;
    this.totalPooled = 0n;
    this.loans = new Map();
    this.lenderBalances = new Map();
    this.lenderLoanContributions = new Map();
    this.loanFunding = new Map();
  }

  isAdmin(caller: string): boolean {
    return caller === this.admin;
  }

  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 200 };
    this.paused = pause;
    return { value: pause };
  }

  deposit(caller: string, amount: bigint): { value: boolean } | { error: number } {
    if (this.paused) return { error: 203 };
    if (amount < this.MIN_DEPOSIT || amount > this.MAX_DEPOSIT) return { error: 201 };
    this.lenderBalances.set(caller, (this.lenderBalances.get(caller) || 0n) + amount);
    this.totalPooled += amount;
    return { value: true };
  }

  withdraw(caller: string, amount: bigint): { value: boolean } | { error: number } {
    if (this.paused) return { error: 203 };
    if (amount < this.MIN_DEPOSIT || amount > this.MAX_DEPOSIT) return { error: 201 };
    const balance = this.lenderBalances.get(caller) || 0n;
    if (balance < amount) return { error: 202 };
    this.lenderBalances.set(caller, balance - amount);
    this.totalPooled -= amount;
    return { value: true };
  }

  createLoan(borrower: string, loanId: bigint, amount: bigint, interestRate: bigint, duration: bigint): { value: boolean } | { error: number } {
    if (this.loans.has(loanId)) return { error: 409 };
    this.loans.set(loanId, {
      borrower,
      amount,
      interestRate,
      duration,
      startBlock: 1000n,
      deadlineBlock: 1000n + duration,
      status: "pending",
      totalRepaid: 0n,
      lendingPool: null,
      collateralManager: null,
    });
    return { value: true };
  }

  fundLoan(lender: string, loanId: bigint, amount: bigint): { value: boolean } | { error: number } {
    if (this.paused) return { error: 203 };
    if (amount < this.MIN_DEPOSIT || amount > this.MAX_DEPOSIT) return { error: 201 };
    const loan = this.loans.get(loanId);
    if (!loan) return { error: 404 };
    if (loan.status !== "pending") return { error: 206 };
    const lenderBalance = this.lenderBalances.get(lender) || 0n;
    if (lenderBalance < amount) return { error: 202 };
    const loanFunding = this.loanFunding.get(loanId) || { totalFunded: 0n, funded: false };
    if (loanFunding.funded) return { error: 208 };
    if (amount > loan.amount) return { error: 201 };
    this.lenderBalances.set(lender, lenderBalance - amount);
    this.lenderLoanContributions.set(`${lender}-${loanId}`, amount);
    this.loanFunding.set(loanId, {
      totalFunded: loanFunding.totalFunded + amount,
      funded: loanFunding.totalFunded + amount === loan.amount,
    });
    if (loanFunding.totalFunded + amount === loan.amount) {
      loan.status = "active";
      this.loans.set(loanId, loan);
    }
    return { value: true };
  }

  distributeRepayment(caller: string, loanId: bigint, repaymentAmount: bigint): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 200 };
    if (this.paused) return { error: 203 };
    if (repaymentAmount <= 0n) return { error: 201 };
    const loan = this.loans.get(loanId);
    if (!loan) return { error: 404 };
    if (loan.status !== "active") return { error: 206 };
    const loanFunding = this.loanFunding.get(loanId);
    if (!loanFunding || loanFunding.totalFunded === 0n) return { error: 201 };
    for (const [key, contribution] of this.lenderLoanContributions) {
      if (!key.endsWith(`-${loanId}`)) continue;
      const lender = key.split("-")[0];
      const lenderShare = (repaymentAmount * contribution) / loanFunding.totalFunded;
      if (lenderShare > 0n) {
        this.lenderBalances.set(lender, (this.lenderBalances.get(lender) || 0n) + lenderShare);
      }
    }
    loan.totalRepaid += repaymentAmount;
    if (loan.totalRepaid >= loan.amount + (loan.amount * loan.interestRate) / 10000n) {
      loan.status = "repaid";
    }
    this.loans.set(loanId, loan);
    return { value: true };
  }

  getLenderBalance(lender: string): { value: bigint } {
    return { value: this.lenderBalances.get(lender) || 0n };
  }

  getLoanFunding(loanId: bigint): { value: LoanFunding } {
    return { value: this.loanFunding.get(loanId) || { totalFunded: 0n, funded: false } };
  }
}

describe("Loan Contract Mock", () => {
  let mockContract: MockContract;

  beforeEach(() => {
    mockContract = new MockContract("STADMINADDRESS");
  });

  it("should allow lender to deposit funds", () => {
    const result = mockContract.deposit("STLENDER", 1000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getLenderBalance("STLENDER")).toEqual({ value: 1000n });
    expect(mockContract.totalPooled).toBe(1000n);
  });

  it("should prevent deposit when paused", () => {
    mockContract.setPaused("STADMINADDRESS", true);
    const result = mockContract.deposit("STLENDER", 1000n);
    expect(result).toEqual({ error: 203 });
  });

  it("should allow lender to withdraw funds", () => {
    mockContract.deposit("STLENDER", 1000n);
    const result = mockContract.withdraw("STLENDER", 500n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getLenderBalance("STLENDER")).toEqual({ value: 500n });
    expect(mockContract.totalPooled).toBe(500n);
  });

  it("should prevent withdrawal with insufficient balance", () => {
    mockContract.deposit("STLENDER", 100n);
    const result = mockContract.withdraw("STLENDER", 200n);
    expect(result).toEqual({ error: 202 });
  });

  it("should fund a loan", () => {
    mockContract.createLoan("STBORROWER", 1n, 1000n, 500n, 43200n);
    mockContract.deposit("STLENDER", 2000n);
    const result = mockContract.fundLoan("STLENDER", 1n, 1000n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getLenderBalance("STLENDER")).toEqual({ value: 1000n });
    expect(mockContract.getLoanFunding(1n)).toEqual({ value: { totalFunded: 1000n, funded: true } });
    expect(mockContract.loans.get(1n)?.status).toBe("active");
  });

  it("should prevent funding non-pending loan", () => {
    mockContract.createLoan("STBORROWER", 1n, 1000n, 500n, 43200n);
    mockContract.deposit("STLENDER", 2000n);
    mockContract.fundLoan("STLENDER", 1n, 1000n);
    const result = mockContract.fundLoan("STLENDER", 1n, 500n);
    expect(result).toEqual({ error: 206 });
  });

  it("should distribute repayment to multiple lenders", () => {
    mockContract.createLoan("STBORROWER", 1n, 1000n, 500n, 43200n);
    mockContract.deposit("STLENDER1", 1000n);
    mockContract.deposit("STLENDER2", 1000n);
    mockContract.fundLoan("STLENDER1", 1n, 500n);
    mockContract.fundLoan("STLENDER2", 1n, 500n);
    const result = mockContract.distributeRepayment("STADMINADDRESS", 1n, 600n);
    expect(result).toEqual({ value: true });
    expect(mockContract.getLenderBalance("STLENDER1")).toEqual({ value: 800n }); // 500 (remaining) + 300 (50% of 600)
    expect(mockContract.getLenderBalance("STLENDER2")).toEqual({ value: 800n }); // 500 (remaining) + 300 (50% of 600)
  });

  it("should mark loan as repaid when fully paid", () => {
    mockContract.createLoan("STBORROWER", 1n, 1000n, 500n, 43200n);
    mockContract.deposit("STLENDER", 1000n);
    mockContract.fundLoan("STLENDER", 1n, 1000n);
    const result = mockContract.distributeRepayment("STADMINADDRESS", 1n, 1500n); // 1000 principal + 500 interest
    expect(result).toEqual({ value: true });
    expect(mockContract.loans.get(1n)?.status).toBe("repaid");
    expect(mockContract.getLenderBalance("STLENDER")).toEqual({ value: 1500n });
  });

  it("should prevent non-admin from distributing repayment", () => {
    mockContract.createLoan("STBORROWER", 1n, 1000n, 500n, 43200n);
    mockContract.deposit("STLENDER", 1000n);
    mockContract.fundLoan("STLENDER", 1n, 1000n);
    const result = mockContract.distributeRepayment("STLENDER", 1n, 500n);
    expect(result).toEqual({ error: 200 });
  });
});