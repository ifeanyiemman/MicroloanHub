# MicroloanHub

A blockchain-powered peer-to-peer microloan platform that empowers unbanked individuals and small-scale entrepreneurs to access affordable capital, while enabling lenders to earn fair returns—all on-chain with transparent, trustless smart contracts.

---

## Overview

MicroloanHub is a decentralized microloan platform built on the Stacks blockchain, leveraging Clarity smart contracts to facilitate secure, transparent lending and borrowing. The platform connects borrowers (e.g., small-scale entrepreneurs) with lenders globally, using stablecoins and tokenized collateral to ensure trust and reduce risk. It addresses financial exclusion by providing low-cost, accessible loans without intermediaries.

The platform consists of four main smart contracts:

1. **LoanFactory Contract** – Creates and tracks individual loan agreements.
2. **LendingPool Contract** – Manages lender funds and disburses them to borrowers.
3. **CollateralManager Contract** – Handles collateral deposits, valuation, and liquidation.
4. **GovernanceDAO Contract** – Enables community-driven governance and dispute resolution.

---

## Features

- **Loan Creation and Funding**: Borrowers post loan requests with customizable terms (amount, interest rate, duration); lenders fund them using stablecoins.
- **Collateral Management**: Supports tokenized collateral (e.g., STX, tokenized assets) to secure loans, reducing lender risk.
- **Automated Repayments**: Smart contracts enforce repayment schedules and handle defaults via collateral liquidation.
- **Community Governance**: A DAO allows token holders to vote on platform rules (e.g., interest rate caps) and resolve disputes.
- **Incentive System**: Governance tokens reward active participation by lenders, borrowers, and voters.
- **Transparency**: All transactions and loan terms are recorded on-chain for full auditability.
- **Scalability**: Built on Stacks, leveraging Bitcoin’s security and layer-2 efficiency for low-cost transactions.

---

## Smart Contracts

### LoanFactory Contract
- Creates and manages individual loan agreements.
- Tracks loan status (active, repaid, defaulted).
- Provides public functions to query loan details.
- Key Functions:
  - `(create-loan (borrower principal) (amount uint) (interest-rate uint) (duration uint))`: Initializes a loan.
  - `(get-loan-details (loan-id uint))`: Returns loan status and terms.
  - `(close-loan (loan-id uint))`: Marks a loan as repaid or defaulted.

### LendingPool Contract
- Pools lender funds and allocates them to approved loans.
- Manages deposits, withdrawals, and interest payouts.
- Ensures secure fund handling with stablecoin integration.
- Key Functions:
  - `(deposit (lender principal) (amount uint))`: Accepts lender funds.
  - `(fund-loan (loan-id uint) (amount uint))`: Allocates funds to a loan.
  - `(withdraw (lender principal) (amount uint))`: Distributes repaid funds or interest.

### CollateralManager Contract
- Manages borrower collateral deposits and liquidation.
- Integrates with oracles for real-time collateral valuation.
- Automates liquidation if a borrower defaults.
- Key Functions:
  - `(deposit-collateral (borrower principal) (loan-id uint) (token <ft-trait>) (amount uint))`: Locks collateral.
  - `(valuate-collateral (token <ft-trait>) (amount uint))`: Queries oracle for collateral value.
  - `(liquidate-collateral (loan-id uint))`: Liquidates collateral on default.

### GovernanceDAO Contract
- Facilitates community governance via a DAO.
- Allows token holders to propose and vote on platform rules.
- Handles dispute resolution for contested loans.
- Key Functions:
  - `(create-proposal (description string-ascii) (vote-threshold uint))`: Submits a governance proposal.
  - `(vote (voter principal) (proposal-id uint) (support bool))`: Records a vote.
  - `(execute-proposal (proposal-id uint))`: Implements approved proposals.

---

## Installation

1. Install [Clarinet CLI](https://docs.hiro.so/clarinet/getting-started) for Stacks development.
2. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/microloanhub.git
   ```
3. Install dependencies:
    ```bash
    npm install
    ```
4. Run tests:
    ```bash
    npm test
    ```
5. Deploy contracts to the Stacks testnet:
    ```bash
    clarinet deploy
    ```

## Usage

Each smart contract is designed to operate independently but integrates seamlessly to form the MicroloanHub ecosystem. To interact with the platform:

- Use a Stacks-compatible wallet (e.g., Hiro Wallet) to connect to the dApp.
- Borrowers can create loan requests via the LoanFactory contract.
- Lenders can deposit funds into the LendingPool and fund loans.
- Collateral is managed automatically by the CollateralManager.
- Governance token holders can participate in the DAO to vote on proposals or resolve disputes.

> Refer to individual contract documentation in the /contracts directory for detailed function calls and parameters.

## Example Workflow

- A borrower requests a $100 loan at 5% interest for 6 months, depositing $120 in STX as collateral.
- Lenders fund the loan via the LendingPool contract using a stablecoin (e.g., USDA).
- The LoanFactory contract creates the loan, and the CollateralManager locks the collateral.
- Repayments are automated; if the borrower defaults, the CollateralManager liquidates the STX.
- Token holders propose and vote on platform updates (e.g., interest rate caps) via the GovernanceDAO.

## License

MIT License