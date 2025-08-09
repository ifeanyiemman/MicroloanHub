;; LendingPool Contract
;; Clarity v2
;; Manages lender deposits, loan funding, repayments, and interest distribution for the MicroloanHub platform

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-AMOUNT u201)
(define-constant ERR-INSUFFICIENT-BALANCE u202)
(define-constant ERR-PAUSED u203)
(define-constant ERR-ZERO-ADDRESS u204)
(define-constant ERR-LOAN-NOT-FOUND u205)
(define-constant ERR-LOAN-NOT-ACTIVE u206)
(define-constant ERR-INVALID-CONTRACT u207)
(define-constant ERR-ALREADY-FUNDED u208)

;; Constants
(define-constant MIN-DEPOSIT u100) ;; Minimum deposit (e.g., 100 micro-units of stablecoin)
(define-constant MAX-DEPOSIT u1000000000) ;; Maximum deposit (1M micro-units)
(define-constant TOKEN-CONTRACT 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-usda) ;; Example stablecoin contract

;; Data variables
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var loan-factory principal 'SP000000000000000000002Q6VF78) ;; Placeholder for LoanFactory contract
(define-data-var total-pooled uint u0)

;; Data maps
(define-map lender-balances principal uint) ;; Tracks available lender funds
(define-map lender-loan-contributions { lender: principal, loan-id: uint } uint) ;; Tracks per-loan contributions
(define-map loan-funding { loan-id: uint } { total-funded: uint, funded: bool }) ;; Tracks loan funding status

;; Trait for fungible token (e.g., USDA stablecoin)
(define-trait ft-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-balance (principal) (response uint uint))
  )
)

;; Event emissions
(define-private (emit-deposit (lender principal) (amount uint))
  (print {
    event: "deposit",
    lender: lender,
    amount: amount,
    block-height: block-height
  })
)

(define-private (emit-withdrawal (lender principal) (amount uint))
  (print {
    event: "withdrawal",
    lender: lender,
    amount: amount,
    block-height: block-height
  })
)

(define-private (emit-loan-funded (loan-id uint) (amount uint))
  (print {
    event: "loan-funded",
    loan-id: loan-id,
    amount: amount,
    block-height: block-height
  })
)

(define-private (emit-repayment-distributed (loan-id uint) (lender principal) (amount uint))
  (print {
    event: "repayment-distributed",
    loan-id: loan-id,
    lender: lender,
    amount: amount,
    block-height: block-height
  })
)

;; Private helper: is-admin
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Private helper: ensure not paused
(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

;; Private helper: validate amount
(define-private (validate-amount (amount uint))
  (and
    (asserts! (>= amount MIN-DEPOSIT) (err ERR-INVALID-AMOUNT))
    (asserts! (<= amount MAX-DEPOSIT) (err ERR-INVALID-AMOUNT))
    true
  )
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

;; Pause/unpause the contract
(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok pause)
  )
)

;; Set LoanFactory contract
(define-public (set-loan-factory (factory principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq factory 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set loan-factory factory)
    (ok true)
  )
)

;; Deposit funds into the pool
(define-public (deposit (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (validate-amount amount) (err ERR-INVALID-AMOUNT))
    (try! (contract-call? TOKEN-CONTRACT transfer amount tx-sender (as-contract tx-sender) none))
    (map-set lender-balances tx-sender (+ amount (default-to u0 (map-get? lender-balances tx-sender))))
    (var-set total-pooled (+ (var-get total-pooled) amount))
    (emit-deposit tx-sender amount)
    (ok true)
  )
)

;; Withdraw available funds
(define-public (withdraw (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (validate-amount amount) (err ERR-INVALID-AMOUNT))
    (let ((balance (default-to u0 (map-get? lender-balances tx-sender))))
      (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (try! (as-contract (contract-call? TOKEN-CONTRACT transfer amount tx-sender tx-sender none)))
      (map-set lender-balances tx-sender (- balance amount))
      (var-set total-pooled (- (var-get total-pooled) amount))
      (emit-withdrawal tx-sender amount)
      (ok true)
    )
  )
)

;; Fund a loan
(define-public (fund-loan (loan-id uint) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (validate-amount amount) (err ERR-INVALID-AMOUNT))
    (let
      (
        (lender-balance (default-to u0 (map-get? lender-balances tx-sender)))
        (loan-funding-data (default-to { total-funded: u0, funded: false } (map-get? loan-funding { loan-id: loan-id })))
      )
      (asserts! (>= lender-balance amount) (err ERR-INSUFFICIENT-BALANCE))
      (asserts! (not (get funded loan-funding-data)) (err ERR-ALREADY-FUNDED))
      ;; Verify loan exists and is pending via LoanFactory
      (match (contract-call? (var-get loan-factory) get-loan-details loan-id)
        loan
        (begin
          (asserts! (is-eq (get status loan) u0) (err ERR-LOAN-NOT-ACTIVE))
          (asserts! (<= amount (get amount loan)) (err ERR-INVALID-AMOUNT))
          (map-set lender-balances tx-sender (- lender-balance amount))
          (map-set lender-loan-contributions { lender: tx-sender, loan-id: loan-id } amount)
          (map-set loan-funding { loan-id: loan-id } { total-funded: (+ (get total-funded loan-funding-data) amount), funded: (is-eq (+ (get total-funded loan-funding-data) amount) (get amount loan)) })
          (if (is-eq (+ (get total-funded loan-funding-data) amount) (get amount loan))
            (try! (contract-call? (var-get loan-factory) update-loan-status loan-id u1))
            true
          )
          (emit-loan-funded loan-id amount)
          (ok true)
        )
        error (err ERR-LOAN-NOT-FOUND)
      )
    )
  )
)

;; Distribute repayment to lenders
(define-public (distribute-repayment (loan-id uint) (amount uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (ensure-not-paused)
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (match (contract-call? (var-get loan-factory) get-loan-details loan-id)
      loan
      (begin
        (asserts! (is-eq (get status loan) u1) (err ERR-LOAN-NOT-ACTIVE))
        (let
          (
            (total-funded (default-to u0 (get total-funded (map-get? loan-funding { loan-id: loan-id }))))
            (lender-contribution (default-to u0 (map-get? lender-loan-contributions { lender: tx-sender, loan-id: loan-id })))
          )
          (asserts! (> total-funded u0) (err ERR-INVALID-AMOUNT))
          (let
            (
              (lender-share (/ (* amount lender-contribution) total-funded))
            )
            (asserts! (> lender-share u0) (err ERR-INVALID-AMOUNT))
            (try! (as-contract (contract-call? TOKEN-CONTRACT transfer lender-share tx-sender tx-sender none)))
            (map-set lender-balances tx-sender (+ lender-share (default-to u0 (map-get? lender-balances tx-sender))))
            (emit-repayment-distributed loan-id tx-sender lender-share)
            (ok true)
          )
        )
      )
      error (err ERR-LOAN-NOT-FOUND)
    )
  )
)

;; Read-only: get lender balance
(define-read-only (get-lender-balance (lender principal))
  (ok (default-to u0 (map-get? lender-balances lender)))
)

;; Read-only: get loan funding details
(define-read-only (get-loan-funding (loan-id uint))
  (ok (default-to { total-funded: u0, funded: false } (map-get? loan-funding { loan-id: loan-id })))
)

;; Read-only: get lender contribution to a loan
(define-read-only (get-lender-contribution (lender principal) (loan-id uint))
  (ok (default-to u0 (map-get? lender-loan-contributions { lender: lender, loan-id: loan-id })))
)

;; Read-only: get total pooled funds
(define-read-only (get-total-pooled)
  (ok (var-get total-pooled))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: get loan factory
(define-read-only (get-loan-factory)
  (ok (var-get loan-factory))
)