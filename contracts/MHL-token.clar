;; MHL-Token Contract
;; Clarity v2
;; Fungible token for MicroloanHub governance and platform interactions

;; Error codes
(define-constant ERR-NOT-AUTHORIZED u400)
(define-constant ERR-INVALID-AMOUNT u401)
(define-constant ERR-INSUFFICIENT-BALANCE u402)
(define-constant ERR-PAUSED u403)
(define-constant ERR-ZERO-ADDRESS u404)
(define-constant ERR-INVALID-RECIPIENT u405)

;; Constants
(define-constant CONTRACT-OWNER tx-sender)
(define-constant TOKEN-NAME "MicroloanHub Token")
(define-constant TOKEN-SYMBOL "MHL")
(define-constant TOKEN-DECIMALS u6)
(define-constant TOTAL-SUPPLY u1000000000000000) ;; 1 trillion micro-units (1M tokens at 6 decimals)
(define-constant MAX-MINT u100000000000000) ;; 100M micro-units per mint

;; Data variables
(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var total-supply uint TOTAL-SUPPLY)

;; Data maps
(define-map balances { owner: principal } uint)
(define-map allowances { owner: principal, spender: principal } uint)

;; SIP-010 trait
(define-fungible-token mhl-token)

;; Event emissions
(define-private (emit-transfer (sender principal) (recipient principal) (amount uint) (memo (optional (buff 34))))
  (print {
    event: "transfer",
    sender: sender,
    recipient: recipient,
    amount: amount,
    memo: memo,
    block-height: block-height
  })
)

(define-private (emit-mint (recipient principal) (amount uint))
  (print {
    event: "mint",
    recipient: recipient,
    amount: amount,
    block-height: block-height
  })
)

(define-private (emit-burn (owner principal) (amount uint))
  (print {
    event: "burn",
    owner: owner,
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

;; Private helper: validate principal
(define-private (validate-principal (principal principal))
  (asserts! (not (is-eq principal 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
)

;; SIP-010: Transfer
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (ensure-not-paused)
    (asserts! (is-eq tx-sender sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (validate-principal recipient) (err ERR-INVALID-RECIPIENT))
    (match (ft-get-balance mhl-token sender)
      balance
      (begin
        (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
        (try! (ft-transfer? mhl-token amount sender recipient))
        (emit-transfer sender recipient amount memo)
        (ok true)
      )
      (err ERR-INSUFFICIENT-BALANCE)
    )
  )
)

;; SIP-010: Get name
(define-read-only (get-name)
  (ok TOKEN-NAME)
)

;; SIP-010: Get symbol
(define-read-only (get-symbol)
  (ok TOKEN-SYMBOL)
)

;; SIP-010: Get decimals
(define-read-only (get-decimals)
  (ok TOKEN-DECIMALS)
)

;; SIP-010: Get total supply
(define-read-only (get-total-supply)
  (ok (var-get total-supply))
)

;; SIP-010: Get balance
(define-read-only (get-balance (owner principal))
  (ok (ft-get-balance mhl-token owner))
)

;; SIP-010: Get token URI
(define-read-only (get-token-uri)
  (ok (some "https://microloanhub.org/tokens/mhl-token.json"))
)

;; Mint tokens (admin only)
(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (<= amount MAX-MINT) (err ERR-INVALID-AMOUNT))
    (asserts! (validate-principal recipient) (err ERR-INVALID-RECIPIENT))
    (let
      (
        (new-supply (+ (var-get total-supply) amount))
      )
      (asserts! (<= new-supply TOTAL-SUPPLY) (err ERR-INVALID-AMOUNT))
      (try! (ft-mint? mhl-token amount recipient))
      (var-set total-supply new-supply)
      (emit-mint recipient amount)
      (ok true)
    )
  )
)

;; Burn tokens (admin only)
(define-public (burn (amount uint) (owner principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (asserts! (validate-principal owner) (err ERR-INVALID-RECIPIENT))
    (match (ft-get-balance mhl-token owner)
      balance
      (begin
        (asserts! (>= balance amount) (err ERR-INSUFFICIENT-BALANCE))
        (try! (ft-burn? mhl-token amount owner))
        (var-set total-supply (- (var-get total-supply) amount))
        (emit-burn owner amount)
        (ok true)
      )
      (err ERR-INSUFFICIENT-BALANCE)
    )
  )
)

;; Transfer admin rights
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (validate-principal new-admin) (err ERR-ZERO-ADDRESS))
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

;; Get allowance (SIP-010 extension)
(define-read-only (get-allowance (owner principal) (spender principal))
  (ok (default-to u0 (map-get? allowances { owner: owner, spender: spender })))
)

;; Approve spender (SIP-010 extension)
(define-public (approve (spender principal) (amount uint))
  (begin
    (ensure-not-paused)
    (asserts! (validate-principal spender) (err ERR-INVALID-RECIPIENT))
    (asserts! (> amount u0) (err ERR-INVALID-AMOUNT))
    (map-set allowances { owner: tx-sender, spender: spender } amount)
    (ok true)
  )
)

;; Initialize token with initial supply
(define-private (initialize)
  (begin
    (try! (ft-mint? mhl-token TOTAL-SUPPLY CONTRACT-OWNER))
    (ok true)
  )
)

;; Call initialize on deployment
(initialize)