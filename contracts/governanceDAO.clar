;; GovernanceDAO Contract
;; Clarity v2
;; Manages decentralized governance for MicroloanHub, including proposals and voting

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u400)
(define-constant ERR-INVALID-AMOUNT u401)
(define-constant ERR-PROPOSAL-NOT-FOUND u402)
(define-constant ERR-PROPOSAL-INACTIVE u403)
(define-constant ERR-INSUFFICIENT-BALANCE u404)
(define-constant ERR-PAUSED u405)
(define-constant ERR-ZERO-ADDRESS u406)
(define-constant ERR-INVALID-CONTRACT u407)
(define-constant ERR-ALREADY-VOTED u408)
(define-constant ERR-VOTING-CLOSED u409)

;; Constants
(define-constant MIN-PROPOSAL-THRESHOLD u1000000) ;; Minimum tokens to propose (1M micro-units)
(define-constant VOTING_PERIOD u1440) ;; Voting period in blocks (~10 days at 10 min/block)
(define-constant QUORUM-PERCENT u5000) ;; 50% quorum (basis points)
(define-constant TOKEN-CONTRACT 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.mhl-token) ;; Governance token

;; Data variables
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var loan-factory principal 'SP000000000000000000002Q6VF78) ;; Placeholder
(define-data-var lending-pool principal 'SP000000000000000000002Q6VF78) ;; Placeholder
(define-data-var collateral-manager principal 'SP000000000000000000002Q6VF78) ;; Placeholder
(define-data-var proposal-count uint u0)

;; Data maps
(define-map proposals
  { proposal-id: uint }
  {
    proposer: principal,
    description: (string-ascii 256),
    target-contract: principal,
    target-function: (string-ascii 32),
    parameter: uint,
    votes-for: uint,
    votes-against: uint,
    start-block: uint,
    end-block: uint,
    executed: bool
  }
)
(define-map votes { proposal-id: uint, voter: principal } bool) ;; true = for, false = against
(define-map voter-tokens { proposal-id: uint, voter: principal } uint) ;; Tokens used for voting

;; Trait for fungible token (MHL-token)
(define-trait ft-trait
  (
    (transfer (uint principal principal (optional (buff 34))) (response bool uint))
    (get-balance (principal) (response uint uint))
  )
)

;; Event emissions
(define-private (emit-proposal-created (proposal-id uint) (proposer principal) (description (string-ascii 256)))
  (print {
    event: "proposal-created",
    proposal-id: proposal-id,
    proposer: proposer,
    description: description,
    block-height: block-height
  })
)

(define-private (emit-vote-cast (proposal-id uint) (voter principal) (in-favor bool) (tokens uint))
  (print {
    event: "vote-cast",
    proposal-id: proposal-id,
    voter: voter,
    in-favor: in-favor,
    tokens: tokens,
    block-height: block-height
  })
)

(define-private (emit-proposal-executed (proposal-id uint) (target-contract principal) (parameter uint))
  (print {
    event: "proposal-executed",
    proposal-id: proposal-id,
    target-contract: target-contract,
    parameter: parameter,
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

;; Private helper: validate contract
(define-private (validate-contract (contract principal))
  (and
    (asserts! (not (is-eq contract 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    true
  )
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (validate-contract new-admin) (err ERR-ZERO-ADDRESS))
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

;; Set integrated contracts
(define-public (set-contracts (factory principal) (pool principal) (collateral principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (validate-contract factory) (err ERR-ZERO-ADDRESS))
    (asserts! (validate-contract pool) (err ERR-ZERO-ADDRESS))
    (asserts! (validate-contract collateral) (err ERR-ZERO-ADDRESS))
    (var-set loan-factory factory)
    (var-set lending-pool pool)
    (var-set collateral-manager collateral)
    (ok true)
  )
)

;; Create a proposal
(define-public (create-proposal (description (string-ascii 256)) (target-contract principal) (target-function (string-ascii 32)) (parameter uint))
  (begin
    (ensure-not-paused)
    (asserts! (validate-contract target-contract) (err ERR-INVALID-CONTRACT))
    (let
      (
        (token-balance (try! (contract-call? TOKEN-CONTRACT get-balance tx-sender)))
        (proposal-id (+ (var-get proposal-count) u1))
      )
      (asserts! (>= token-balance MIN-PROPOSAL-THRESHOLD) (err ERR-INSUFFICIENT-BALANCE))
      (map-set proposals
        { proposal-id: proposal-id }
        {
          proposer: tx-sender,
          description: description,
          target-contract: target-contract,
          target-function: target-function,
          parameter: parameter,
          votes-for: u0,
          votes-against: u0,
          start-block: block-height,
          end-block: (+ block-height VOTING_PERIOD),
          executed: false
        }
      )
      (var-set proposal-count proposal-id)
      (emit-proposal-created proposal-id tx-sender description)
      (ok proposal-id)
    )
  )
)

;; Vote on a proposal
(define-public (vote (proposal-id uint) (in-favor bool) (tokens uint))
  (begin
    (ensure-not-paused)
    (asserts! (> tokens u0) (err ERR-INVALID-AMOUNT))
    (match (map-get? proposals { proposal-id: proposal-id })
      proposal
      (begin
        (asserts! (< block-height (get end-block proposal)) (err ERR-VOTING-CLOSED))
        (asserts! (not (get executed proposal)) (err ERR-PROPOSAL-INACTIVE))
        (asserts! (is-none (map-get? votes { proposal-id: proposal-id, voter: tx-sender })) (err ERR-ALREADY-VOTED))
        (let
          (
            (token-balance (try! (contract-call? TOKEN-CONTRACT get-balance tx-sender)))
          )
          (asserts! (>= token-balance tokens) (err ERR-INSUFFICIENT-BALANCE))
          (map-set votes { proposal-id: proposal-id, voter: tx-sender } in-favor)
          (map-set voter-tokens { proposal-id: proposal-id, voter: tx-sender } tokens)
          (map-set proposals
            { proposal-id: proposal-id }
            (merge proposal
              {
                votes-for: (if in-favor (+ (get votes-for proposal) tokens) (get votes-for proposal)),
                votes-against: (if in-favor (get votes-against proposal) (+ (get votes-against proposal) tokens))
              }
            )
          )
          (emit-vote-cast proposal-id tx-sender in-favor tokens)
          (ok true)
        )
      )
      (err ERR-PROPOSAL-NOT-FOUND)
    )
  )
)

;; Execute an approved proposal
(define-public (execute-proposal (proposal-id uint))
  (begin
    (ensure-not-paused)
    (match (map-get? proposals { proposal-id: proposal-id })
      proposal
      (begin
        (asserts! (>= block-height (get end-block proposal)) (err ERR-VOTING-CLOSED))
        (asserts! (not (get executed proposal)) (err ERR-PROPOSAL-INACTIVE))
        (let
          (
            (total-votes (+ (get votes-for proposal) (get votes-against proposal)))
            (token-supply (try! (contract-call? TOKEN-CONTRACT get-balance (as-contract tx-sender))))
            (quorum-required (/ (* token-supply QUORUM-PERCENT) u10000))
          )
          (asserts! (>= total-votes quorum-required) (err ERR-INVALID-AMOUNT))
          (asserts! (> (get votes-for proposal) (get votes-against proposal)) (err ERR-INVALID-AMOUNT))
          (map-set proposals { proposal-id: proposal-id } (merge proposal { executed: true }))
          (if (is-eq (get target-contract proposal) (var-get loan-factory))
            (try! (contract-call? (var-get loan-factory) set-max-interest-rate (get parameter proposal)))
            (if (is-eq (get target-contract proposal) (var-get collateral-manager))
              (try! (contract-call? (var-get collateral-manager) set-min-collateral-ratio (get parameter proposal)))
              (err ERR-INVALID-CONTRACT)
            )
          )
          (emit-proposal-executed proposal-id (get target-contract proposal) (get parameter proposal))
          (ok true)
        )
      )
      (err ERR-PROPOSAL-NOT-FOUND)
    )
  )
)

;; Read-only: get proposal details
(define-read-only (get-proposal (proposal-id uint))
  (match (map-get? proposals { proposal-id: proposal-id })
    proposal (ok proposal)
    (err ERR-PROPOSAL-NOT-FOUND)
  )
)

;; Read-only: get voter details
(define-read-only (get-voter-details (proposal-id uint) (voter principal))
  (ok {
    voted: (default-to false (map-get? votes { proposal-id: proposal-id, voter: voter })),
    tokens: (default-to u0 (map-get? voter-tokens { proposal-id: proposal-id, voter: voter }))
  })
)

;; Read-only: get proposal count
(define-read-only (get-proposal-count)
  (ok (var-get proposal-count))
)

;; Read-only: get admin
(define-read-only (get-admin)
  (ok (var-get admin))
)

;; Read-only: check if paused
(define-read-only (is-paused)
  (ok (var-get paused))
)

;; Read-only: get integrated contracts
(define-read-only (get-contracts)
  (ok {
    loan-factory: (var-get loan-factory),
    lending-pool: (var-get lending-pool),
    collateral-manager: (var-get collateral-manager)
  })
)