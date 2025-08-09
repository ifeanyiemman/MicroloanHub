import { describe, it, expect, beforeEach } from "vitest";

interface Balance {
  owner: string;
  amount: bigint;
}

interface Allowance {
  owner: string;
  spender: string;
  amount: bigint;
}

class MockTokenContract {
  admin: string;
  paused: boolean;
  totalSupply: bigint;
  balances: Map<string, bigint>;
  allowances: Map<string, bigint>;
  TOKEN_NAME: string = "MicroloanHub Token";
  TOKEN_SYMBOL: string = "MHL";
  TOKEN_DECIMALS: bigint = 6n;
  TOTAL_SUPPLY: bigint = 1000000000000000n; // 1 trillion micro-units
  MAX_MINT: bigint = 100000000000000n; // 100M micro-units
  CONTRACT_OWNER: string = "STCONTRACTOWNER";

  constructor(admin: string) {
    this.admin = admin;
    this.paused = false;
    this.totalSupply = this.TOTAL_SUPPLY;
    this.balances = new Map([[this.CONTRACT_OWNER, this.TOTAL_SUPPLY]]);
    this.allowances = new Map();
  }

  isAdmin(caller: string): boolean {
    return caller === this.admin;
  }

  validatePrincipal(principal: string): boolean {
    return principal !== "SP000000000000000000002Q6VF78";
  }

  transfer(caller: string, amount: bigint, sender: string, recipient: string): { value: boolean } | { error: number } {
    if (this.paused) return { error: 403 };
    if (caller !== sender) return { error: 400 };
    if (amount <= 0n) return { error: 401 };
    if (!this.validatePrincipal(recipient)) return { error: 405 };
    const balance = this.balances.get(sender) || 0n;
    if (balance < amount) return { error: 402 };
    this.balances.set(sender, balance - amount);
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    return { value: true };
  }

  mint(caller: string, amount: bigint, recipient: string): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 400 };
    if (amount <= 0n || amount > this.MAX_MINT) return { error: 401 };
    if (!this.validatePrincipal(recipient)) return { error: 405 };
    this.balances.set(recipient, (this.balances.get(recipient) || 0n) + amount);
    this.totalSupply += amount;
    return { value: true };
  }

  burn(caller: string, amount: bigint, owner: string): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 400 };
    if (amount <= 0n) return { error: 401 };
    if (!this.validatePrincipal(owner)) return { error: 405 };
    const balance = this.balances.get(owner) || 0n;
    if (balance < amount) return { error: 402 };
    this.balances.set(owner, balance - amount);
    this.totalSupply -= amount;
    return { value: true };
  }

  transferAdmin(caller: string, newAdmin: string): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 400 };
    if (!this.validatePrincipal(newAdmin)) return { error: 404 };
    this.admin = newAdmin;
    return { value: true };
  }

  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number } {
    if (!this.isAdmin(caller)) return { error: 400 };
    this.paused = pause;
    return { value: pause };
  }

  approve(caller: string, spender: string, amount: bigint): { value: boolean } | { error: number } {
    if (this.paused) return { error: 403 };
    if (!this.validatePrincipal(spender)) return { error: 405 };
    if (amount <= 0n) return { error: 401 };
    this.allowances.set(`${caller}-${spender}`, amount);
    return { value: true };
  }

  getName(): { value: string } {
    return { value: this.TOKEN_NAME };
  }

  getSymbol(): { value: string } {
    return { value: this.TOKEN_SYMBOL };
  }

  getDecimals(): { value: bigint } {
    return { value: this.TOKEN_DECIMALS };
  }

  getTotalSupply(): { value: bigint } {
    return { value: this.totalSupply };
  }

  getBalance(owner: string): { value: bigint } {
    return { value: this.balances.get(owner) || 0n };
  }

  getTokenUri(): { value: string } {
    return { value: "https://microloanhub.org/tokens/mhl-token.json" };
  }

  getAllowance(owner: string, spender: string): { value: bigint } {
    return { value: this.allowances.get(`${owner}-${spender}`) || 0n };
  }
}

describe("MHL-Token Contract", () => {
  let mockContract: MockTokenContract;

  beforeEach(() => {
    mockContract = new MockTokenContract("STADMINADDRESS");
  });

  it("should return token name", () => {
    const result = mockContract.getName();
    expect(result).toEqual({ value: "MicroloanHub Token" });
  });

  it("should return token symbol", () => {
    const result = mockContract.getSymbol();
    expect(result).toEqual({ value: "MHL" });
  });

  it("should return token decimals", () => {
    const result = mockContract.getDecimals();
    expect(result).toEqual({ value: 6n });
  });

  it("should return total supply", () => {
    const result = mockContract.getTotalSupply();
    expect(result).toEqual({ value: 1000000000000000n });
  });

  it("should return balance of owner", () => {
    const result = mockContract.getBalance("STCONTRACTOWNER");
    expect(result).toEqual({ value: 1000000000000000n });
  });

  it("should return token URI", () => {
    const result = mockContract.getTokenUri();
    expect(result).toEqual({ value: "https://microloanhub.org/tokens/mhl-token.json" });
  });

  it("should prevent non-admin from minting", () => {
    const result = mockContract.mint("STNONADMIN", 1000000000n, "STRECIPIENT");
    expect(result).toEqual({ error: 400 });
  });

  it("should prevent minting above max mint", () => {
    const result = mockContract.mint("STADMINADDRESS", 200000000000000n, "STRECIPIENT");
    expect(result).toEqual({ error: 401 });
  });

  it("should allow admin to burn tokens", () => {
    mockContract.balances.set("STRECIPIENT", 1000000000n);
    const result = mockContract.burn("STADMINADDRESS", 500000000n, "STRECIPIENT");
    expect(result).toEqual({ value: true });
    const balance = mockContract.getBalance("STRECIPIENT");
    expect(balance).toEqual({ value: 500000000n });
    const totalSupply = mockContract.getTotalSupply();
    expect(totalSupply).toEqual({ value: 1000000000000000n - 500000000n });
  });

  it("should prevent non-admin from burning", () => {
    mockContract.balances.set("STRECIPIENT", 1000000000n);
    const result = mockContract.burn("STNONADMIN", 500000000n, "STRECIPIENT");
    expect(result).toEqual({ error: 400 });
  });

  it("should prevent burning with insufficient balance", () => {
    mockContract.balances.set("STRECIPIENT", 100000000n);
    const result = mockContract.burn("STADMINADDRESS", 200000000n, "STRECIPIENT");
    expect(result).toEqual({ error: 402 });
  });

  it("should allow transfer", () => {
    mockContract.balances.set("STSENDER", 1000000000n);
    const result = mockContract.transfer("STSENDER", 500000000n, "STSENDER", "STRECIPIENT");
    expect(result).toEqual({ value: true });
    const senderBalance = mockContract.getBalance("STSENDER");
    expect(senderBalance).toEqual({ value: 500000000n });
    const recipientBalance = mockContract.getBalance("STRECIPIENT");
    expect(recipientBalance).toEqual({ value: 500000000n });
  });

  it("should prevent transfer with insufficient balance", () => {
    mockContract.balances.set("STSENDER", 100000000n);
    const result = mockContract.transfer("STSENDER", 200000000n, "STSENDER", "STRECIPIENT");
    expect(result).toEqual({ error: 402 });
  });

  it("should prevent transfer by non-sender", () => {
    mockContract.balances.set("STSENDER", 1000000000n);
    const result = mockContract.transfer("STNONSENDER", 500000000n, "STSENDER", "STRECIPIENT");
    expect(result).toEqual({ error: 400 });
  });

  it("should prevent transfer to zero address", () => {
    mockContract.balances.set("STSENDER", 1000000000n);
    const result = mockContract.transfer("STSENDER", 500000000n, "STSENDER", "SP000000000000000000002Q6VF78");
    expect(result).toEqual({ error: 405 });
  });

  it("should allow admin to transfer admin rights", () => {
    const result = mockContract.transferAdmin("STADMINADDRESS", "STNEWADMIN");
    expect(result).toEqual({ value: true });
    expect(mockContract.admin).toBe("STNEWADMIN");
  });

  it("should prevent non-admin from transferring admin rights", () => {
    const result = mockContract.transferAdmin("STNONADMIN", "STNEWADMIN");
    expect(result).toEqual({ error: 400 });
  });

  it("should allow admin to pause/unpause", () => {
    let result = mockContract.setPaused("STADMINADDRESS", true);
    expect(result).toEqual({ value: true });
    result = mockContract.setPaused("STADMINADDRESS", false);
    expect(result).toEqual({ value: false });
  });

  it("should prevent non-admin from pausing", () => {
    const result = mockContract.setPaused("STNONADMIN", true);
    expect(result).toEqual({ error: 400 });
  });

  it("should prevent transfers when paused", () => {
    mockContract.balances.set("STSENDER", 1000000000n);
    mockContract.setPaused("STADMINADDRESS", true);
    const result = mockContract.transfer("STSENDER", 500000000n, "STSENDER", "STRECIPIENT");
    expect(result).toEqual({ error: 403 });
  });

  it("should allow approving spender", () => {
    const result = mockContract.approve("STOWNER", "STSPENDER", 1000000000n);
    expect(result).toEqual({ value: true });
    const allowance = mockContract.getAllowance("STOWNER", "STSPENDER");
    expect(allowance).toEqual({ value: 1000000000n });
  });

  it("should prevent approving when paused", () => {
    mockContract.setPaused("STADMINADDRESS", true);
    const result = mockContract.approve("STOWNER", "STSPENDER", 1000000000n);
    expect(result).toEqual({ error: 403 });
  });
});