use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Listing has expired (past ttl_slot)")]
    ListingExpired,
    #[msg("Listing is not in Active status")]
    ListingNotActive,
    #[msg("Signer is not the buyer of this purchase")]
    NotBuyer,
    #[msg("Signer is not the supplier of this listing")]
    NotSupplier,
    #[msg("Payload has already been delivered")]
    AlreadyDelivered,
    #[msg("listing_id does not match supplier's counter")]
    ListingIdMismatch,
    #[msg("Supplier authority wallet does not match supplier agent")]
    UnauthorizedSupplier,
    #[msg("Handle exceeds 32 characters")]
    HandleTooLong,
    #[msg("CID exceeds 64 characters")]
    CidTooLong,
    #[msg("Payload has not been delivered yet")]
    NotDelivered,
    #[msg("Purchase has already been settled")]
    AlreadySettled,
    #[msg("Purchase has not been settled — buyer must pay before delivery")]
    NotSettled,
    #[msg("Purchase.listing does not match the Listing PDA passed")]
    PurchaseListingMismatch,
    #[msg("Purchase.price_paid_lamports does not match Listing.price_lamports")]
    PriceMismatch,
}
