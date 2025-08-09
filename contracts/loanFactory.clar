;; LoanFactory Contract
;; Clarity v2
;; Manages creation, tracking, and status updates of microloan agreements for the MicroloanHub platform

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-AMOUNT u101)
(define-constant ERR-INVALID-DURATION u102)
(define-constant ERR-INVALID-INTEREST-RATE u103)
(define-constant ERR-LOAN-NOT-FOUND u104)
(define-constant ERR-LOAN-NOT-ACTIVE u105)
(define-constant ERR-PAUSED u106)
(define-constant ERR-ZERO-ADDRESS u107)
(define-constant ERR-INVALID-STATUS u108)
(define-constant ERR-DEADLINE-PASSED u109)

;; Constants
(define-constant MIN-LOAN-AMOUNT u100) ;; Minimum loan amount (in micro-units, e.g., 100 micro-STX = 0.0001 STX)
(define-constant MAX-LOAN-AMOUNT u1000000000) ;; Maximum loan amount (1M micro-units)
(define-constant MIN-INTEREST-RATE u100) ;; Minimum 1% (100 basis points)
(define-constant MAX-INTEREST-RATE u2000) ;; Maximum 20% (2000 basis points)
(define-constant MIN-DURATION u43200) ;; Minimum 30 days (in blocks, ~1440 blocks/day)
(define-constant MAX-DURATION u525600) ;; Maximum 1 year (in blocks)

;; Data variables
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var loan-counter uint u0)

;; Loan status enum
(define-constant STATUS-PENDING u0)
(define-constant STATUS-ACTIVE u1)
(define-constant STATUS-REPAID u2)
(define-constant STATUS-DEFAULTED u3)

;; Loan data structure
(define-map loans
  { loan-id: uint }
  {
    borrower: principal,
    amount: uint,
    interest-rate: uint,
    duration: uint,
    start-block: uint,
    deadline-block: uint,
    status: uint,
    total-repaid: uint,
    lending-pool: (optional principal),
    collateral-manager: (optional principal)
  }
)

;; Event emissions
(define-private (emit-loan-created (loan-id uint) (borrower principal) (amount uint) (interest-rate uint) (duration uint))
  (print {
    event: "loan-created",
    loan-id: loan-id,
    borrower: borrower,
    amount: amount,
    interest-rate: interest-rate,
    duration: duration,
    start-block: block-height
  })
)

(define-private (emit-loan-status-updated (loan-id uint) (status uint))
  (print {
    event: "loan-status-updated",
    loan-id: loan-id,
    status: status
  })
)

(define-private (emit-loan-repayment (loan-id uint) (amount uint))
  (print {
    event: "loan-repayment",
    loan-id: loan-id,
    amount: amount
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

;; Private helper: validate loan parameters
(define-private (validate-loan-params (amount uint) (interest-rate uint) (duration uint))
  (and
    (asserts! (and (>= amount MIN-LOAN-AMOUNT) (<= amount MAX-LOAN-AMOUNT)) (err ERR-INVALID-AMOUNT))
    (asserts! (and (>= interest-rate MIN-INTEREST-RATE) (<= interest-rate MAX-INTEREST-RATE)) (err ERR-INVALID-INTEREST-RATE))
    (asserts! (and (>= duration MIN-DURATION) (<= duration MAX-DURATION)) (err ERR-INVALID-DURATION))
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

;; Create a new loan
(define-public (create-loan (borrower principal) (amount uint) (interest-rate uint) (duration uint))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq borrower 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (validate-loan-params amount interest-rate duration) (err ERR-INVALID-AMOUNT))
    (let
      (
        (loan-id (+ (var-get loan-counter) u1))
        (start-block block-height)
        (deadline-block (+ start-block duration))
      )
      (map-set loans
        { loan-id: loan-id }
        {
          borrower: borrower,
          amount: amount,
          interest-rate: interest-rate,
          duration: duration,
          start-block: start-block,
          deadline-block: deadline-block,
          status: STATUS-PENDING,
          total-repaid: u0,
          lending-pool: none,
          collateral-manager: none
        }
      )
      (var-set loan-counter loan-id)
      (emit-loan-created loan-id borrower amount interest-rate duration)
      (ok loan-id)
    )
  )
)

;; Update loan status (e.g., mark as active, repaid, or defaulted)
(define-public (update-loan-status (loan-id uint) (new-status uint))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (ensure-not-paused)
    (match (map-get? loans { loan-id: loan-id })
      loan
      (begin
        (asserts! (or (is-eq new-status STATUS-ACTIVE) (is-eq new-status STATUS-REPAID) (is-eq new-status STATUS-DEFAULTED)) (err ERR-INVALID-STATUS))
        (asserts! (not (is-eq (get status loan) STATUS-REPAID)) (err ERR-INVALID-STATUS))
        (asserts! (not (is-eq (get status loan) STATUS-DEFAULTED)) (err ERR-INVALID-STATUS))
        (map-set loans
          { loan-id: loan-id }
          (merge loan { status: new-status })
        )
        (emit-loan-status-updated loan-id new-status)
        (ok true)
      )
      (err ERR-LOAN-NOT-FOUND)
    )
  )
)

;; Record a repayment
(define-public (record-repayment (loan-id uint) (amount uint))
  (begin
    (ensure-not-paused)
    (match (map-get? loans { loan-id: loan-id })
      loan
      (begin
        (asserts! (is-eq (get status loan) STATUS-ACTIVE) (err ERR-LOAN-NOT-ACTIVE))
        (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
        (asserts! (<= (+ (get total-repaid loan) amount) (+ (get amount loan) (/ (* (get amount loan) (get interest-rate loan)) u10000))) (err ERR-INVALID-AMOUNT))
        (map-set loans
          { loan-id: loan-id }
          (merge loan { total-repaid: (+ (get total-repaid loan) amount) })
        )
        (emit-loan-repayment loan-id amount)
        (ok true)
      )
      (err ERR-LOAN-NOT-FOUND)
    )
  )
)

;; Set lending pool and collateral manager for a loan
(define-public (set-loan-contracts (loan-id uint) (lending-pool (optional principal)) (collateral-manager (optional principal)))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (match (map-get? loans { loan-id: loan-id })
      loan
      (begin
        (asserts! (is-eq (get status loan) STATUS-PENDING) (err ERR-LOAN-NOT-ACTIVE))
        (map-set loans
          { loan-id: loan-id }
          (merge loan { lending-pool: lending-pool, collateral-manager: collateral-manager })
        )
        (ok true)
      )
      (err ERR-LOAN-NOT-FOUND)
    )
  )
)

;; Check if loan is overdue
(define-private (is-loan-overdue (loan { borrower: principal, amount: uint, interest-rate: uint, duration: uint, start-block: uint, deadline-block: uint, status: uint, total-repaid: uint, lending-pool: (optional principal), collateral-manager: (optional principal) }))
  (and
    (is-eq (get status loan) STATUS-ACTIVE)
    (> block-height (get deadline-block loan))
  )
)

;; Read-only: get loan details
(define-read-only (get-loan-details (loan-id uint))
  (match (map-get? loans { loan-id: loan-id })
    loan (ok loan)
    (err ERR-LOAN-NOT-FOUND)
  )
)

;; Read-only: get loan counter
(define-read-only (get-loan-counter)
  (ok (var-get loan-counter))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: check if loan is overdue
(define-read-only (is-loan-overdue-public (loan-id uint))
  (match (map-get? loans { loan-id: loan-id })
    loan (ok (is-loan-overdue loan))
    (err ERR-LOAN-NOT-FOUND)
  )
)